import { describe, expect, it } from 'vitest';
import { prisma } from './db.js';
import { isPrivateAddress, pageFacts, readLink, setReaderDeps, type ReaderDeps } from './linkReader.js';
import { sendDuePosts } from './posting.js';
import { aiToken, callTool, connect, signedIn, toolResult } from './test/helpers.js';

const html = (title: string, description = '') =>
  `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body>Hi</body></html>`;

/** A fake web: each address answers with what the test says, nothing goes out. */
function fakeWeb(
  pages: Record<string, { status?: number; body?: string; type?: string; location?: string }>,
  ip = '93.184.216.34',
): ReaderDeps {
  return {
    lookup: async () => [ip],
    fetch: (async (input: string | URL) => {
      const page = pages[String(input)];
      if (!page) return new Response('nope', { status: 404 });
      const headers: Record<string, string> = { 'content-type': page.type ?? 'text/html; charset=utf-8' };
      if (page.location) headers.location = page.location;
      return new Response(page.body ?? '', { status: page.status ?? 200, headers });
    }) as typeof fetch,
  };
}

describe('link reader', () => {
  it('reads a site title and one line, and a page with a path', async () => {
    const deps = fakeWeb({
      'https://northlist.site': { body: html('NorthList — job mails, sorted', 'Reads only job mails.') },
    });
    expect(await readLink('https://northlist.site', deps)).toMatchObject({
      kind: 'WEBSITE',
      title: 'NorthList — job mails, sorted',
      description: 'Reads only job mails.',
      readOk: true,
    });
    const page = await readLink('https://northlist.site/changelog', fakeWeb({}));
    expect(page).toMatchObject({ kind: 'PAGE', title: 'northlist.site/changelog', readOk: false });
  });

  it('prefers og tags and decodes entities', () => {
    expect(
      pageFacts(
        '<title>x</title><meta property="og:title" content="A &amp; B"><meta property="og:description" content="It&#39;s fine">',
      ),
    ).toEqual({ title: 'A & B', description: "It's fine" });
  });

  it('never fetches private or local addresses, also after a redirect', async () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    const inside = await readLink(
      'https://intranet.example.com',
      fakeWeb({ 'https://intranet.example.com': { body: html('Secret') } }, '10.0.0.5'),
    );
    expect(inside).toMatchObject({ readOk: false, title: 'intranet.example.com' });
    let asked = 0;
    const deps: ReaderDeps = {
      lookup: async (host) => (host === 'evil.example.com' ? ['93.184.216.34'] : ['127.0.0.1']),
      fetch: (async () => {
        asked++;
        return new Response('', { status: 302, headers: { location: 'http://localhost:3591/api/me' } });
      }) as typeof fetch,
    };
    expect((await readLink('https://evil.example.com', deps)).readOk).toBe(false);
    expect(asked).toBe(1);
  });

  it('reads GitHub repos through the API; one GitHub does not show is private', async () => {
    const deps = fakeWeb({
      'https://api.github.com/repos/NitinSirsath/northlist-apply': {
        type: 'application/json',
        body: JSON.stringify({ name: 'northlist-apply', description: 'Applies to jobs from your AI app.' }),
      },
      'https://api.github.com/users/NitinSirsath': {
        type: 'application/json',
        body: JSON.stringify({ name: 'Nitin', bio: 'Builds NorthList' }),
      },
    });
    expect(await readLink('https://github.com/NitinSirsath/northlist-apply/pulls', deps)).toMatchObject({
      url: 'https://github.com/NitinSirsath/northlist-apply',
      kind: 'GITHUB_REPO',
      description: 'Applies to jobs from your AI app.',
      isPrivate: false,
    });
    expect(await readLink('https://github.com/NitinSirsath/northlist-app', deps)).toMatchObject({
      kind: 'GITHUB_REPO',
      title: 'northlist-app',
      isPrivate: true,
      readOk: true,
    });
    expect(await readLink('https://github.com/NitinSirsath', deps)).toMatchObject({
      kind: 'GITHUB_PROFILE',
      title: 'Nitin',
    });
  });
});

