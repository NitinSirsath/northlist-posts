/**
 * Post ideas: sent by the AI (submit_drafts), shown on Today, edited, skipped, posted.
 */
import { Prisma } from '@prisma/client';
import type { Idea, Post, ShortLink } from '@prisma/client';
import crypto from 'node:crypto';
import { IdeaEditSchema, IdeaView, PostView, SubmitDraftsSchema, SubmitIdea } from '../shared/contracts.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { getProfile } from './profile.js';
import { sha256 } from './secrets.js';

const DAY_MS = 86_400_000;
/** Ideas older than this leave Today. */
export const TODAY_DAYS = 3;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type IdeaRow = Idea & { posts: Post[]; shortLinks: ShortLink[] };

export function toPostView(post: Post, links: ShortLink[]): PostView {
  // Only links still in the posted text are counted; a post with none shows no click count at all.
  const tracked = links.filter((link) => link.channel === post.channel && post.text.includes(`/r/${link.code}`));
  return {
    id: post.id,
    ideaId: post.ideaId,
    channel: post.channel,
    text: post.text,
    status: post.status,
    sendAt: post.sendAt.toISOString(),
    postedAt: post.postedAt?.toISOString() ?? null,
    url: post.url,
    error: post.error,
    clicks: tracked.length ? tracked.reduce((sum, link) => sum + link.clicks, 0) : null,
  };
}

export function toIdeaView(row: IdeaRow): IdeaView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    why: row.why,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    mentionsProduct: row.mentionsProduct,
    replyTo:
      row.replyToUrl && row.replyToAuthor && row.replyToText
        ? { url: row.replyToUrl, author: row.replyToAuthor, text: row.replyToText }
        : null,
    xText: row.xText,
    linkedinText: row.linkedinText,
    take: row.take,
    skipped: row.status === 'SKIPPED',
    copied: row.copiedAt !== null,
    fromAi: row.fromAi,
    createdAt: row.createdAt.toISOString(),
    posts: row.posts
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((post) => toPostView(post, row.shortLinks)),
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const newCode = () => Array.from(crypto.randomBytes(7), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');

const dedupeKeyOf = (idea: SubmitIdea) =>
  sha256(JSON.stringify([idea.kind, idea.title, idea.x ?? '', idea.linkedin ?? '', idea.replyTo?.url ?? '']));

/** Product links in one text become our short links (one per channel), so clicks can be counted. */
function shortenProductLinks(text: string, productHost: string | null) {
  const found: { code: string; targetUrl: string }[] = [];
  if (!productHost) return { text, found };
  const out = text.replace(URL_PATTERN, (url) => {
    const host = hostOf(url);
    if (!host || (host !== productHost && !host.endsWith(`.${productHost}`))) return url;
    const code = newCode();
    found.push({ code, targetUrl: url });
    return `${config().publicUrl}/r/${code}`;
  });
  return { text: out, found };
}

export interface SubmitResult {
  created: number;
  results: { title: string; result: 'created' | 'already_sent'; id: string }[];
}

export async function submitDrafts(userId: string, fromAi: string, input: unknown): Promise<SubmitResult> {
  const { ideas } = SubmitDraftsSchema.parse(input);
  const profile = await getProfile(userId);
  const productHost = profile.productUrl ? hostOf(profile.productUrl) : null;
  const productName = profile.productName.trim().toLowerCase();
  const results: SubmitResult['results'] = [];
  for (const idea of ideas) {
    const dedupeKey = dedupeKeyOf(idea);
    const existing = await prisma.idea.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } });
    if (existing) {
      results.push({ title: idea.title, result: 'already_sent', id: existing.id });
      continue;
    }
    const x = idea.x ? shortenProductLinks(idea.x, productHost) : null;
    const li = idea.linkedin ? shortenProductLinks(idea.linkedin, productHost) : null;
    const texts = `${idea.x ?? ''}\n${idea.linkedin ?? ''}`.toLowerCase();
    const mentionsProduct =
      Boolean(x?.found.length || li?.found.length) || (productName.length > 1 && texts.includes(productName));
    try {
      const row = await prisma.idea.create({
        data: {
          userId,
          kind: idea.kind,
          title: idea.title,
          why: idea.why ?? '',
          sourceUrl: idea.sourceUrl ?? null,
          sourceName: idea.sourceName ?? null,
          mentionsProduct,
          replyToUrl: idea.replyTo?.url ?? null,
          replyToAuthor: idea.replyTo?.author ?? null,
          replyToText: idea.replyTo?.text ?? null,
          xText: x?.text ?? null,
          linkedinText: li?.text ?? null,
          fromAi,
          dedupeKey,
          shortLinks: {
            create: [
              ...(x?.found ?? []).map((link) => ({ ...link, userId, channel: 'X' as const })),
              ...(li?.found ?? []).map((link) => ({ ...link, userId, channel: 'LINKEDIN' as const })),
            ],
          },
        },
      });
      results.push({ title: idea.title, result: 'created', id: row.id });
    } catch (err) {
      // The same idea sent twice at the same moment: keep one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await prisma.idea.findUniqueOrThrow({ where: { userId_dedupeKey: { userId, dedupeKey } } });
        results.push({ title: idea.title, result: 'already_sent', id: row.id });
      } else throw err;
    }
  }
  return { created: results.filter((r) => r.result === 'created').length, results };
}

