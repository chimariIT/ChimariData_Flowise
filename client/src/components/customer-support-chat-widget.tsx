import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { MessageCircle, Send, X, Sparkles, ArrowRight, LifeBuoy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";

type ActionIntent = "conversion" | "navigation" | "activation" | "education";

interface SupportAction {
  label: string;
  route: string;
  intent: ActionIntent;
}

interface SupportMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  actions?: SupportAction[];
}

interface RouteHint {
  pageLabel: string;
  guidance: string;
  actions: SupportAction[];
}

const SUPPORT_CHAT_OPEN_KEY = "support_chat_open_v1";
const SUPPORT_CHAT_MESSAGES_KEY = "support_chat_messages_v1";
const SUPPORT_CHAT_CONVERSATION_KEY = "support_chat_conversation_v1";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseProjectIdFromPath(path: string): string | undefined {
  const match = path.match(/\/projects\/([^/]+)/i);
  return match?.[1];
}

function routeHintFor(path: string, isAuthenticated: boolean): RouteHint {
  const normalized = (path || "/").toLowerCase();

  const action = (label: string, route: string, intent: ActionIntent): SupportAction => ({ label, route, intent });

  if (normalized.startsWith("/pricing")) {
    return {
      pageLabel: "Pricing",
      guidance: "I can help compare tiers and point you to the best next step.",
      actions: [
        action("Start Free Trial", "/auth/register", "conversion"),
        action("Book Consultation", "/expert-consultation", "conversion"),
        action("View Demo", "/demos", "education"),
      ],
    };
  }

  if (normalized.startsWith("/demos")) {
    return {
      pageLabel: "Demos",
      guidance: "I can route you to the journey that best matches your audience and goals.",
      actions: [
        action("Try AI Guided", "/ai-guided", "activation"),
        action("See Pricing", "/pricing", "conversion"),
        action("Book Consultation", "/expert-consultation", "conversion"),
      ],
    };
  }

  if (normalized.startsWith("/expert-consultation")) {
    return {
      pageLabel: "Expert Consultation",
      guidance: "I can help shape your challenge statement before you submit.",
      actions: [
        action("Continue Here", "/expert-consultation", "conversion"),
        action("See Pricing", "/pricing", "conversion"),
        action("Try AI Guided", "/ai-guided", "activation"),
      ],
    };
  }

  if (normalized.startsWith("/journeys")) {
    return {
      pageLabel: "Journey Setup",
      guidance: "I can guide you to the fastest setup and reduce drop-off.",
      actions: [
        action("Open Data Upload", "/journeys/non-tech/data", "activation"),
        action("Go To Dashboard", "/dashboard", "navigation"),
        action("Get Plan Help", "/journeys/non-tech/prepare", "navigation"),
      ],
    };
  }

  if (normalized.startsWith("/dashboard") || normalized.startsWith("/projects")) {
    return {
      pageLabel: "Workspace",
      guidance: "I can help you move to the right next page and unblock setup.",
      actions: [
        action("Start Analysis", "/ai-guided", "activation"),
        action("Upload Data", "/journeys/non-tech/data", "activation"),
        action("Open Pricing", "/pricing", "conversion"),
      ],
    };
  }

  if (normalized.startsWith("/auth")) {
    return {
      pageLabel: "Sign In",
      guidance: "I can point you to the quickest way to start your first analysis.",
      actions: [
        action("View Pricing", "/pricing", "conversion"),
        action("Open Demos", "/demos", "education"),
        action("Book Consultation", "/expert-consultation", "conversion"),
      ],
    };
  }

  const defaultActions: SupportAction[] = isAuthenticated
    ? [
        action("Go To Dashboard", "/dashboard", "navigation"),
        action("Start Analysis", "/ai-guided", "activation"),
        action("Open Pricing", "/pricing", "conversion"),
      ]
    : [
        action("Start Free Trial", "/auth/register", "conversion"),
        action("See Pricing", "/pricing", "conversion"),
        action("View Demo", "/demos", "education"),
      ];

  return {
    pageLabel: "Current Page",
    guidance: "I can answer questions and guide your next step.",
    actions: defaultActions,
  };
}

