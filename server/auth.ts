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
    redirectUri: google.redirectUri,
  });
}

export async function googleStart(_req: Request, res: Response, next: NextFunction) {
  try {
    const state = randomToken();
    const verifier = randomToken(48);
    const client = googleClient();
    const challenge = await client.generateCodeVerifierAsync();
    const codeVerifier = challenge.codeVerifier;
    const codeChallenge = challenge.codeChallenge;
    await prisma.oAuthState.create({
      data: {
        state,
        purpose: 'sign-in',
        verifier: codeVerifier,
        expiresAt: new Date(Date.now() + STATE_MINUTES * 60_000),
      },
    });
    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account',
    });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

const CallbackSchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state } = CallbackSchema.parse(req.query);
    const row = await prisma.oAuthState.findUnique({ where: { state } });
    if (!row || row.purpose !== 'sign-in' || row.expiresAt < new Date())
      throw new AppError(400, 'BAD_OAUTH_STATE', 'Sign-in expired. Try again.');
    await prisma.oAuthState.delete({ where: { state } });
    const client = googleClient();
    const { tokens } = await client.getToken({ code, codeVerifier: row.verifier });
    if (!tokens.id_token) throw new AppError(401, 'GOOGLE_NO_ID_TOKEN', 'Google did not return an identity.');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config().google?.clientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified || !isOwnerEmail(payload.email))
      throw new AppError(403, 'NOT_OWNER', 'This email is not allowed to sign in.');
    const user = await upsertOwner(payload.email, payload.name ?? payload.email);
    await startSession(res, user.id);
    logEvent('sign_in', { method: 'google' });
    res.redirect('/');
  } catch (err) {
    next(err);
  }
}

export async function devLogin(req: Request, res: Response, next: NextFunction) {
  try {
    if (config().production || !config().devLogin) throw new AppError(404, 'NOT_FOUND', 'Not found.');
    const email = z.object({ email: z.string().email() }).parse(req.body).email.toLowerCase();
    if (!isOwnerEmail(email)) throw new AppError(403, 'NOT_OWNER', 'This email is not allowed to sign in.');
    const user = await upsertOwner(email, email);
    await startSession(res, user.id);
    logEvent('sign_in', { method: 'dev' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
