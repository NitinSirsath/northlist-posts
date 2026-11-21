/**
 * LinkedIn: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" (w_member_social).
 * Posts go to the member's own profile through the versioned Posts API.
 * Sign-ins last about 60 days; there is no refresh token for normal apps, so the user reconnects.
 */
import { SocialAccount, SocialProvider, errorFromStatus, redirectUri } from './types.js';

const AUTHORIZE = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO = 'https://api.linkedin.com/v2/userinfo';
const POSTS = 'https://api.linkedin.com/rest/posts';
const SCOPES = 'openid profile w_member_social';

type Fetch = typeof fetch;

/** LinkedIn's "little text" format treats these characters as markup; a backslash keeps them as text. */
export const escapeLittleText = (text: string) => text.replace(/[\\|{}@[\]()<>#*_~]/g, (ch) => `\\${ch}`);

export function linkedinProvider(
  credentials: { clientId: string; clientSecret: string; apiVersion: string },
  publicUrl: string,
  doFetch: Fetch = fetch,
): SocialProvider {
  const redirect = redirectUri(publicUrl, 'LINKEDIN');
  return {
    channel: 'LINKEDIN',
    usesPkce: false,
    authUrl(state) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: credentials.clientId,
        redirect_uri: redirect,
        state,
        scope: SCOPES,
      });
      return `${AUTHORIZE}?${params}`;
    },
    async exchange(code): Promise<SocialAccount> {
      const res = await doFetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirect,
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw errorFromStatus('LinkedIn', res.status);
      const json = (await res.json()) as { access_token: string; expires_in?: number; refresh_token?: string };
      const info = await doFetch(USERINFO, {
        headers: { Authorization: `Bearer ${json.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!info.ok) throw errorFromStatus('LinkedIn', info.status);
      const me = (await info.json()) as { sub: string; name?: string };
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
        accountId: me.sub,
        accountName: me.name || 'LinkedIn',
      };
    },
    async publish(accessToken, account, text) {
      const res = await doFetch(POSTS, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': credentials.apiVersion,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: `urn:li:person:${account.accountId}`,
          commentary: escapeLittleText(text),
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw errorFromStatus('LinkedIn', res.status);
      const urn = res.headers.get('x-restli-id') ?? '';
      return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/feed/' };
    },
  };
}
