/**
 * Posting: a Post waits UNDO_SECONDS (Undo), then the worker sends it. Nothing posts without a
 * Post request from the signed-in user.
 */
import { Prisma } from '@prisma/client';
import {
  Channel,
  LINKEDIN_MAX,
  PostRequestSchema,
  UNDO_SECONDS,
  X_MAX,
  finalText,
  xLength,
} from '../shared/contracts.js';
import { accessTokenFor, requireConnection } from './connections.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { findIdea, toPostView } from './ideas.js';
import { logEvent } from './log.js';
import { providerFor } from './social/index.js';
import { SocialError } from './social/types.js';

/**
 * A post still "sending" this long after it was claimed is marked failed rather than risk sending it
 * twice. Claiming sets sendAt to the claim time.
 */
const STUCK_MINUTES = 5;

export async function requestPost(userId: string, ideaId: string, input: unknown, now = new Date()) {
  const { channel } = PostRequestSchema.parse(input);
  const idea = await findIdea(userId, ideaId);
  if (idea.kind === 'REPLY') throw new AppError(400, 'COPY_REPLIES', 'Reply drafts are copied and posted by you on X.');
  if (idea.status === 'SKIPPED') throw new AppError(409, 'SKIPPED', 'This idea was skipped.');
  const draft = channel === 'X' ? idea.xText : idea.linkedinText;
  if (!draft) throw new AppError(400, 'NO_TEXT', 'This idea has no text for this channel.');
  const text = finalText(idea.take, draft);
  if (channel === 'X' && xLength(text) > X_MAX)
    throw new AppError(400, 'TOO_LONG', `The X post is over ${X_MAX} characters with your take. Shorten it first.`);
  if (channel === 'LINKEDIN' && text.length > LINKEDIN_MAX)
    throw new AppError(400, 'TOO_LONG', `The LinkedIn post is over ${LINKEDIN_MAX} characters.`);
  await requireConnection(userId, idea.spaceId, channel);
  const active = idea.posts.find((p) => p.channel === channel && ['WAITING', 'SENDING', 'POSTED'].includes(p.status));
  if (active) throw new AppError(409, 'ALREADY_POSTED', 'This is already posted or on its way.');
  const post = await prisma.post.create({
    data: { userId, ideaId, channel, text, sendAt: new Date(now.getTime() + UNDO_SECONDS * 1000) },
  });
  logEvent('post_requested', { userId, postId: post.id, channel });
  return toPostView(post, idea.shortLinks);
}

export async function undoPost(userId: string, postId: string) {
  const { count } = await prisma.post.updateMany({
    where: { id: postId, userId, status: 'WAITING' },
    data: { status: 'CANCELLED' },
  });
  if (!count) {
    const exists = await prisma.post.findFirst({ where: { id: postId, userId } });
    if (!exists) throw new AppError(404, 'NOT_FOUND', 'Post not found.');
    throw new AppError(409, 'TOO_LATE', 'Too late to undo: it was already sent.');
  }
  logEvent('post_undone', { userId, postId });
  return { ok: true };
}

/** Claims due posts atomically, so two workers never send the same post. */
async function claimDue(now: Date, limit = 10) {
  // Prisma keeps DateTime as UTC in "timestamp without time zone"; compare in UTC, whatever the
  // database session's time zone is.
  const utcNow = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "Post" SET status = 'SENDING', "sendAt" = ${utcNow}
    WHERE id IN (
      SELECT id FROM "Post" WHERE status = 'WAITING' AND "sendAt" <= ${utcNow}
      ORDER BY "sendAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  return rows.map((row) => row.id);
}

async function sendOne(postId: string, now: Date) {
  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { idea: { select: { spaceId: true } } },
  });
  try {
    // The account of the draft's own space: a draft never goes out from another space's account.
    const connection = await prisma.socialConnection.findFirst({
      where: { userId: post.userId, spaceId: post.idea.spaceId, channel: post.channel },
    });
    if (!connection) throw new SocialError('reconnect', `${label(post.channel)} is not connected any more.`);
    const token = await accessTokenFor(connection, now);
    const published = await providerFor(post.channel).publish(token, connection, post.text);
    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'POSTED', postedAt: new Date(), url: published.url, error: null },
    });
    logEvent('post_sent', { userId: post.userId, postId: post.id, channel: post.channel });
  } catch (err) {
    const message =
      err instanceof SocialError || err instanceof AppError
        ? err.message
        : `${label(post.channel)} could not be reached. Try again.`;
    await prisma.post.update({ where: { id: post.id }, data: { status: 'FAILED', error: message } });
    logEvent('post_failed', {
      userId: post.userId,
      postId: post.id,
      channel: post.channel,
      errorCategory: err instanceof SocialError ? err.kind : err instanceof Error ? err.name : 'UnknownError',
    });
  }
}

const label = (channel: Channel) => (channel === 'X' ? 'X' : 'LinkedIn');

export async function sendDuePosts(now = new Date()) {
  await prisma.post.updateMany({
    where: { status: 'SENDING', sendAt: { lt: new Date(now.getTime() - STUCK_MINUTES * 60_000) } },
    data: { status: 'FAILED', error: 'Not sure this was sent. Check your profile before you post it again.' },
  });
  const ids = await claimDue(now);
  for (const id of ids) await sendOne(id, now);
  return ids.length;
}

export function startPostingWorker(intervalMs = 2000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sendDuePosts();
    } catch (err) {
      logEvent('posting_worker_error', { errorCategory: err instanceof Error ? err.name : 'UnknownError' });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
