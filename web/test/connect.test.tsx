import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPrompt } from '../pages/Connect';
import { me, mockApi, renderApp } from './utils';

const EXPECTED = `Connect NorthList Posts to this AI app, then set up my profile.
Server: https://posts.example.com/mcp
Token: nlpost_secret123
1. Work in the NorthList Posts kit folder. If you are not in it, get it first: https://github.com/example/kit
2. Follow instructions/connect.md in the kit to add the server with this token. Never write the token into the kit folder or any file in it.
3. Then follow instructions/setup.md and ask me the setup questions.`;

describe('Connect', () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  it('builds the setup prompt with the server, token and kit', () => {
    expect(setupPrompt({ mcpUrl: me.mcpUrl, kitUrl: me.kitUrl, token: 'nlpost_secret123' })).toBe(EXPECTED);
  });

  it('creates a token, copies the setup prompt and shows it once', async () => {
    const calls = mockApi({
      'GET /api/me': me,
      'GET /api/tokens': [],
      'GET /api/connections': [],
      'POST /api/tokens': {
        token: {
          id: 't1',
          name: 'Claude Code',
          displayPrefix: 'nlpost_secre',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 1e10).toISOString(),
          lastUsedAt: null,
          status: 'active',
        },
        plaintext: 'nlpost_secret123',
      },
    });
    renderApp('/connect');

    fireEvent.click(await screen.findByRole('button', { name: 'Create and copy setup prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(EXPECTED));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/tokens')?.body).toEqual({ name: 'Claude Code' });
    expect(screen.getByLabelText('Setup prompt')).toHaveTextContent('Token: nlpost_secret123');
    expect(screen.getByText('Shown once. Revoke it here if it leaks.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('nlpost_secret123'));
  });

  it('shows the LinkedIn reconnect warning and a banner after connecting', async () => {
    mockApi({
      'GET /api/me': me,
      'GET /api/tokens': [],
      'GET /api/connections': [{ channel: 'LINKEDIN', accountName: 'Your Name', expiresInDays: 12 }],
    });
    renderApp('/connect?channel=linkedin&connected=1');
    expect(await screen.findByText('LinkedIn is connected.')).toBeInTheDocument();
    expect(await screen.findByText('Reconnect in 12 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', '/api/connect/linkedin/start');
    expect(screen.getByRole('link', { name: 'Connect X' })).toHaveAttribute('href', '/api/connect/x/start');
    expect(screen.getByText('Alerts are not set up on the server yet.')).toBeInTheDocument();
  });
});
