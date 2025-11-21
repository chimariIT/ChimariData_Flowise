import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JourneyLifecycleIndicator } from '@/components/JourneyLifecycleIndicator';

const mockUseJourneyState = vi.fn();
const mockSetLocation = vi.fn();
const mockGetResumeRoute = vi.fn();

vi.mock('@/hooks/useJourneyState', () => ({
  useJourneyState: (...args: any[]) => mockUseJourneyState(...args),
}));

vi.mock('@/utils/journey-routing', () => ({
  getResumeRoute: (...args: any[]) => mockGetResumeRoute(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['', mockSetLocation],
}));

describe('JourneyLifecycleIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while journey data is resolving', () => {
    mockUseJourneyState.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(<JourneyLifecycleIndicator projectId="proj-loading" />);

    expect(screen.getByText(/Loading journey state/i)).toBeInTheDocument();
  });

  it('shows retry panel when the hook surfaces an error', async () => {
    const refetch = vi.fn();
    mockUseJourneyState.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Failed to query journey state'),
      refetch,
      isFetching: false,
    });

    render(<JourneyLifecycleIndicator projectId="proj-error" />);

    expect(screen.getByText(/Unable to fetch progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to query journey state/i)).toBeInTheDocument();

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    const initialCalls = refetch.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it('renders lifecycle metrics and resumes journey when requested', async () => {
    mockGetResumeRoute.mockResolvedValue('/projects/proj-ready/plan');

    mockUseJourneyState.mockReturnValue({
      data: {
        currentStep: { id: 'plan', name: 'Plan', index: 1 },
        steps: [
          { id: 'prepare', name: 'Prepare', description: 'Upload data', agent: 'data_engineer' },
          { id: 'plan', name: 'Plan', description: 'Coordinate agents', agent: 'project_manager' },
          { id: 'execute', name: 'Execute', description: 'Run analytics', agent: 'data_scientist' },
        ],
        completedSteps: ['prepare'],
        percentComplete: 45,
        estimatedTimeRemaining: '12m',
        costs: { estimated: 2500, spent: 900, remaining: 1600 },
        canResume: true,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(<JourneyLifecycleIndicator projectId="proj-ready" />);

    expect(screen.getByTestId('journey-lifecycle')).toBeInTheDocument();
    expect(screen.getByText(/Overall Progress/i)).toBeInTheDocument();
    expect(screen.getByTestId('journey-cost-locked')).toHaveTextContent('$2,500.00');
    expect(screen.getByTestId('journey-cost-spent')).toHaveTextContent('$900.00');
    expect(screen.getByTestId('journey-cost-remaining')).toHaveTextContent('$1,600.00');

    fireEvent.click(screen.getByRole('button', { name: /Resume Journey/i }));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/projects/proj-ready/plan');
    });
    expect(mockGetResumeRoute).toHaveBeenCalledWith('proj-ready', expect.any(Object));
  });
});

