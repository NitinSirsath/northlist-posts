import type { Channel } from '../../shared/contracts.js';

export interface SocialTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface SocialAccount extends SocialTokens {
  accountId: string;
  /** Shown in the app: "@handle" on X, the person's name on LinkedIn. */
  accountName: string;
}

export interface Published {
  id: string;
  url: string;
}

/** What the user sees on a failed post. `reconnect` means the sign-in no longer works. */
export class SocialError extends Error {
  constructor(
    public kind: 'reconnect' | 'rate_limited' | 'rejected' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'SocialError';
  }
}

export interface SocialProvider {
  channel: Channel;
  /** PKCE: X uses it, LinkedIn web apps do not. */
  usesPkce: boolean;
  authUrl(state: string, codeChallenge: string): string;
  exchange(code: string, codeVerifier: string): Promise<SocialAccount>;
  refresh?(refreshToken: string): Promise<SocialTokens>;
  publish(accessToken: string, account: { accountId: string; accountName: string }, text: string): Promise<Published>;
}

export const redirectUri = (publicUrl: string, channel: Channel) =>
  `${publicUrl}/api/connect/${channel === 'X' ? 'x' : 'linkedin'}/callback`;

/** Maps an HTTP answer from X or LinkedIn to a plain message. Never includes the body text. */
export function errorFromStatus(service: string, status: number): SocialError {
  if (status === 401)
    return new SocialError('reconnect', `${service} sign-in stopped working. Reconnect it on Connect.`);
  if (status === 403) return new SocialError('rejected', `${service} refused the post. Check the text and try again.`);
  if (status === 429)
    return new SocialError('rate_limited', `${service} says too many posts right now. Try again later.`);
  if (status === 402) return new SocialError('rejected', `${service} needs credit on your developer account.`);
  if (status >= 500) return new SocialError('unavailable', `${service} is not answering. Try again in a few minutes.`);
  return new SocialError('rejected', `${service} refused the post (${status}).`);
}
