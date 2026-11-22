import crypto from 'node:crypto';
import type { Channel } from '../../shared/contracts.js';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { linkedinProvider } from './linkedin.js';
import { SocialError, SocialProvider, redirectUri } from './types.js';
import { xProvider } from './x.js';

/**
 * Local testing only (FAKE_SOCIAL=1): connects at once and "posts" nowhere.
 * A text containing [fail] fails, to test the error path.
 */
export function fakeProvider(channel: Channel, publicUrl: string): SocialProvider {
  return {
    channel,
    usesPkce: channel === 'X',
    authUrl: (state) => `${redirectUri(publicUrl, channel)}?code=fake&state=${encodeURIComponent(state)}`,
    async exchange() {
      return {
        accessToken: `fake-${channel}`,
        // A new account each time, so two spaces can each have their own test account.
        accountId: `fake-${channel.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`,
        accountName: channel === 'X' ? '@you_test' : 'You (test)',
        expiresAt: channel === 'LINKEDIN' ? new Date(Date.now() + 12 * 86_400_000) : undefined,
      };
    },
    async publish(_token, _account, text) {
      if (text.includes('[fail]'))
        throw new SocialError('rejected', `${channel === 'X' ? 'X' : 'LinkedIn'} refused the post (test).`);
      const id = crypto.randomBytes(6).toString('hex');
      return { id, url: `${publicUrl}/test-post/${channel.toLowerCase()}/${id}` };
    },
  };
}

export function providerFor(channel: Channel): SocialProvider {
  const c = config();
  if (c.fakeSocial) return fakeProvider(channel, c.publicUrl);
  if (channel === 'X') {
    if (!c.x) throw new AppError(503, 'X_NOT_SET_UP', 'X is not set up on the server yet.');
    return xProvider(c.x, c.publicUrl);
  }
  if (!c.linkedin) throw new AppError(503, 'LINKEDIN_NOT_SET_UP', 'LinkedIn is not set up on the server yet.');
  return linkedinProvider(c.linkedin, c.publicUrl);
}

export const channelFromParam = (value: unknown): Channel => {
  if (value === 'x') return 'X';
  if (value === 'linkedin') return 'LINKEDIN';
  throw new AppError(404, 'NOT_FOUND', 'Not found.');
};
