import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { MessageCircle, Send, Bot, User, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AIChatProps {
  projectId: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  provider?: string;
}

export default function AIChat({ projectId }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const { toast } = useToast();

  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      const res = await apiRequest("POST", "/api/ai/query", {
        query,
        projectId
      });
      return res.json();
    },
    onSuccess: (data) => {
      const aiMessage: ChatMessage = {
        id: Date.now().toString() + '-ai',
        type: 'ai',
        content: data.response,
        timestamp: new Date(),
        provider: data.provider
      };
      setMessages(prev => [...prev, aiMessage]);
    },
    onError: (error: any) => {
      toast({
        title: "AI Query Failed",
        description: error.message || "Failed to process your question. Please check your AI settings.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString() + '-user',
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Send to AI
    queryMutation.mutate(input.trim());
    
    setInput("");
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <MessageCircle className="w-5 h-5 text-primary mr-2" />
          Ask Your Data
        </CardTitle>
        <p className="text-sm text-slate-600">
          Ask questions about your data in natural language
        </p>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              <Bot className="w-12 h-12 mx-auto mb-4 text-slate-400" />
              <p className="text-sm">Start by asking a question about your data</p>
              <p className="text-xs mt-2 text-slate-400">
                Example: "What are the top 5 categories by sales?"
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      {message.type === 'ai' && (
                        <Bot className="w-4 h-4 mt-0.5 text-slate-600" />
                      )}
                      {message.type === 'user' && (
                        <User className="w-4 h-4 mt-0.5 text-primary-foreground" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-xs ${
                            message.type === 'user' ? 'text-primary-foreground/80' : 'text-slate-500'
                          }`}>
                            {formatTime(message.timestamp)}
                          </span>
                          {message.provider && (
                            <span className="text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                              {message.provider}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {queryMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-lg p-3 max-w-[80%]">
                    <div className="flex items-center space-x-2">
                      <Bot className="w-4 h-4 text-slate-600" />
                      <div className="flex items-center space-x-1">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                        <span className="text-sm text-slate-600">Analyzing your data...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Form */}
        <div className="border-t border-slate-200 p-4">
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your data..."
              disabled={queryMutation.isPending}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={queryMutation.isPending || !input.trim()}
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}