describe('spaces', () => {
  it('a new user has no space and the first-run steps to do', async () => {
    const { agent } = await signedIn({ space: false });
    expect((await agent.get('/api/me')).body).toMatchObject({ onboarded: false, onboardingStep: 0 });
    expect((await agent.get('/api/spaces')).body).toEqual([]);
    await agent.put('/api/onboarding').send({ step: 9, done: true }).expect(409);
    await agent.put('/api/onboarding').send({ step: 3 }).expect(200);
    const space = (await agent.post('/api/spaces').send({ goal: 'NETWORK' }).expect(200)).body;
    expect(space).toMatchObject({ name: 'Personal', goal: 'NETWORK', links: [], connections: [], newDrafts: 0 });
    expect((await agent.put('/api/onboarding').send({ step: 9, done: true }).expect(200)).body).toEqual({
      onboardingStep: 9,
      onboarded: true,
    });
  });

  it('adds links (a pasted address without https is fine) and names the product from the first website', async () => {
    const { agent } = await signedIn({ space: false });
    const space = (await agent.post('/api/spaces').send({ goal: 'PROMOTE' }).expect(200)).body;
    setReaderDeps(
      fakeWeb({ 'https://northlist.site': { body: html('NorthList — job mails, sorted', 'Reads only job mails.') } }),
    );
    try {
      const link = (await agent.post(`/api/spaces/${space.id}/links`).send({ url: 'northlist.site/' }).expect(200))
        .body;
      expect(link).toMatchObject({
        url: 'https://northlist.site',
        kind: 'WEBSITE',
        title: 'NorthList — job mails, sorted',
      });
      expect((await agent.get(`/api/spaces/${space.id}`)).body).toMatchObject({
        name: 'NorthList',
        productName: 'NorthList',
        productUrl: 'https://northlist.site',
        productLine: 'Reads only job mails.',
      });
    } finally {
      setReaderDeps(undefined);
    }
    const [link] = (await agent.get(`/api/spaces/${space.id}`)).body.links;
    await agent.post(`/api/spaces/${space.id}/links`).send({ url: 'not a link' }).expect(400);
    await agent.post(`/api/spaces/${space.id}/links`).send({ url: 'javascript:alert(1)' }).expect(400);
    const again = (await agent.get(`/api/spaces/${space.id}`)).body;
    expect(again.links).toHaveLength(1);
    await agent.delete(`/api/spaces/${space.id}/links/${link.id}`).send({}).expect(200);
    expect((await agent.get(`/api/spaces/${space.id}`)).body.links).toEqual([]);
  });

  it('keeps one space at least and never shows another user’s space', async () => {
    const { agent, space } = await signedIn();
    await agent.delete(`/api/spaces/${space.id}`).send({}).expect(409);
    const other = await prisma.user.create({ data: { email: 'someone@example.com', name: 'Someone' } });
    const theirs = await prisma.space.create({ data: { userId: other.id, name: 'Theirs' } });
    await agent.get(`/api/spaces/${theirs.id}`).expect(404);
    await agent.patch(`/api/spaces/${theirs.id}`).send({ name: 'Mine now' }).expect(404);
    await agent.get(`/api/ideas/today?space=${theirs.id}`).expect(404);
    await agent.get(`/api/connect/x/start?space=${theirs.id}`).expect(404);
  });

  it('each space posts only from its own account; an account is in one space only', async () => {
    const { agent, user, space } = await signedIn();
    const personal = (await agent.post('/api/spaces').send({ goal: 'NETWORK', name: 'Personal' }).expect(200)).body;
    await connect(agent, 'x', space.id);
    const token = await aiToken(user.id);
    // With two spaces the AI must say which one.
    const unsaid = toolResult(
      await callTool(token, 'submit_drafts', { ideas: [{ kind: 'OWN', title: 'Hi', x: 'Hi' }] }),
    );
    expect(unsaid).toMatchObject({ isError: true, data: { code: 'space_required' } });
    const sent = toolResult(
      await callTool(token, 'submit_drafts', {
        space: personal.id,
        ideas: [{ kind: 'OWN', title: 'Mine', x: 'Mine' }],
      }),
    );
    expect(sent.data).toMatchObject({ space: 'Personal', created: 1 });
    expect((await agent.get(`/api/ideas/today?space=${space.id}`)).body).toEqual([]);
    const [idea] = (await agent.get(`/api/ideas/today?space=${personal.id}`)).body;
    // NorthList's X account is not Personal's: the post is refused.
    const refused = await agent.post(`/api/ideas/${idea.id}/post`).send({ channel: 'X' }).expect(409);
    expect(refused.body.error.code).toBe('NOT_CONNECTED');
    await connect(agent, 'x', personal.id);
    await agent.post(`/api/ideas/${idea.id}/post`).send({ channel: 'X' }).expect(200);
    await sendDuePosts(new Date(Date.now() + 11_000));
    const post = await prisma.post.findFirstOrThrow({ include: { idea: true } });
    const used = await prisma.socialConnection.findFirstOrThrow({ where: { spaceId: personal.id } });
    expect(post).toMatchObject({ status: 'POSTED' });
    expect(post.idea.spaceId).toBe(used.spaceId);
    const spaces = (await agent.get('/api/spaces')).body;
    expect(spaces.map((s: { name: string; newDrafts: number }) => [s.name, s.newDrafts])).toEqual([
      ['NorthList', 0],
      ['Personal', 1],
    ]);
  });

  it('get_profile shows every space with its links and accounts, never a token', async () => {
    const { agent, user, space } = await signedIn();
    await prisma.sourceLink.create({
      data: {
        spaceId: space.id,
        url: 'https://github.com/a/private-one',
        kind: 'GITHUB_REPO',
        title: 'private-one',
        isPrivate: true,
      },
    });
    await connect(agent, 'linkedin', space.id);
    const token = await aiToken(user.id);
    const result = toolResult(await callTool(token, 'get_profile'));
    expect(result.data.spaces[0]).toMatchObject({
      id: space.id,
      name: 'NorthList',
      links: [{ url: 'https://github.com/a/private-one', kind: 'GITHUB_REPO', private: true }],
      channels: [{ channel: 'LINKEDIN', account: 'You (test)' }],
      tone: 'PLAIN',
      readyAt: '08:00',
    });
    expect(JSON.stringify(result.data)).not.toMatch(/Enc|fake-linkedin|accessToken/);
    const saved = toolResult(await callTool(token, 'save_profile', { space: space.id, tone: 'FRIENDLY' }));
    expect(saved.data.space).toMatchObject({ tone: 'FRIENDLY' });
    expect((await agent.get(`/api/spaces/${space.id}`)).body.updatedBy).toBe('Claude Code');
    const wrong = toolResult(await callTool(token, 'save_profile', { space: 'nope', tone: 'BOLD' }));
    expect(wrong).toMatchObject({ isError: true, data: { code: 'space_not_found' } });
  });
});
