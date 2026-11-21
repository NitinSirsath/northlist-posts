import { describe, expect, it } from 'vitest';
import { prisma } from './db.js';
import { sendDuePosts } from './posting.js';
import { aiToken, callTool, signedIn, toolResult } from './test/helpers.js';

async function setup(idea: Record<string, unknown> = {}) {
  const { agent, user } = await signedIn();
  const token = await aiToken(user.id);
  await callTool(token, 'submit_drafts', {
    ideas: [
      {
        kind: 'OWN',
        title: 'Scam warning',
        x: 'NorthList now warns you about fee scams.',
        linkedin: 'NorthList now warns you about fee scams.',
        ...idea,
      },
    ],
  });
  const [row] = (await agent.get('/api/ideas/today')).body;
  return { agent, user, ideaId: row.id as string };
}

/** Connect through the fake OAuth flow, like a click on Connect. */
async function connect(agent: Awaited<ReturnType<typeof signedIn>>['agent'], channel: 'x' | 'linkedin') {
  const start = await agent.get(`/api/connect/${channel}/start`).expect(302);
  const callback = new URL(start.headers.location);
  const done = await agent.get(callback.pathname + callback.search).expect(302);
  expect(done.headers.location).toBe(`/connect?channel=${channel}&connected=1`);
}

const inSeconds = (s: number) => new Date(Date.now() + s * 1000);

describe('posting', () => {
  it('needs the channel connected first', async () => {
    const { agent, ideaId } = await setup();
    const res = await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' }).expect(409);
    expect(res.body.error.code).toBe('NOT_CONNECTED');
  });

  it('waits 10 seconds, then posts with your take first', async () => {
    const { agent, ideaId } = await setup();
    await connect(agent, 'x');
    await agent.patch(`/api/ideas/${ideaId}`).send({ take: 'This is why I built it.' }).expect(200);
    const post = (await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' }).expect(200)).body;
    expect(post).toMatchObject({
      status: 'WAITING',
      channel: 'X',
      text: 'This is why I built it.\n\nNorthList now warns you about fee scams.',
    });
    expect(await sendDuePosts(inSeconds(5))).toBe(0);
    expect(await sendDuePosts(inSeconds(11))).toBe(1);
    const [idea] = (await agent.get('/api/ideas/today')).body;
    expect(idea.posts[0]).toMatchObject({ status: 'POSTED', url: expect.stringContaining('/test-post/x/') });
    await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' }).expect(409);
    // No product link in it, so Posted shows no click count rather than "0 clicks".
    expect((await agent.get('/api/posted')).body.posts[0].clicks).toBeNull();
  });

  it('Undo within 10 seconds stops the post', async () => {
    const { agent, ideaId } = await setup();
    await connect(agent, 'linkedin');
    const post = (await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'LINKEDIN' })).body;
    await agent.post(`/api/posts/${post.id}/undo`).send({}).expect(200);
    expect(await sendDuePosts(inSeconds(60))).toBe(0);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('CANCELLED');
    const again = (await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'LINKEDIN' }).expect(200)).body;
    await sendDuePosts(inSeconds(11));
    const res = await agent.post(`/api/posts/${again.id}/undo`).send({}).expect(409);
    expect(res.body.error.code).toBe('TOO_LATE');
  });

  it('refuses an X post that your take makes too long', async () => {
    const { agent, ideaId } = await setup({ x: 'b'.repeat(270) });
    await connect(agent, 'x');
    await agent.patch(`/api/ideas/${ideaId}`).send({ take: 'A long take that pushes it over.' }).expect(200);
    const res = await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' }).expect(400);
    expect(res.body.error.code).toBe('TOO_LONG');
  });

  it('shows a plain error when X refuses, and lets you try again', async () => {
    const { agent, ideaId } = await setup({ x: 'Will fail [fail]' });
    await connect(agent, 'x');
    await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' });
    await sendDuePosts(inSeconds(11));
    let [idea] = (await agent.get('/api/ideas/today')).body;
    expect(idea.posts[0]).toMatchObject({ status: 'FAILED', error: 'X refused the post (test).' });
    await agent.patch(`/api/ideas/${ideaId}`).send({ xText: 'Fixed text' }).expect(200);
    await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' }).expect(200);
    await sendDuePosts(inSeconds(11));
    [idea] = (await agent.get('/api/ideas/today')).body;
    expect(idea.posts.map((p: { status: string }) => p.status)).toEqual(['FAILED', 'POSTED']);
  });

  it('never posts reply drafts; they are copied', async () => {
    const { agent, ideaId } = await setup({
      kind: 'REPLY',
      linkedin: undefined,
      replyTo: { url: 'https://x.com/a/status/1', author: '@a', text: 'What tool do you use daily?' },
    });
    await connect(agent, 'x');
    await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' }).expect(400);
    const copied = (await agent.post(`/api/ideas/${ideaId}/copied`).send({}).expect(200)).body;
    expect(copied.copied).toBe(true);
    expect((await agent.get('/api/posted')).body.repliesCopiedThisWeek).toBe(1);
  });

  it('Skip removes the idea from Today', async () => {
    const { agent, ideaId } = await setup();
    await agent.post(`/api/ideas/${ideaId}/skip`).send({}).expect(200);
    expect((await agent.get('/api/ideas/today')).body).toEqual([]);
  });

  it('marks a post stuck in sending as failed instead of sending it twice', async () => {
    const { agent, ideaId } = await setup();
    await connect(agent, 'x');
    const post = (await agent.post(`/api/ideas/${ideaId}/post`).send({ channel: 'X' })).body;
    await prisma.post.update({ where: { id: post.id }, data: { status: 'SENDING', sendAt: inSeconds(-600) } });
    await sendDuePosts();
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('FAILED');
  });

  it('keeps tokens encrypted and out of every answer', async () => {
    const { agent } = await setup();
    await connect(agent, 'linkedin');
    const row = await prisma.socialConnection.findFirstOrThrow();
    expect(row.accessTokenEnc).not.toContain('fake-LINKEDIN');
    const list = (await agent.get('/api/connections').expect(200)).body;
    expect(list).toEqual([{ channel: 'LINKEDIN', accountName: 'You (test)', expiresInDays: 11 }]);
    expect(JSON.stringify(list)).not.toMatch(/fake-|Enc/);
  });

  it('a connect link cannot attach an account to someone who did not start it', async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/api/connect/x/callback?code=fake&state=made-up').expect(302);
    expect(res.headers.location).toBe('/connect?channel=x&error=expired');
  });
});

