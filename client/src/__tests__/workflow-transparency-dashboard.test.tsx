import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkflowTransparencyDashboard } from '@/components/workflow-transparency-dashboard';

// Mock API to return empty data so the component uses its internal fallbacks
vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn((url: string) => {
      if (url.includes('/api/workflow/transparency/')) {
        return Promise.resolve({ data: { steps: [] } });
      }
      if (url.includes('/api/agents/activities/')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/api/workflow/decisions/')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    }),
  },
}));

vi.mock('@/lib/env', () => ({ env: { TEST_MODE: true } }));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('WorkflowTransparencyDashboard - fallbacks and decision safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fallback workflow steps and agent activities when API returns empty data', async () => {
  renderWithClient(<WorkflowTransparencyDashboard projectId="p1" />);

  // Wait for initial loading spinner to disappear
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2000 });
  const dashboard = await screen.findByTestId('workflow-transparency-dashboard');
    expect(dashboard).toBeInTheDocument();

    const steps = await screen.findAllByTestId('workflow-step');
    expect(steps.length).toBeGreaterThanOrEqual(3);

    // Navigate to Agent Activities tab and ensure fallback agent cards render
  const agentsTab = screen.getByText(/agent activities/i);
  await userEvent.click(agentsTab);

  const pmCard = await screen.findByTestId('agent-card-project-manager', {}, { timeout: 3000 });
    expect(pmCard).toBeInTheDocument();
    const dsCard = await screen.findByTestId('agent-card-data-scientist');
    expect(dsCard).toBeInTheDocument();
    const baCard = await screen.findByTestId('agent-card-business-agent');
    expect(baCard).toBeInTheDocument();
  });

  it('shows safe decision details: text, reasoning, confidence, and impact tag', async () => {
    renderWithClient(<WorkflowTransparencyDashboard projectId="p1" />);

    // Wait for load and switch to Decision Trail
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2000 });
    const decisionsTab = screen.getByText(/decision trail/i);
    await userEvent.click(decisionsTab);

    const entry = await screen.findByTestId('decision-entry', {}, { timeout: 3000 });
    expect(entry).toBeInTheDocument();

    const decisionText = within(entry).getByTestId('decision-text');
    expect(decisionText.textContent || '').toMatch(/focus on q4 cohort/i);

    const reasoning = within(entry).getByTestId('decision-reasoning');
    expect(reasoning.textContent || '').toMatch(/highest variance/i);

    const confidence = within(entry).getByTestId('decision-confidence');
    expect(confidence.textContent || '').toMatch(/85% confidence/i);

    // Impact badge text
    expect(within(entry).getByText(/high impact/i)).toBeInTheDocument();

    // Alternatives section appears since fallback includes alternatives
    expect(within(entry).getByText(/alternatives considered/i)).toBeInTheDocument();
  });
});
