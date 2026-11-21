/** The Posted page: this week's posts, clicks on product links, replies copied. */
import type { PostedSummary } from '../shared/contracts.js';
import { prisma } from './db.js';
import { toPostView } from './ideas.js';

const WEEK_MS = 7 * 86_400_000;

export async function postedSummary(userId: string, now = new Date()): Promise<PostedSummary> {
  const since = new Date(now.getTime() - WEEK_MS);
  const [posts, replies] = await Promise.all([
    prisma.post.findMany({
      where: { userId, status: { in: ['POSTED', 'FAILED'] }, createdAt: { gte: since } },
      include: { idea: { include: { shortLinks: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.idea.count({ where: { userId, kind: 'REPLY', copiedAt: { gte: since } } }),
  ]);
  const views = posts.map((post) => toPostView(post, post.idea.shortLinks));
  const posted = views.filter((p) => p.status === 'POSTED');
  const count = (channel: 'X' | 'LINKEDIN', key: 'one' | 'clicks') =>
    posted.filter((p) => p.channel === channel).reduce((sum, p) => sum + (key === 'one' ? 1 : (p.clicks ?? 0)), 0);
  return {
    postsThisWeek: posted.length,
    postsByChannel: { X: count('X', 'one'), LINKEDIN: count('LINKEDIN', 'one') },
    clicksThisWeek: count('X', 'clicks') + count('LINKEDIN', 'clicks'),
    clicksByChannel: { X: count('X', 'clicks'), LINKEDIN: count('LINKEDIN', 'clicks') },
    repliesCopiedThisWeek: replies,
    posts: views,
    ideaTitles: Object.fromEntries(posts.map((post) => [post.ideaId, post.idea.title])),
  };
}

/** /r/:code — counts one click and opens the real page. Unknown codes go to the home page. */
export async function followShortLink(code: string) {
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return null;
  const link = await prisma.shortLink.update({ where: { code }, data: { clicks: { increment: 1 } } }).catch(() => null);
  return link?.targetUrl ?? null;
}
