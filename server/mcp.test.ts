import { describe, expect, it } from 'vitest';
import { prisma } from './db.js';
import { aiToken, callTool, signedIn, toolResult } from './test/helpers.js';
import { revokeToken } from './tokens.js';

const news = (over: Record<string, unknown> = {}) => ({
  kind: 'NEWS',
  title: 'React compiler release',
  why: 'Big news for React developers',
  sourceUrl: 'https://example.com/react-compiler',
  sourceName: 'Frontend Weekly',
  x: 'The new React compiler adds memo for you. https://example.com/react-compiler',
  linkedin: 'The new React compiler adds memo for you at build time.\n\nhttps://example.com/react-compiler',
  ...over,
});

describe('MCP endpoint', () => {
  it('needs a valid, unrevoked token', async () => {
    expect((await callTool(null, 'get_profile')).status).toBe(401);
    expect((await callTool('nlpost_' + 'a'.repeat(43), 'get_profile')).status).toBe(401);
    const { user } = await signedIn();
    const token = await aiToken(user.id);
    expect((await callTool(token, 'get_profile')).status).toBe(200);
    const row = await prisma.integrationToken.findFirstOrThrow({ where: { userId: user.id } });
    await revokeToken(user.id, row.id);
    expect((await callTool(token, 'get_profile')).status).toBe(401);
  });

  it('lists the four tools', async () => {
    const { user } = await signedIn();
    const token = await aiToken(user.id);
    const { default: request } = await import('supertest');
    const { app } = await import('./test/helpers.js');
    const res = await request(app())
      .post('/mcp')
      .set('Host', 'posts.example.com')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const text = res.text.includes('data:')
      ? res.text
          .split('\n')
          .find((l) => l.startsWith('data:'))!
          .slice(5)
      : res.text;
    const names = JSON.parse(text)
      .result.tools.map((t: { name: string }) => t.name)
      .sort();
    expect(names).toEqual(['get_profile', 'get_recent_posts', 'save_profile', 'submit_drafts']);
  });

  it('refuses a host that is not allowed', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./test/helpers.js');
    const res = await request(app()).post('/mcp').set('Host', 'evil.example.net').send({});
    expect(res.status).toBe(403);
  });

  it('saves the profile and shows which AI changed it', async () => {
    const { user, agent } = await signedIn();
    const token = await aiToken(user.id, 'Claude Code');
    const saved = toolResult(
      await callTool(token, 'save_profile', {
        goal: 'PROMOTE',
        productName: 'NorthList',
        productUrl: 'https://northlist.site',
        interests: ['React', 'Job search'],
      }),
    );
    expect(saved.isError).toBe(false);
    const profile = (await agent.get('/api/profile').expect(200)).body;
    expect(profile).toMatchObject({
      productName: 'NorthList',
      interests: ['React', 'Job search'],
      updatedBy: 'Claude Code',
    });
    const bad = toolResult(await callTool(token, 'save_profile', { productUrl: 'javascript:alert(1)' }));
    expect(bad).toMatchObject({ isError: true, data: { code: 'invalid_input', fields: ['productUrl'] } });
    const unknown = toolResult(await callTool(token, 'save_profile', { email: 'x' }));
    expect(unknown.isError).toBe(true);
  });

  it('submits drafts to Today, once', async () => {
    const { user, agent } = await signedIn();
    const token = await aiToken(user.id);
    const first = toolResult(await callTool(token, 'submit_drafts', { ideas: [news()] }));
    expect(first.data).toMatchObject({ created: 1, results: [{ result: 'created' }] });
    const again = toolResult(await callTool(token, 'submit_drafts', { ideas: [news()] }));
    expect(again.data).toMatchObject({ created: 0, results: [{ result: 'already_sent' }] });
    const today = (await agent.get('/api/ideas/today').expect(200)).body;
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ kind: 'NEWS', title: 'React compiler release', fromAi: 'Claude Code', posts: [] });
  });

  it('refuses drafts that break the rules, naming the fields', async () => {
    const { user } = await signedIn();
    const token = await aiToken(user.id);
    const long = toolResult(await callTool(token, 'submit_drafts', { ideas: [news({ x: 'a'.repeat(281) })] }));
    expect(long.data).toMatchObject({ code: 'invalid_input', fields: ['ideas.0.x'] });
    expect(JSON.stringify(long.data)).not.toContain('aaaa');
    const noSource = toolResult(await callTool(token, 'submit_drafts', { ideas: [news({ sourceUrl: undefined })] }));
    expect(noSource.data.fields).toEqual(['ideas.0.sourceUrl']);
    const badLink = toolResult(await callTool(token, 'submit_drafts', { ideas: [news({ sourceUrl: 'ftp://x' })] }));
    expect(badLink.isError).toBe(true);
    const replyWithLinkedIn = toolResult(
      await callTool(token, 'submit_drafts', {
        ideas: [
          {
            kind: 'REPLY',
            title: 'Reply',
            x: 'Agree.',
            linkedin: 'No',
            replyTo: { url: 'https://x.com/a/status/1', author: '@a', text: 'Hi' },
          },
        ],
      }),
    );
    expect(replyWithLinkedIn.data.fields).toEqual(['ideas.0.linkedin']);
    expect(await prisma.idea.count()).toBe(0);
  });

  it('counts a long link as 23 characters on X', async () => {
    const { user } = await signedIn();
    const token = await aiToken(user.id);
    const x = 'a'.repeat(256) + ' https://example.com/' + 'b'.repeat(200);
    const res = toolResult(await callTool(token, 'submit_drafts', { ideas: [news({ x })] }));
    expect(res.data.created).toBe(1);
  });

  it('turns product links into counted short links, one per channel', async () => {
    const { user, agent } = await signedIn();
    const token = await aiToken(user.id);
    await callTool(token, 'save_profile', { productName: 'NorthList', productUrl: 'https://northlist.site' });
    await callTool(token, 'submit_drafts', {
      ideas: [
        {
          kind: 'SHIPPED',
          title: 'Calm phone app',
          x: 'Try it: https://northlist.site/app',
          linkedin: 'Try NorthList: https://www.northlist.site',
        },
      ],
    });
    const [idea] = (await agent.get('/api/ideas/today')).body;
    expect(idea.mentionsProduct).toBe(true);
    expect(idea.xText).toMatch(/^Try it: https:\/\/posts\.example\.com\/r\/[A-Za-z0-9]{7}$/);
    expect(idea.linkedinText).toMatch(/https:\/\/posts\.example\.com\/r\/[A-Za-z0-9]{7}$/);
    const links = await prisma.shortLink.findMany({ orderBy: { channel: 'asc' } });
    expect(links.map((l) => [l.channel, l.targetUrl])).toEqual([
      ['X', 'https://northlist.site/app'],
      ['LINKEDIN', 'https://www.northlist.site'],
    ]);
  });

  it('tells the AI what went out and what waits', async () => {
    const { user } = await signedIn();
    const token = await aiToken(user.id);
    await callTool(token, 'submit_drafts', { ideas: [news()] });
    const recent = toolResult(await callTool(token, 'get_recent_posts'));
    expect(recent.data).toMatchObject({
      posted: [],
      waiting: [{ kind: 'NEWS', title: 'React compiler release' }],
      sentInLast20Hours: { NEWS: 1 },
    });
    const profile = toolResult(await callTool(token, 'get_profile'));
    expect(profile.data).toMatchObject({ profile: { postsPerDay: 3 }, connectedChannels: [] });
    expect(profile.data).not.toHaveProperty('profile.repliesPerDay');
    expect(JSON.stringify(profile.data)).not.toMatch(/accessToken|Enc/);
  });
});
