/**
 * MCP tokens for the user's AI (copied from NorthList's integration tokens).
 * Format `nlpost_` + 32 random bytes in base64url. Only the SHA-256 and a display prefix are kept;
 * the plaintext is returned once, at creation, and never logged.
 */
import type { IntegrationToken } from '@prisma/client';
import { CreateTokenSchema, IntegrationTokenView } from '../shared/contracts.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { logEvent } from './log.js';
import { randomToken, sha256 } from './secrets.js';

export const TOKEN_PREFIX = 'nlpost_';
const TOKEN_FORMAT = /^nlpost_[A-Za-z0-9_-]{43}$/;
export const TOKEN_DAYS = 365;
export const MAX_ACTIVE_TOKENS = 5;
const DAY_MS = 86_400_000;

function statusOf(row: IntegrationToken, now: Date): IntegrationTokenView['status'] {
  if (row.revokedAt) return 'revoked';
  return row.expiresAt <= now ? 'expired' : 'active';
}

export function toTokenView(row: IntegrationToken, now = new Date()): IntegrationTokenView {
  return {
    id: row.id,
    name: row.name,
    displayPrefix: row.displayPrefix,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    status: statusOf(row, now),
  };
}

export async function createToken(userId: string, input: unknown, now = new Date()) {
  const { name } = CreateTokenSchema.parse(input);
  const active = await prisma.integrationToken.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } });
  if (active >= MAX_ACTIVE_TOKENS)
    throw new AppError(409, 'TOKEN_LIMIT', `You can have ${MAX_ACTIVE_TOKENS} AI connections. Revoke one first.`);
  const plaintext = TOKEN_PREFIX + randomToken(32);
  const row = await prisma.integrationToken.create({
    data: {
      userId,
      name,
      tokenHash: sha256(plaintext),
      displayPrefix: plaintext.slice(0, 12),
      createdAt: now,
      expiresAt: new Date(now.getTime() + TOKEN_DAYS * DAY_MS),
    },
  });
  logEvent('token_created', { userId, tokenId: row.id });
  return { token: toTokenView(row, now), plaintext };
}

export async function listTokens(userId: string) {
  const rows = await prisma.integrationToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
  return rows.map((row) => toTokenView(row));
}

export async function revokeToken(userId: string, id: string, now = new Date()) {
  const { count } = await prisma.integrationToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: now },
  });
  const row = await prisma.integrationToken.findFirst({ where: { id, userId } });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  if (count) logEvent('token_revoked', { userId, tokenId: id });
  return toTokenView(row, now);
}

/** The token's owner and name, or null for anything unusable. */
export async function verifyToken(presented: string, now = new Date()) {
  if (!TOKEN_FORMAT.test(presented)) return null;
  const row = await prisma.integrationToken.findUnique({ where: { tokenHash: sha256(presented) } });
  if (!row || statusOf(row, now) !== 'active') return null;
  await prisma.integrationToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return { tokenId: row.id, userId: row.userId, name: row.name, expiresAt: row.expiresAt };
}
