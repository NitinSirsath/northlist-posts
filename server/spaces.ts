/**
 * Spaces (owner, 22 Nov 2026): each is one goal with its own links, interests, voice, rhythm and its own
 * X and LinkedIn accounts. The app edits them; the AI reads them all (get_profile) and may change one
 * (save_profile).
 */
import type { SourceLink, Space } from '@prisma/client';
import {
  AddLinkSchema,
  CreateSpaceSchema,
  LINKS_MAX,
  SPACES_MAX,
  SpaceFieldsSchema,
  SpacePatch,
  SpacePatchSchema,
  SpaceView,
  SourceLinkView,
  normalizeLink,
} from '../shared/contracts.js';
import { toConnectionView } from './connections.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { TODAY_SINCE } from './ideas.js';
import { readLink, type ReaderDeps } from './linkReader.js';

export const toLinkView = (row: SourceLink): SourceLinkView => ({
  id: row.id,
  url: row.url,
  kind: row.kind,
  title: row.title,
  description: row.description,
  isPrivate: row.isPrivate,
  readOk: row.readOk,
});

const withParts = {
  links: { orderBy: { createdAt: 'asc' } },
  connections: { orderBy: { channel: 'asc' } },
} as const;

type SpaceRow = Space & {
  links: SourceLink[];
  connections: Parameters<typeof toConnectionView>[0][];
};

