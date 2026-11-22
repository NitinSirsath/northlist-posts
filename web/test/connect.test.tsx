import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPrompt } from '../pages/Connect';
import { base, me, mockApi, renderApp, space } from './utils';

const EXPECTED = `Connect NorthList Posts to this AI app. My spaces are already set up in the app.
Server: https://posts.example.com/mcp
Token: nlpost_secret123
1. Work in the NorthList Posts kit folder. If you are not in it, get it first: https://github.com/example/kit
2. Follow instructions/connect.md in the kit to add the server with this token. Never write the token into the kit folder or any file in it.
3. Then call get_profile and tell me which spaces you see.
4. If you can run scheduled tasks, run "daily" every morning.`;

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
      ...base,
      'GET /api/tokens': [],
      'POST /api/tokens': {
        token: {
          id: 't1',
          name: 'Antigravity',
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
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/tokens')?.body).toEqual({ name: 'Antigravity' });
    expect(screen.getByLabelText('Setup prompt')).toHaveTextContent('Token: nlpost_secret123');
    expect(screen.getByText('Shown once. Revoke it here if it leaks.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('nlpost_secret123'));
  });

  it('Space page: each account connects to this space, with the LinkedIn reconnect warning', async () => {
    mockApi({
      ...base,
      'GET /api/spaces': [
        {
          ...space,
          connections: [{ channel: 'LINKEDIN', spaceId: 'sp1', accountName: 'Your Name', expiresInDays: 12 }],
        },
      ],
    });
    renderApp('/space?channel=linkedin&connected=1');
    expect(await screen.findByText('LinkedIn is connected to this space.')).toBeInTheDocument();
    expect(await screen.findByText('Reconnect in 12 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute(
      'href',
      '/api/connect/linkedin/start?space=sp1&back=space',
    );
    expect(screen.getByRole('link', { name: 'Connect X' })).toHaveAttribute(
      'href',
      '/api/connect/x/start?space=sp1&back=space',
    );
  });

  it('shows alerts as not set up when the server has no key', async () => {
    mockApi({ ...base, 'GET /api/tokens': [] });
    renderApp('/connect');
    expect(await screen.findByText('Alerts are not set up on the server yet.')).toBeInTheDocument();
  });
});
