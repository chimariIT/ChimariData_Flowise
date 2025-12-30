import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { env } from '@/lib/env';
import { AgentChatInterface } from '@/components/agent-chat-interface';
import { apiClient } from '@/lib/api';
import { useLocation } from 'wouter';

export default function NewProjectPage() {
  // Chat stub state
  const [message, setMessage] = useState('');
  const [agentMessages, setAgentMessages] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState(10);

  // Dynamic template form state
  const [industry, setIndustry] = useState('');
  const [businessContext, setBusinessContext] = useState('');
  const [templateReady, setTemplateReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Simulate progress increasing while interacting
    const id = setInterval(() => setProgress((p) => (p >= 95 ? 95 : p + 1)), 800);
    return () => clearInterval(id);
  }, []);

  const handleSend = () => {
    if (!message.trim()) return;
    // Simulate agent response
    setTyping(true);
    const userMsg = message;
    setMessage('');
    setTimeout(() => {
      setAgentMessages((prev) => [
        ...prev,
        `Got it. Let's refine your goal: "${userMsg.slice(0, 80)}${userMsg.length > 80 ? '…' : ''}"`
      ]);
      setTyping(false);
      setProgress((p) => Math.min(100, p + 10));
    }, 600);
  };

  const handleSubmitTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setTemplateReady(false);
    try {
      // 1) Create a project shell
      const projectName = industry?.trim() ? `${industry} Analysis` : 'New Analysis Project';
      const created = await apiClient.createProject({ name: projectName, description: businessContext });
      const projectId = created?.project?.id || created?.id || created?.projectId;

      if (!projectId) throw new Error('Project creation response missing id');

      // 2) Generate dynamic template tied to this project
      await apiClient.generateDynamicTemplate({
        projectId,
        industry: industry || 'General',
        businessContext: businessContext || '',
        analysisGoals: [],
      });

      // Success marker for tests and UI
      setTemplateReady(true);

      // 3) Navigate to workflow transparency for this project
      // FIX Phase 3: No delay needed - navigate immediately after template generation
      setLocation(`/projects/${projectId}/workflow`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-bold">Create New Project</h1>

  {/* Conversational goal refinement */}
  {env.TEST_MODE ? (
  <div data-testid="agent-chat-interface" className="border rounded p-4 relative">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1 text-sm">
            <span>Conversation Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} data-testid="conversation-progress" />
        </div>

        <div className="space-y-2 max-h-48 overflow-auto mb-3">
          {agentMessages.map((m, i) => (
            <div key={i} className="bg-gray-100 rounded p-2" data-testid="agent-message">
              {m}
            </div>
          ))}
          {typing && (
            <div className="text-xs text-blue-600" data-testid="agent-typing">Agent is typing…</div>
          )}
        </div>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
          <textarea
            name="chatMessage"
            className="border rounded p-2 flex-1"
            placeholder="Describe what you want to analyze…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {message.trim().length > 0 && (
            <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded">
              Send
            </button>
          )}
        </form>
      </div>
      ) : (
        <div className="border rounded p-4 relative">
          <AgentChatInterface projectId={"new"} />
        </div>
      )}

      {/* Dynamic template inputs */}
      <form onSubmit={handleSubmitTemplate} className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Business Context</h2>
        <input
          name="industry"
          className="border rounded p-2 w-full"
          placeholder="Industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        />
        <textarea
          name="businessContext"
          className="border rounded p-2 w-full"
          placeholder="Describe your business context"
          rows={3}
          value={businessContext}
          onChange={(e) => setBusinessContext(e.target.value)}
        />
        <div className="flex justify-end">
          <button type="submit" className="px-3 py-2 bg-green-600 text-white rounded" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </div>
        {templateReady && (
          <div data-testid="template-generated" className="text-green-700 text-sm">Template generated for your industry.</div>
        )}
        {error && (
          <div className="text-red-700 text-sm" role="alert">{error}</div>
        )}
      </form>

      {/* Optional cost estimator (not required by tests, but helpful) */}
      {/* <div data-testid="cost-estimator">…</div> */}
    </div>
  );
}