function anonymousReply(message: string, hint: RouteHint): { content: string; actions: SupportAction[] } {
  const lower = message.toLowerCase();

  if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
    return {
      content: "I can help compare plans fast. Open Pricing and I will guide you to the best fit.",
      actions: [
        { label: "Open Pricing", route: "/pricing", intent: "conversion" },
        { label: "Start Free Trial", route: "/auth/register", intent: "conversion" },
      ],
    };
  }

  if (lower.includes("demo") || lower.includes("example") || lower.includes("sample")) {
    return {
      content: "Demos are the best next step for evaluation. Want to jump there now?",
      actions: [
        { label: "Open Demos", route: "/demos", intent: "education" },
        { label: "Book Consultation", route: "/expert-consultation", intent: "conversion" },
      ],
    };
  }

  if (lower.includes("consult") || lower.includes("expert") || lower.includes("advisor")) {
    return {
      content: "Great choice. Expert consultation helps accelerate high-stakes decisions.",
      actions: [{ label: "Book Consultation", route: "/expert-consultation", intent: "conversion" }],
    };
  }

  if (lower.includes("where") || lower.includes("navigate") || lower.includes("next")) {
    return {
      content: `On ${hint.pageLabel}, the best next step is usually one of these options.`,
      actions: hint.actions.slice(0, 3),
    };
  }

  return {
    content:
      "I can help with navigation, setup, and choosing the best next step. Tell me your goal and I will route you.",
    actions: hint.actions.slice(0, 3),
  };
}