const withPosts = { posts: true, shortLinks: true } as const;

export async function listToday(userId: string, now = new Date()) {
  const rows = await prisma.idea.findMany({
    where: { userId, status: 'NEW', createdAt: { gte: new Date(now.getTime() - TODAY_DAYS * DAY_MS) } },
    include: withPosts,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map(toIdeaView);
}

export async function findIdea(userId: string, id: string) {
  const row = await prisma.idea.findFirst({ where: { id, userId }, include: withPosts });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'This idea is gone.');
  return row;
}

export async function editIdea(userId: string, id: string, input: unknown) {
  const patch = IdeaEditSchema.parse(input);
  const row = await findIdea(userId, id);
  if (patch.xText !== undefined && row.xText === null) throw new AppError(400, 'NO_X_TEXT', 'This idea has no X text.');
  if (patch.linkedinText !== undefined && row.linkedinText === null)
    throw new AppError(400, 'NO_LINKEDIN_TEXT', 'This idea has no LinkedIn text.');
  await prisma.idea.update({ where: { id }, data: patch });
  return toIdeaView(await findIdea(userId, id));
}

export async function skipIdea(userId: string, id: string) {
  await findIdea(userId, id);
  await prisma.idea.update({ where: { id }, data: { status: 'SKIPPED' } });
  return { ok: true };
}

export async function markCopied(userId: string, id: string, now = new Date()) {
  const row = await findIdea(userId, id);
  if (row.kind !== 'REPLY') throw new AppError(400, 'NOT_A_REPLY', 'Only reply drafts are copied.');
  await prisma.idea.update({ where: { id }, data: { copiedAt: now } });
  return toIdeaView(await findIdea(userId, id));
}

/** For the AI (get_recent_posts): what went out lately and what is still waiting, so it does not repeat. */
export async function recentForAi(userId: string, now = new Date()) {
  const [posts, waiting, sentToday] = await Promise.all([
    prisma.post.findMany({
      where: { userId, status: 'POSTED' },
      include: {
        idea: { select: { title: true, kind: true, shortLinks: { select: { code: true, targetUrl: true } } } },
      },
      orderBy: { postedAt: 'desc' },
      take: 30,
    }),
    prisma.idea.findMany({
      where: {
        userId,
        status: 'NEW',
        createdAt: { gte: new Date(now.getTime() - TODAY_DAYS * DAY_MS) },
        posts: { none: { status: { in: ['WAITING', 'SENDING', 'POSTED'] } } },
      },
      select: { title: true, kind: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.idea.groupBy({
      by: ['kind'],
      where: { userId, createdAt: { gte: new Date(now.getTime() - 20 * 3_600_000) } },
      _count: true,
    }),
  ]);
  return {
    posted: posts.map((post) => ({
      channel: post.channel,
      postedAt: post.postedAt?.toISOString() ?? null,
      kind: post.idea.kind,
      title: post.idea.title,
      // The AI sees the real links, so it never copies a click-counting link into a new draft.
      text: post.idea.shortLinks.reduce(
        (text, link) => text.split(`${config().publicUrl}/r/${link.code}`).join(link.targetUrl),
        post.text,
      ),
    })),
    waiting: waiting.map((idea) => ({ kind: idea.kind, title: idea.title, sentAt: idea.createdAt.toISOString() })),
    sentInLast20Hours: Object.fromEntries(sentToday.map((row) => [row.kind, row._count])),
  };
}
