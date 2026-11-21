/**
 * All settings come from environment variables (Render settings in production, .env locally).
 * Read once per call so tests can pass their own env.
 */
export interface Config {
  production: boolean;
  port: number;
  /** Public address of this app, no trailing slash, e.g. https://posts.northlist.site */
  publicUrl: string;
  /** Who may sign in (comma list). Empty = nobody. */
  ownerEmails: string[];
  google: { clientId: string; clientSecret: string } | null;
  x: { clientId: string; clientSecret: string } | null;
  linkedin: { clientId: string; clientSecret: string; apiVersion: string } | null;
  /** 32-byte key, base64, for X and LinkedIn tokens. */
  encryptionKey: Buffer;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  /** Local testing only: fake X and LinkedIn, no real posts. Refused in production. */
  fakeSocial: boolean;
  /** Local testing only: sign in without Google. Refused in production. */
  devLogin: boolean;
  /** Host names allowed on /mcp. Defaults to the public URL's host plus localhost. */
  mcpAllowedHosts: string[];
  kitUrl: string;
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

const pair = (id: string | undefined, secret: string | undefined) =>
  id && secret ? { clientId: id, clientSecret: secret } : null;

const on = (value: string | undefined) => value === '1' || value === 'true';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const publicUrl = (env.PUBLIC_URL ?? 'http://localhost:5590').replace(/\/+$/, '');
  const keyText = env.ENCRYPTION_KEY ?? '';
  let encryptionKey = Buffer.from(keyText, 'base64');
  if (encryptionKey.length !== 32) {
    if (production) throw new Error('ENCRYPTION_KEY must be 32 bytes in base64');
    // Local only: a fixed throwaway key so the app starts without setup.
    encryptionKey = Buffer.alloc(32, 7);
  }
  const fakeSocial = on(env.FAKE_SOCIAL);
  const devLogin = on(env.DEV_LOGIN);
  if (production && (fakeSocial || devLogin)) throw new Error('FAKE_SOCIAL and DEV_LOGIN are for local testing only');
  const publicHost = new URL(publicUrl).hostname.toLowerCase();
  const x = pair(env.X_CLIENT_ID, env.X_CLIENT_SECRET);
  const li = pair(env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET);
  return {
    production,
    port: Number(env.PORT ?? 3590),
    publicUrl,
    ownerEmails: list(env.OWNER_EMAIL),
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    x,
    linkedin: li ? { ...li, apiVersion: env.LINKEDIN_API_VERSION || '202611' } : null,
    encryptionKey,
    vapid:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:hello@northlist.site',
          }
        : null,
    fakeSocial,
    devLogin,
    mcpAllowedHosts: [...new Set([publicHost, 'localhost', '127.0.0.1', ...list(env.MCP_ALLOWED_HOSTS)])],
    kitUrl: env.KIT_URL || 'https://github.com/NitinSirsath/northlist-posts-kit',
  };
}

let current: Config | undefined;
export const config = () => (current ??= loadConfig());
/** Tests only. */
export const setConfig = (next: Config | undefined) => {
  current = next;
};
