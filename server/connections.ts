/**
 * Connecting X and LinkedIn (OAuth) to a space, listing and removing them, and getting a working access
 * token. Each space has at most one X and one LinkedIn account, and an account is in one space only.
 */
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { SocialConnection } from '@prisma/client';
import type { Channel, ConnectionView } from '../shared/contracts.js';
import { saveOAuthState, takeOAuthState, userOf } from './auth.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { logEvent } from './log.js';
import { decrypt, encrypt, randomToken } from './secrets.js';
import { channelFromParam, providerFor } from './social/index.js';
import { findSpace } from './spaces.js';
import { SocialError } from './social/types.js';

const DAY_MS = 86_400_000;
const param = (channel: Channel) => (channel === 'X' ? 'x' : 'linkedin');

export function toConnectionView(row: SocialConnection, now = new Date()): ConnectionView {
  return {
    channel: row.channel,
    spaceId: row.spaceId,
    accountName: row.accountName,
    expiresInDays: row.expiresAt ? Math.max(0, Math.floor((row.expiresAt.getTime() - now.getTime()) / DAY_MS)) : null,
  };
}

export async function listConnections(userId: string) {
  const rows = await prisma.socialConnection.findMany({ where: { userId }, orderBy: { channel: 'asc' } });
  return rows.map((row) => toConnectionView(row));
}

/** Where the user comes back to after X or LinkedIn: the first-run steps or the Space page. */
const BACK = { welcome: '/welcome', space: '/space' } as const;
type Back = keyof typeof BACK;
const backOf = (value: unknown): Back => (value === 'welcome' ? 'welcome' : 'space');

export async function connectStart(req: Request, res: Response) {
  const channel = channelFromParam(req.params.channel);
  const user = userOf(res);
  const space = await findSpace(user.id, String(req.query.space ?? ''));
  const provider = providerFor(channel);
  const verifier = randomToken(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = await saveOAuthState(`connect:${channel}:${space.id}:${backOf(req.query.back)}`, verifier, user.id);
  res.redirect(provider.authUrl(state, challenge));
}

export async function connectCallback(req: Request, res: Response) {
  const channel = channelFromParam(req.params.channel);
  const row = await takeOAuthState(req.query.state, (purpose) => purpose.startsWith(`connect:${channel}:`));
  const [, , spaceId = '', backKey] = (row?.purpose ?? '').split(':');
  const back = `${BACK[backOf(backKey)]}?channel=${param(channel)}`;
  if (!row?.userId) return res.redirect(`${back}&error=expired`);
  // The signed-in user must be the one who started, so a link cannot attach someone else's account.
  if (row.userId !== userOf(res).id) return res.redirect(`${back}&error=expired`);
  if (typeof req.query.code !== 'string') return res.redirect(`${back}&error=denied`);
  try {
    const account = await providerFor(channel).exchange(req.query.code, row.verifier);
    const space = await prisma.space.findFirst({ where: { id: spaceId, userId: row.userId } });
    if (!space) return res.redirect(`${back}&error=expired`);
    const elsewhere = await prisma.socialConnection.findFirst({
      where: { userId: row.userId, channel, accountId: account.accountId, NOT: { spaceId: space.id } },
    });
    if (elsewhere) return res.redirect(`${back}&error=other_space`);
    const data = {
      accountId: account.accountId,
      accountName: account.accountName,
      accessTokenEnc: encrypt(account.accessToken),
      refreshTokenEnc: account.refreshToken ? encrypt(account.refreshToken) : null,
      expiresAt: account.expiresAt ?? null,
    };
    await prisma.socialConnection.upsert({
      where: { spaceId_channel: { spaceId: space.id, channel } },
      update: data,
      create: { userId: row.userId, spaceId: space.id, channel, ...data },
    });
    logEvent('social_connected', { userId: row.userId, channel });
    res.redirect(`${back}&connected=1`);
  } catch (err) {
    logEvent('social_connect_failed', { channel, errorCategory: err instanceof Error ? err.name : 'UnknownError' });
    res.redirect(`${back}&error=failed`);
  }
}

export async function removeConnection(userId: string, spaceId: string, channelParam: unknown) {
  const channel = channelFromParam(channelParam);
  await findSpace(userId, spaceId);
  await prisma.socialConnection.deleteMany({ where: { userId, spaceId, channel } });
  return { ok: true };
}

/** A working access token, refreshed first when it is about to run out. */
export async function accessTokenFor(connection: SocialConnection, now = new Date()) {
  const soon = new Date(now.getTime() + 60_000);
  if (!connection.expiresAt || connection.expiresAt > soon) return decrypt(connection.accessTokenEnc);
  const provider = providerFor(connection.channel);
  if (!provider.refresh || !connection.refreshTokenEnc)
    throw new SocialError(
      'reconnect',
      `${connection.channel === 'X' ? 'X' : 'LinkedIn'} sign-in ran out. Reconnect it on Connect.`,
    );
  const tokens = await provider.refresh(decrypt(connection.refreshTokenEnc));
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : connection.refreshTokenEnc,
      expiresAt: tokens.expiresAt ?? null,
    },
  });
  return tokens.accessToken;
}

export async function requireConnection(userId: string, spaceId: string, channel: Channel) {
  const row = await prisma.socialConnection.findFirst({ where: { userId, spaceId, channel } });
  if (!row)
    throw new AppError(
      409,
      'NOT_CONNECTED',
      `Connect ${channel === 'X' ? 'X' : 'LinkedIn'} to this space first, on the Space page.`,
    );
  return row;
}
