import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlanStep from '@/pages/plan-step';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}));

vi.mock('wouter', () => ({
  useParams: () => ({ projectId: undefined }),
}));

describe('PlanStep - resiliency states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the plan retry panel when the initial fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Server unavailable'));

    render(<PlanStep projectId="proj-timeout" journeyType="non-tech" renderAsContent />);

    expect(await screen.findByText(/Plan Unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Server unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Plan Creation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });
});

