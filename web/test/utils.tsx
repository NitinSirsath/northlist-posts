/** Test helpers: a fake API on top of fetch, sample data, and the whole app at a path. */
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { IdeaView, MeView, PostView, SpaceView } from '../../shared/contracts';
import { createQueryClient } from '../queries';
import { createAppRouter } from '../router';

type Reply = unknown | { status: number; body: unknown };
type Handler = Reply | ((body: unknown) => Reply);

export interface Call {
  method: string;
  path: string;
  body: unknown;
  contentType: string | null;
}

const isStatus = (r: unknown): r is { status: number; body: unknown } =>
  typeof r === 'object' && r !== null && 'status' in r && 'body' in r;

/** Routes are "METHOD /path"; anything else answers 404. Returns the calls made. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, contentType: headers.get('Content-Type') });
    const handler = routes[`${method} ${path}`];
    let reply: unknown =
      handler === undefined ? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found.' } } } : handler;
    if (typeof reply === 'function') reply = (reply as (b: unknown) => Reply)(body);
    const { status, body: json } = isStatus(reply) ? reply : { status: 200, body: reply };
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

export function renderApp(path: string) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, refetchInterval: false } });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

export const signedOut = { status: 401, body: { error: { code: 'SIGNED_OUT', message: 'Sign in first.' } } };

export const me: MeView = {
  email: 'owner@example.com',
  name: 'Owner',
  mcpUrl: 'https://posts.example.com/mcp',
  kitUrl: 'https://github.com/example/kit',
  vapidPublicKey: null,
  fakeSocial: false,
  onboardingStep: 9,
  onboarded: true,
};

export const space: SpaceView = {
  id: 'sp1',
  name: 'NorthList',
  goal: 'PROMOTE',
  productName: 'NorthList',
  productUrl: 'https://northlist.site',
  productLine: 'Job mails only.',
  interests: ['React'],
  postsPerDay: 3,
  repliesPerDay: 0,
  useX: true,
  useLinkedIn: true,
  tone: 'PLAIN',
  styleSamples: [],
  readyAt: '08:00',
  weekends: false,
  links: [],
  connections: [],
  newDrafts: 0,
  updatedBy: 'you',
  updatedAt: '2026-11-19T08:00:00.000Z',
};

/** The routes every signed-in page reads: who you are and your spaces. */
export const base = { 'GET /api/me': me, 'GET /api/spaces': [space] };

let n = 0;
export function idea(over: Partial<IdeaView> = {}): IdeaView {
  n += 1;
  return {
    id: `idea${n}`,
    spaceId: 'sp1',
    kind: 'SHIPPED',
    title: `Idea ${n}`,
    why: '',
    sourceUrl: null,
    sourceName: null,
    mentionsProduct: false,
    replyTo: null,
    xText: 'Hello from X',
    linkedinText: null,
    take: '',
    skipped: false,
    copied: false,
    fromAi: 'Claude Code',
    createdAt: new Date().toISOString(),
    posts: [],
    ...over,
  };
}

export function post(over: Partial<PostView> = {}): PostView {
  n += 1;
  return {
    id: `post${n}`,
    ideaId: 'idea',
    channel: 'X',
    text: 'text',
    status: 'WAITING',
    sendAt: new Date(Date.now() + 8_000).toISOString(),
    postedAt: null,
    url: null,
    error: null,
    clicks: 0,
    ...over,
  };
}