describe('Posted and short links', () => {
  it('counts clicks per channel and opens the real page', async () => {
    const { agent, user } = await signedIn();
    const token = await aiToken(user.id);
    await callTool(token, 'save_profile', { productName: 'NorthList', productUrl: 'https://northlist.site' });
    await callTool(token, 'submit_drafts', {
      ideas: [
        { kind: 'OWN', title: 'Try it', x: 'Try https://northlist.site', linkedin: 'Try https://northlist.site' },
      ],
    });
    const [idea] = (await agent.get('/api/ideas/today')).body;
    await connect(agent, 'x');
    await agent.post(`/api/ideas/${idea.id}/post`).send({ channel: 'X' });
    await sendDuePosts(inSeconds(11));
    const code = idea.xText.split('/r/')[1];
    const hit = await agent.get(`/r/${code}`).expect(302);
    expect(hit.headers.location).toBe('https://northlist.site');
    await agent.get(`/r/${code}`);
    await agent.get('/r/unknown1').expect(302).expect('Location', '/');
    const posted = (await agent.get('/api/posted').expect(200)).body;
    expect(posted).toMatchObject({
      postsThisWeek: 1,
      postsByChannel: { X: 1, LINKEDIN: 0 },
      clicksThisWeek: 2,
      clicksByChannel: { X: 2, LINKEDIN: 0 },
    });
    expect(posted.posts[0].clicks).toBe(2);
    expect(posted.ideaTitles[idea.id]).toBe('Try it');
    const recent = toolResult(await callTool(token, 'get_recent_posts')).data as { posted: { text: string }[] };
    expect(recent.posted[0].text).toBe('Try https://northlist.site');
  });
});
