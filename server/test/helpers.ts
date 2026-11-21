import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { createToken } from '../tokens.js';

export const OWNER = 'owner@example.com';

export function app() {
  return createApp('/nonexistent-web-dir');
}

/** A signed-in agent (cookie kept between requests). */
export async function signedIn() {
  const agent = request.agent(app());
  await agent.post('/api/auth/dev-login').send({ email: OWNER }).expect(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: OWNER } });
  return { agent, user };
}

export async function aiToken(userId: string, name = 'Claude Code') {
  return (await createToken(userId, { name })).plaintext;
}

/** Calls one MCP tool over HTTP, the way an AI app does. */
export async function callTool(token: string | null, name: string, args: Record<string, unknown> = {}) {
  const req = request(app())
    .post('/mcp')
    .set('Host', 'posts.example.com')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return res;
}

/** The JSON a tool returned (structuredContent), or its error body. */
export function toolResult(res: request.Response) {
  const body = typeof res.body === 'object' && res.body?.result ? res.body : parseSse(res.text);
  const result = body.result;
  const text = result?.content?.[0]?.text;
  return { isError: Boolean(result?.isError), data: text ? JSON.parse(text) : null };
}

function parseSse(text: string) {
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return line ? JSON.parse(line.slice(5)) : {};
}
