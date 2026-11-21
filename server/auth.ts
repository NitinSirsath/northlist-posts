/**
 * Sign-in: Google (name and email only), limited to OWNER_EMAIL. Sessions are a random cookie;
 * only its SHA-256 is stored. DEV_LOGIN skips Google on a local machine.
 */
import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { z } from 'zod';
import { config } from './config.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { logEvent } from './log.js';
import { randomToken, sha256 } from './secrets.js';

export const SESSION_COOKIE = 'nlp_session';
const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;
const STATE_MINUTES = 10;

export interface SignedInUser {
  id: string;
  email: string;
  name: string;
}

export const userOf = (res: Response) => res.locals.user as SignedInUser;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config().production,
  path: '/',
});

export const isOwnerEmail = (email: string) => config().ownerEmails.includes(email.trim().toLowerCase());

/** Finds or makes the user and their empty profile. */
export async function upsertOwner(email: string, name: string) {
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name },
    create: { email: email.toLowerCase(), name },
  });
  await prisma.profile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  return user;
}

export async function startSession(res: Response, userId: string, now = new Date()) {
  const token = randomToken();
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) },
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_DAYS * DAY_MS });
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token.length >= 20 && token.length <= 100) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    // Someone removed from OWNER_EMAIL loses access at once.
    if (session && session.expiresAt > new Date() && isOwnerEmail(session.user.email)) {
      res.locals.user = { id: session.user.id, email: session.user.email, name: session.user.name };
      return next();
    }
  }
  next(new AppError(401, 'SIGNED_OUT', 'Sign in first.'));
}

export async function signOut(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ ok: true });
}

function googleClient() {
  const google = config().google;
  if (!google) throw new AppError(503, 'GOOGLE_NOT_SET_UP', 'Google sign-in is not set up on the server.');
  return new OAuth2Client({
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    redirectUri: `${config().publicUrl}/api/auth/google/callback`,
  });
}

export async function saveOAuthState(purpose: string, verifier: string, userId: string | null) {
  const state = randomToken(24);
  const now = new Date();
  await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.oAuthState.create({
    data: { state, purpose, verifier, userId, expiresAt: new Date(now.getTime() + STATE_MINUTES * 60_000) },
  });
  return state;
}

/** One use only: the row is deleted as it is read. */
export async function takeOAuthState(state: unknown, purpose: string) {
  if (typeof state !== 'string' || state.length > 100) return null;
  const row = await prisma.oAuthState.findUnique({ where: { state } });
  if (!row) return null;
  await prisma.oAuthState.delete({ where: { state } });
  if (row.purpose !== purpose || row.expiresAt < new Date()) return null;
  return row;
}

export async function googleStart(_req: Request, res: Response) {
  const client = googleClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = await saveOAuthState('google', codeVerifier, null);
  res.redirect(
    client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  );
}

export async function googleCallback(req: Request, res: Response) {
  const row = await takeOAuthState(req.query.state, 'google');
  if (!row || typeof req.query.code !== 'string') return res.redirect('/sign-in?error=expired');
  const client = googleClient();
  try {
    const { tokens } = await client.getToken({ code: req.query.code, codeVerifier: row.verifier });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token ?? '', audience: config().google!.clientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) return res.redirect('/sign-in?error=google');
    if (!isOwnerEmail(payload.email)) {
      logEvent('sign_in_refused', { reason: 'not_owner' });
      return res.redirect('/sign-in?error=private');
    }
    const user = await upsertOwner(payload.email, payload.name || payload.email.split('@')[0]);
    await startSession(res, user.id);
    logEvent('signed_in', { userId: user.id, method: 'google' });
    res.redirect('/');
  } catch (err) {
    logEvent('sign_in_failed', { errorCategory: err instanceof Error ? err.name : 'UnknownError' });
    res.redirect('/sign-in?error=google');
  }
}

const DevLoginSchema = z.object({ email: z.string().trim().email().max(200) }).strict();

/** Local testing only (DEV_LOGIN=1, never in production): sign in as an owner email without Google. */
export async function devLogin(req: Request, res: Response) {
  if (!config().devLogin) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  const { email } = DevLoginSchema.parse(req.body);
  if (!isOwnerEmail(email)) throw new AppError(403, 'PRIVATE', 'This app is private.');
  const user = await upsertOwner(email, email.split('@')[0]);
  await startSession(res, user.id);
  res.json({ ok: true });
}
