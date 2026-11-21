import { describe, expect, it, vi } from 'vitest';
import { escapeLittleText, linkedinProvider } from './linkedin.js';
import { SocialError } from './types.js';
import { xProvider } from './x.js';

const response = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('X', () => {
  const creds = { clientId: 'cid', clientSecret: 'secret' };

  it('asks for the right scopes with PKCE', () => {
    const url = new URL(xProvider(creds, 'https://posts.example.com').authUrl('st', 'ch'));
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'https://posts.example.com/api/connect/x/callback',
      scope: 'tweet.read tweet.write users.read offline.access',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code and reads the handle', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(200, { access_token: 'at', refresh_token: 'rt', expires_in: 7200 }))
      .mockResolvedValueOnce(response(200, { data: { id: '42', username: 'nitin' } }));
    const account = await xProvider(creds, 'https://posts.example.com', fetch).exchange('code', 'verifier');
    expect(account).toMatchObject({ accessToken: 'at', refreshToken: 'rt', accountId: '42', accountName: '@nitin' });
    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('cid:secret').toString('base64'));
    expect(String(init.body)).toContain('code_verifier=verifier');
  });

  it('posts and builds the post link', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(201, { data: { id: '99', text: 'hi' } }));
    const out = await xProvider(creds, 'https://p', fetch).publish(
      'at',
      { accountId: '42', accountName: '@nitin' },
      'hi',
    );
    expect(out).toEqual({ id: '99', url: 'https://x.com/nitin/status/99' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ text: 'hi' });
  });

  it('turns X errors into plain messages', async () => {
    for (const [status, kind] of [
      [401, 'reconnect'],
      [429, 'rate_limited'],
      [402, 'rejected'],
      [503, 'unavailable'],
    ] as const) {
      const fetch = vi.fn().mockResolvedValueOnce(response(status, { detail: 'secret body' }));
      const err = await xProvider(creds, 'https://p', fetch)
        .publish('at', { accountId: '1', accountName: '@a' }, 'x')
        .catch((e) => e);
      expect(err).toBeInstanceOf(SocialError);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain('secret body');
    }
  });
});

describe('LinkedIn', () => {
  const creds = { clientId: 'lid', clientSecret: 'lsecret', apiVersion: '202611' };

  it('asks for sign-in and share scopes', () => {
    const url = new URL(linkedinProvider(creds, 'https://posts.example.com').authUrl('st', 'ignored'));
    expect(url.searchParams.get('scope')).toBe('openid profile w_member_social');
    expect(url.searchParams.get('redirect_uri')).toBe('https://posts.example.com/api/connect/linkedin/callback');
    expect(url.searchParams.has('code_challenge')).toBe(false);
  });

  it('exchanges the code and reads the member', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(200, { access_token: 'at', expires_in: 5184000 }))
      .mockResolvedValueOnce(response(200, { sub: 'abc', name: 'Nitin S' }));
    const account = await linkedinProvider(creds, 'https://p', fetch).exchange('code', '');
    expect(account).toMatchObject({ accessToken: 'at', accountId: 'abc', accountName: 'Nitin S' });
    expect(account.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);
  });

  it('posts to the member feed with the version header and escaped text', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:7' } }));
    const out = await linkedinProvider(creds, 'https://p', fetch).publish(
      'at',
      { accountId: 'abc', accountName: 'N' },
      'Hi (all) #dev @x',
    );
    expect(out.url).toBe('https://www.linkedin.com/feed/update/urn:li:share:7/');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect(init.headers).toMatchObject({ 'LinkedIn-Version': '202611', 'X-Restli-Protocol-Version': '2.0.0' });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ author: 'urn:li:person:abc', visibility: 'PUBLIC', lifecycleState: 'PUBLISHED' });
    expect(body.commentary).toBe('Hi \\(all\\) \\#dev \\@x');
  });

  it('escapes every LinkedIn markup character', () => {
    expect(escapeLittleText('a|b{c}d[e]f<g>h*i_j~k\\l')).toBe('a\\|b\\{c\\}d\\[e\\]f\\<g\\>h\\*i\\_j\\~k\\\\l');
  });
});
