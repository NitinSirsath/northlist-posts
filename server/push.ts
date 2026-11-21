/**
 * Web push alerts ("3 new drafts"). Needs VAPID keys; without them alerts are simply off.
 */
import webpush from 'web-push';
import { z } from 'zod';
import { config } from './config.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';
import { logEvent } from './log.js';

const SubscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .max(1000)
      .refine((v) => v.startsWith('https://'), 'https only'),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  })
  .passthrough();

export async function subscribe(userId: string, input: unknown) {
  if (!config().vapid) throw new AppError(503, 'ALERTS_OFF', 'Alerts are not set up on the server.');
  const sub = SubscriptionSchema.parse(input);
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return { ok: true };
}

export async function unsubscribe(userId: string, input: unknown) {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(input);
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return { ok: true };
}

/** Best effort: a failed alert never fails the request that caused it. */
export async function alertUser(userId: string, title: string, body: string, url = '/') {
  const vapid = config().vapid;
  if (!vapid) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const payload = JSON.stringify({ title, body, url });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidDetails: vapid, TTL: 6 * 3600 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Gone: the browser dropped this subscription.
        if (status === 404 || status === 410)
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        else logEvent('alert_failed', { userId, status: status ?? null });
      }
    }),
  );
}
