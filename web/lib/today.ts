/** How Today sorts the drafts: what came in this run, what is left from earlier runs, and what is done. */
import type { Channel, IdeaView } from '../../shared/contracts';

/** A run of `daily` sends its drafts within minutes; anything older than this is from an earlier day. */
export const FRESH_HOURS = 20;

export const channelsOf = (idea: IdeaView): Channel[] => [
  ...(idea.xText !== null ? (['X'] as const) : []),
  ...(idea.linkedinText !== null ? (['LINKEDIN'] as const) : []),
];

/** The latest post per channel is that channel's state. */
export const latestPost = (idea: IdeaView, channel: Channel) =>
  idea.posts.filter((post) => post.channel === channel).at(-1);

/** Posted on every channel it has a text for. */
export const isDone = (idea: IdeaView) =>
  channelsOf(idea).every((channel) => latestPost(idea, channel)?.status === 'POSTED');

export interface TodayGroups {
  fresh: IdeaView[];
  earlier: IdeaView[];
  done: IdeaView[];
}

/** Reply drafts are not part of this version, so they never show. The list from the server is newest first. */
export function groupToday(ideas: IdeaView[], now = Date.now()): TodayGroups {
  const cutoff = now - FRESH_HOURS * 3_600_000;
  const posts = ideas.filter((idea) => idea.kind !== 'REPLY');
  const open = posts.filter((idea) => !isDone(idea));
  return {
    fresh: open.filter((idea) => new Date(idea.createdAt).getTime() >= cutoff),
    earlier: open.filter((idea) => new Date(idea.createdAt).getTime() < cutoff),
    done: posts.filter(isDone),
  };
}

/** The draft to open when none is picked: the newest one still to post, else the newest done one. */
export const firstOf = (groups: TodayGroups) => groups.fresh[0] ?? groups.earlier[0] ?? groups.done[0];
