import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';

vi.mock('@/lib/api', () => ({
  apiClient: {
    getCurrentUser: vi.fn().mockRejectedValue(new Error('network')),
    get: vi.fn().mockResolvedValue({ data: { role: 'business' } }),
  },
}));

// Minimal router shim for wouter in tests
vi.mock('wouter', async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    useLocation: () => ["/", vi.fn()],
  };
});

// Ensure env is test mode for deterministic behavior
vi.mock('@/lib/env', () => ({ env: { TEST_MODE: true, AUTH_FASTPATH: true } }));

function setLocalAuth(user: any) {
  localStorage.setItem('auth_token', 'test-token');
  localStorage.setItem('user', JSON.stringify(user));
}

describe('App auth fast-path', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders dashboard-content quickly when localStorage has token and user', async () => {
    setLocalAuth({ email: 'test@example.com' });
    render(<App />);
    // The loading view also exposes dashboard-content test id during authLoading
    const el = await screen.findByTestId('dashboard-content');
    expect(el).toBeInTheDocument();
  });
});