export function CustomerSupportChatWidget() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teaser, setTeaser] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(localStorage.getItem("auth_token")));

  const engagedRoutesRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentHint = useMemo(() => routeHintFor(location, isAuthenticated), [location, isAuthenticated]);

  useEffect(() => {
    try {
      const storedOpen = localStorage.getItem(SUPPORT_CHAT_OPEN_KEY);
      const storedMessages = localStorage.getItem(SUPPORT_CHAT_MESSAGES_KEY);
      const storedConversation = localStorage.getItem(SUPPORT_CHAT_CONVERSATION_KEY);

      if (storedOpen) {
        setIsOpen(storedOpen === "true");
      }
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages) as SupportMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed.slice(-40));
        }
      }
      if (storedConversation) {
        setConversationId(storedConversation);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SUPPORT_CHAT_OPEN_KEY, String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem(SUPPORT_CHAT_MESSAGES_KEY, JSON.stringify(messages.slice(-40)));
  }, [messages]);

  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(SUPPORT_CHAT_CONVERSATION_KEY, conversationId);
    } else {
      localStorage.removeItem(SUPPORT_CHAT_CONVERSATION_KEY);
    }
  }, [conversationId]);

  useEffect(() => {
    const syncAuth = () => setIsAuthenticated(Boolean(localStorage.getItem("auth_token")));
    window.addEventListener("storage", syncAuth);
    window.addEventListener("auth-token-stored", syncAuth);
    window.addEventListener("auth-token-cleared", syncAuth);
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("auth-token-stored", syncAuth);
      window.removeEventListener("auth-token-cleared", syncAuth);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isAuthenticated || !conversationId) {
      return;
    }

    let cancelled = false;
    apiClient
      .get(`/api/conversation/${conversationId}`)
      .then((response: any) => {
        if (cancelled) return;
        const conversation = response?.conversation;
        const backendMessages = Array.isArray(conversation?.messages) ? conversation.messages : [];
        if (backendMessages.length === 0) return;
        const hydrated = backendMessages
          .slice(-40)
          .map((item: any, index: number): SupportMessage => ({
            id: String(item?.id || `hydrated_${index}`),
            role: item?.role === "user" ? "user" : "assistant",
            content: String(item?.content || ""),
            createdAt: String(item?.timestamp || new Date().toISOString()),
            actions: Array.isArray(item?.meta?.navigationSuggestions) ? item.meta.navigationSuggestions : undefined,
          }));
        setMessages(hydrated);
      })
      .catch((error: any) => {
        const status = error?.status;
        if (status === 404 || status === 403) {
          setConversationId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, isAuthenticated]);

  useEffect(() => {
    const routeKey = location || "/";
    if (engagedRoutesRef.current.has(routeKey)) {
      return;
    }

    const timer = setTimeout(() => {
      if (engagedRoutesRef.current.has(routeKey)) {
        return;
      }
      engagedRoutesRef.current.add(routeKey);

      const proactiveMessage: SupportMessage = {
        id: makeId("proactive"),
        role: "assistant",
        content: `Need a quick hand on ${currentHint.pageLabel}? ${currentHint.guidance}`,
        createdAt: new Date().toISOString(),
        actions: currentHint.actions.slice(0, 3),
      };

      setMessages((prev) => [...prev.slice(-39), proactiveMessage]);

      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
        setTeaser(`Help on ${currentHint.pageLabel}`);
      }
    }, 6500);

    return () => clearTimeout(timer);
  }, [location, currentHint, isOpen]);

  const pushActionMessage = (content: string, actions: SupportAction[]) => {
    const assistantMessage: SupportMessage = {
      id: makeId("assistant"),
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      actions: actions.slice(0, 3),
    };
    setMessages((prev) => [...prev.slice(-39), assistantMessage]);
    if (!isOpen) {
      setUnreadCount((prev) => prev + 1);
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);

    const userMessage: SupportMessage = {
      id: makeId("user"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev.slice(-39), userMessage]);

    const contextPayload = {
      route: location,
      pageTitle: document.title,
      source: "customer_support_widget",
      projectId: parseProjectIdFromPath(location),
    };

    try {
      if (isAuthenticated) {
        let activeConversationId = conversationId;

        if (!activeConversationId) {
          const startResp: any = await apiClient.post("/api/conversation/start", {
            projectId: parseProjectIdFromPath(location),
            context: contextPayload,
          });
          activeConversationId = String(startResp?.conversationId || "");
          if (activeConversationId) {
            setConversationId(activeConversationId);
          }

          const welcomeText = String(startResp?.welcomeMessage || "").trim();
          const welcomeActions = Array.isArray(startResp?.navigationSuggestions)
            ? (startResp.navigationSuggestions as SupportAction[])
            : [];
          if (welcomeText) {
            pushActionMessage(welcomeText, welcomeActions);
          }
        }

        if (!activeConversationId) {
          const fallback = anonymousReply(trimmed, currentHint);
          pushActionMessage(fallback.content, fallback.actions);
          return;
        }

        const continueResp: any = await apiClient.post(`/api/conversation/${activeConversationId}/continue`, {
          message: trimmed,
          context: contextPayload,
        });

        const replyText = String(continueResp?.reply || "").trim();
        const replyActions = Array.isArray(continueResp?.navigationSuggestions)
          ? (continueResp.navigationSuggestions as SupportAction[])
          : currentHint.actions;
        pushActionMessage(
          replyText || "I can help with that. Want me to guide you to the best next page?",
          replyActions,
        );
      } else {
        const fallback = anonymousReply(trimmed, currentHint);
        pushActionMessage(fallback.content, fallback.actions);
      }
    } catch {
      const fallback = anonymousReply(trimmed, currentHint);
      pushActionMessage(
        `${fallback.content} I can still guide you right now.`,
        fallback.actions,
      );
    } finally {
      setIsSending(false);
    }
  };

  const openWidget = () => {
    setIsOpen(true);
    setUnreadCount(0);
    setTeaser(null);
  };

  const runAction = (action: SupportAction) => {
    setLocation(action.route);
    const confirmation: SupportMessage = {
      id: makeId("assistant"),
      role: "assistant",
      content: `Taking you to ${action.label}.`,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev.slice(-39), confirmation]);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <>
      {!isOpen && teaser && (
        <button
          type="button"
          className="fixed bottom-20 right-4 z-[70] max-w-[260px] rounded-md border bg-white px-3 py-2 text-left shadow"
          onClick={openWidget}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            Proactive Support
          </div>
          <div className="mt-1 text-xs text-slate-700">{teaser}</div>
        </button>
      )}

      {!isOpen && (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-4 right-4 z-[80] h-12 w-12 rounded-full shadow-lg"
          onClick={openWidget}
          aria-label="Open support chat"
        >
          <MessageCircle className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      )}

      {isOpen && (
        <Card className="fixed bottom-4 right-4 z-[80] flex h-[560px] w-[360px] flex-col shadow-2xl">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LifeBuoy className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-base">Customer Support</CardTitle>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-600">{currentHint.guidance}</p>
            <div className="flex flex-wrap gap-1">
              {currentHint.actions.slice(0, 3).map((actionItem) => (
                <Button
                  key={`header_${actionItem.label}_${actionItem.route}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => runAction(actionItem)}
                >
                  {actionItem.label}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <ScrollArea className="min-h-0 flex-1 px-3 py-3">
              <div className="space-y-3">
                {messages.length === 0 && (
                  <div className="rounded border bg-slate-50 p-3 text-xs text-slate-600">
                    Ask for navigation help, setup guidance, or the fastest next step.
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "border bg-white text-slate-800"
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                      {message.actions && message.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {message.actions.slice(0, 3).map((actionItem) => (
                            <Button
                              key={`${message.id}_${actionItem.label}_${actionItem.route}`}
                              type="button"
                              variant={message.role === "user" ? "secondary" : "outline"}
                              size="sm"
                              className="h-6 text-[11px]"
                              onClick={() => runAction(actionItem)}
                            >
                              {actionItem.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] opacity-70">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Ask a question or ask where to go next..."
                  disabled={isSending}
                />
                <Button type="button" size="icon" onClick={() => void sendMessage()} disabled={isSending || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default CustomerSupportChatWidget;