function toSpaceView(row: SpaceRow, newDrafts: number): SpaceView {
  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    productName: row.productName,
    productUrl: row.productUrl,
    productLine: row.productLine,
    interests: row.interests,
    postsPerDay: row.postsPerDay,
    repliesPerDay: row.repliesPerDay,
    useX: row.useX,
    useLinkedIn: row.useLinkedIn,
    tone: row.tone,
    styleSamples: row.styleSamples,
    readyAt: row.readyAt,
    weekends: row.weekends,
    links: row.links.map(toLinkView),
    connections: row.connections.map((c) => toConnectionView(c)),
    newDrafts,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function newDraftCounts(userId: string, now = new Date()) {
  const rows = await prisma.idea.groupBy({
    by: ['spaceId'],
    where: { userId, status: 'NEW', createdAt: { gte: TODAY_SINCE(now) } },
    _count: true,
  });
  return new Map(rows.map((r) => [r.spaceId, r._count]));
}

export async function listSpaces(userId: string) {
  const [rows, counts] = await Promise.all([
    prisma.space.findMany({
      where: { userId },
      include: withParts,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),
    newDraftCounts(userId),
  ]);
  return rows.map((row) => toSpaceView(row, counts.get(row.id) ?? 0));
}

/** The user's space with this id; a missing or foreign id is "not found", never someone else's. */
export async function findSpace(userId: string, spaceId: string) {
  const row = await prisma.space.findFirst({ where: { id: spaceId, userId }, include: withParts });
  if (!row) throw new AppError(404, 'SPACE_NOT_FOUND', 'This space is gone.');
  return row;
}

export async function getSpace(userId: string, spaceId: string) {
  const row = await findSpace(userId, spaceId);
  const counts = await newDraftCounts(userId);
  return toSpaceView(row, counts.get(row.id) ?? 0);
}

/**
 * For the AI: the space it means. With one space the id may be left out; with more it must say which.
 */
export async function resolveSpace(userId: string, spaceId: string | undefined) {
  if (spaceId) return findSpace(userId, spaceId);
  const rows = await prisma.space.findMany({ where: { userId }, include: withParts, take: 2 });
  if (rows.length === 1) return rows[0]!;
  if (!rows.length) throw new AppError(409, 'NO_SPACE', 'Set up a space in the app first.');
  throw new AppError(400, 'SPACE_REQUIRED', 'This user has more than one space: say which one with "space".');
}

const GOAL_NAMES = { PROMOTE: 'My product', NETWORK: 'Personal', JOB: 'Job search' } as const;

export async function createSpace(userId: string, input: unknown) {
  const fields = CreateSpaceSchema.parse(input);
  const count = await prisma.space.count({ where: { userId } });
  if (count >= SPACES_MAX) throw new AppError(409, 'TOO_MANY_SPACES', `At most ${SPACES_MAX} spaces.`);
  const row = await prisma.space.create({
    data: { userId, ...fields, name: fields.name ?? GOAL_NAMES[fields.goal], position: count },
    include: withParts,
  });
  return toSpaceView(row, 0);
}

/** Saves any subset of the fields. `by` is "you" (the app) or the AI token's name. */
export async function updateSpace(userId: string, spaceId: string, input: unknown, by: string) {
  const patch: SpacePatch = SpacePatchSchema.parse(input);
  const current = await findSpace(userId, spaceId);
  const merged = { ...toSpaceView(current, 0), ...patch };
  SpaceFieldsSchema.parse({ ...merged, links: undefined, connections: undefined });
  await prisma.space.update({ where: { id: current.id }, data: { ...patch, updatedBy: by } });
  return getSpace(userId, spaceId);
}

export async function deleteSpace(userId: string, spaceId: string) {
  await findSpace(userId, spaceId);
  const count = await prisma.space.count({ where: { userId } });
  if (count <= 1) throw new AppError(409, 'LAST_SPACE', 'You need at least one space.');
  await prisma.space.delete({ where: { id: spaceId } });
  return { ok: true };
}

/** Adds a link and reads its title and one line; the first website also names an unnamed product. */
export async function addLink(userId: string, spaceId: string, input: unknown, deps?: ReaderDeps) {
  const { url: raw } = AddLinkSchema.parse(input);
  const url = normalizeLink(raw);
  if (!url) throw new AppError(400, 'BAD_LINK', 'That does not look like a web link.');
  const space = await findSpace(userId, spaceId);
  if (space.links.length >= LINKS_MAX) throw new AppError(409, 'TOO_MANY_LINKS', `At most ${LINKS_MAX} links.`);
  const read = await readLink(url, deps);
  const existing = space.links.find((l) => l.url === read.url);
  if (existing) return toLinkView(existing);
  const row = await prisma.sourceLink.create({
    data: {
      spaceId,
      url: read.url,
      kind: read.kind,
      title: read.title,
      description: read.description,
      isPrivate: read.isPrivate,
      readOk: read.readOk,
    },
  });
  // The product's site, once: fills the product fields the user would otherwise type.
  if (read.kind === 'WEBSITE' && !space.productUrl) {
    const name =
      read.title
        .split(/\s+[—|·:–-]\s+/)[0]
        ?.trim()
        .slice(0, 80) ?? '';
    await prisma.space.update({
      where: { id: spaceId },
      data: {
        productUrl: read.url,
        productName: space.productName || name,
        productLine: space.productLine || read.description.slice(0, 200),
        ...(GOAL_NAMES[space.goal] === space.name && name ? { name: name.slice(0, 40) } : {}),
      },
    });
  }
  return toLinkView(row);
}

export async function removeLink(userId: string, spaceId: string, linkId: string) {
  await findSpace(userId, spaceId);
  await prisma.sourceLink.deleteMany({ where: { id: linkId, spaceId } });
  return { ok: true };
}

/** What the AI reads for one space: everything it needs to write, nothing it does not. */
export function spaceForAi(row: Awaited<ReturnType<typeof findSpace>>) {
  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    product:
      row.productName || row.productUrl ? { name: row.productName, url: row.productUrl, line: row.productLine } : null,
    links: row.links.map((l) => ({
      url: l.url,
      kind: l.kind,
      title: l.title,
      ...(l.description ? { about: l.description } : {}),
      ...(l.isPrivate ? { private: true } : {}),
    })),
    interests: row.interests,
    postsPerDay: row.postsPerDay,
    tone: row.tone,
    styleSamples: row.styleSamples,
    readyAt: row.readyAt,
    weekends: row.weekends,
    channels: row.connections
      .filter((c) => (c.channel === 'X' ? row.useX : row.useLinkedIn))
      .map((c) => ({ channel: c.channel, account: c.accountName })),
  };
}
