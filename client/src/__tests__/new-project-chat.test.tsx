import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import NewProjectPage from '@/pages/new-project';

vi.mock('@/lib/env', () => ({ env: { TEST_MODE: true } }));

describe('NewProjectPage chat handler (test mode)', () => {
  it('adds agent message and clears input on send', async () => {
    render(<NewProjectPage />);

    const chat = await screen.findByTestId('agent-chat-interface');
    const textarea = within(chat).getByPlaceholderText(/describe what you want/i) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'Analyze revenue trends' } });
    expect(textarea.value).toContain('Analyze');

    const sendBtn = within(chat).getByRole('button', { name: /send/i });
    fireEvent.click(sendBtn);

    // Input should be cleared immediately
    expect(textarea.value).toBe('');

    // Agent message should appear shortly (stub uses setTimeout)
    const agentMsg = await screen.findByTestId('agent-message');
    expect(agentMsg).toBeInTheDocument();
  });
});
