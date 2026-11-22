import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { idea, me, mockApi, post, renderApp, space } from './utils';

describe('Today', () => {
  it('lists drafts as New, Earlier and Posted with X and LinkedIn logos, and opens the picked one', async () => {
    const yesterday = new Date(Date.now() - 30 * 3_600_000).toISOString();
    const posted = post({ channel: 'X', status: 'POSTED', postedAt: new Date().toISOString() });
    mockApi({
      'GET /api/me': me,
      'GET /api/spaces': [space],
      'GET /api/ideas/today?space=sp1': [
        idea({
          id: 'n1',
          kind: 'NEWS',
          title: 'Compiler news',
          sourceName: 'Frontend Weekly',
          linkedinText: 'Long text',
        }),
        idea({
          id: 's1',
          kind: 'SHIPPED',
          title: 'Phone app is calmer',
          mentionsProduct: true,
          xText: 'Calm',
          linkedinText: 'Calm',
        }),
        idea({ id: 'd1', title: 'All posted', posts: [posted] }),
        idea({ id: 'o1', title: 'From yesterday', createdAt: yesterday }),
        idea({
          kind: 'REPLY',
          title: 'A reply',
          replyTo: { url: 'https://x.com/a/status/1', author: '@dev_sam', text: 'What do you use?' },
        }),
      ],
    });
    renderApp('/');

    const fresh = await screen.findByRole('group', { name: 'New' });
    expect(within(fresh).getByText('Compiler news')).toBeInTheDocument();
    expect(within(fresh).getAllByRole('img', { name: 'X: not posted yet' })).toHaveLength(2);
    expect(within(fresh).getAllByRole('img', { name: 'LinkedIn: not posted yet' })).toHaveLength(2);
    expect(within(screen.getByRole('group', { name: 'Earlier' })).getByText('From yesterday')).toBeInTheDocument();
    const done = screen.getByRole('group', { name: 'Posted' });
    expect(within(done).getByRole('img', { name: 'X: posted' })).toBeInTheDocument();
    // Reply drafts are not part of this version.
    expect(screen.queryByText('A reply')).not.toBeInTheDocument();

    // The newest open draft is open; picking another row opens that one.
    const open = screen.getByRole('article', { name: 'Compiler news' });
    expect(within(open).getByRole('radio', { name: 'X' })).toBeChecked();
    fireEvent.click(within(fresh).getByText('Phone app is calmer'));
    const shipped = await screen.findByRole('article', { name: 'Phone app is calmer' });
    expect(within(shipped).getByText('Mentions NorthList')).toBeInTheDocument();
    fireEvent.click(within(shipped).getByRole('radio', { name: 'LinkedIn' }));
    expect(within(shipped).getByRole('button', { name: 'Post to LinkedIn' })).toBeInTheDocument();
  });

  it('shows the empty state when the AI sent nothing', async () => {
    mockApi({ 'GET /api/me': me, 'GET /api/spaces': [space], 'GET /api/ideas/today?space=sp1': [] });
    renderApp('/');
    expect(await screen.findByText('No drafts yet today')).toBeInTheDocument();
  });

  it('counts your take plus the X draft, and turns Post off over 280', async () => {
    const draft = 'a'.repeat(270);
    mockApi({
      'GET /api/me': me,
      'GET /api/spaces': [space],
      'GET /api/ideas/today?space=sp1': [idea({ title: 'Long one', take: 'abc', xText: draft })],
      'PATCH /api/ideas/idea-x': {},
    });
    renderApp('/');

    // "abc" + blank line + 270 = 275
    expect(await screen.findByText('275 / 280')).toBeInTheDocument();
    const postButton = screen.getByRole('button', { name: 'Post to X' });
    expect(postButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/Your take/), { target: { value: 'a longer take here' } });
    // 18 + 2 + 270 = 290
    expect(screen.getByText('290 / 280')).toHaveClass('text-danger-text');
    expect(postButton).toBeDisabled();
    expect(screen.getByText('Too long for X: 290 / 280. Shorten it to post.')).toBeInTheDocument();
  });

  it('shows Undo with a countdown for a waiting post, and calls undo', async () => {
    const waiting = post({
      id: 'p1',
      channel: 'X',
      status: 'WAITING',
      sendAt: new Date(Date.now() + 8_000).toISOString(),
    });
    const item = idea({ title: 'Waiting one', posts: [waiting] });
    const calls = mockApi({
      'GET /api/me': me,
      'GET /api/spaces': [space],
      'GET /api/ideas/today?space=sp1': () => [item],
      'POST /api/posts/p1/undo': () => {
        item.posts = [{ ...waiting, status: 'CANCELLED' }];
        return { ok: true };
      },
    });
    renderApp('/');

    expect(await screen.findByText(/Posting to X in [78] s/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post to X' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/posts/p1/undo')).toBe(true));
    const undo = calls.find((c) => c.path === '/api/posts/p1/undo')!;
    expect(undo.contentType).toBe('application/json');
    expect(undo.body).toEqual({});
    // Back to the Post button once cancelled.
    expect(await screen.findByRole('button', { name: 'Post to X' })).toBeInTheDocument();
  });

  it('says "Too late" when the post was already sent', async () => {
    const waiting = post({ id: 'p2', status: 'WAITING' });
    mockApi({
      'GET /api/me': me,
      'GET /api/spaces': [space],
      'GET /api/ideas/today?space=sp1': [idea({ posts: [waiting] })],
      'POST /api/posts/p2/undo': {
        status: 409,
        body: { error: { code: 'TOO_LATE', message: 'Too late to undo: it was already sent.' } },
      },
    });
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Too late: it was already sent.')).toBeInTheDocument();
  });

  it('shows "Connect X first" when X is not connected', async () => {
    mockApi({
      'GET /api/me': me,
      'GET /api/spaces': [space],
      'GET /api/ideas/today?space=sp1': [idea({ id: 'i9' })],
      'POST /api/ideas/i9/post': {
        status: 409,
        body: { error: { code: 'NOT_CONNECTED', message: 'Connect X first, on Connect.' } },
      },
    });
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Post to X' }));
    expect(await screen.findByText(/Connect X to this space first/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Space' })).toHaveAttribute('href', '/space');
  });
});
