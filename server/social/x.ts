/**
 * X (Twitter) API v2 with OAuth 2.0 user context and PKCE.
 * Scopes: tweet.read tweet.write users.read offline.access (offline.access gives a refresh token).
 */
import { SocialAccount, SocialError, SocialProvider, SocialTokens, errorFromStatus, redirectUri } from './types.js';

const AUTHORIZE = 'https://x.com/i/oauth2/authorize';
const TOKEN = 'https://api.x.com/2/oauth2/token';
const ME = 'https://api.x.com/2/users/me';
const TWEETS = 'https://api.x.com/2/tweets';
const SCOPES = 'tweet.read tweet.write users.read offline.access';

type Fetch = typeof fetch;

export function xProvider(
  credentials: { clientId: string; clientSecret: string },
  publicUrl: string,
  doFetch: Fetch = fetch,
): SocialProvider {
  const redirect = redirectUri(publicUrl, 'X');
  const basic = 'Basic ' + Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

  async function token(body: Record<string, string>): Promise<SocialTokens> {
    const res = await doFetch(TOKEN, {
      method: 'POST',
      headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw res.status === 400 || res.status === 401
        ? new SocialError('reconnect', 'X sign-in stopped working. Reconnect it on Connect.')
        : errorFromStatus('X', res.status);
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    };
  }

  return {
    channel: 'X',
    usesPkce: true,
    authUrl(state, codeChallenge) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: credentials.clientId,
        redirect_uri: redirect,
        scope: SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return `${AUTHORIZE}?${params}`;
    },
    async exchange(code, codeVerifier): Promise<SocialAccount> {
      const tokens = await token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
        code_verifier: codeVerifier,
        client_id: credentials.clientId,
      });
      const res = await doFetch(ME, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw errorFromStatus('X', res.status);
      const me = (await res.json()) as { data: { id: string; username: string } };
      return { ...tokens, accountId: me.data.id, accountName: `@${me.data.username}` };
    },
    refresh(refreshToken) {
      return token({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: credentials.clientId });
    },
    async publish(accessToken, account, text) {
      const res = await doFetch(TWEETS, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw errorFromStatus('X', res.status);
      const json = (await res.json()) as { data: { id: string } };
      const handle = account.accountName.replace(/^@/, '');
      return { id: json.data.id, url: `https://x.com/${handle}/status/${json.data.id}` };
    },
  };
}
