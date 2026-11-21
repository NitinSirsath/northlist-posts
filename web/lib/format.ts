import type { Channel, IdeaKind } from '../../shared/contracts';

export const channelName = (channel: Channel) => (channel === 'X' ? 'X' : 'LinkedIn');

export const kindLabel: Record<IdeaKind, string> = {
  SHIPPED: 'What you shipped',
  OWN: 'Your own',
  NEWS: 'News',
  REPLY: 'Reply draft',
};

/** The kind in a list row, where space is short. */
export const kindShort: Record<IdeaKind, string> = {
  SHIPPED: 'Shipped',
  OWN: 'Your own',
  NEWS: 'News',
  REPLY: 'Reply',
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "9:12 AM" */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Nov 19" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "9:12 AM" today, "yesterday, 9:12 AM", or "Nov 17, 9:12 AM". */
export function when(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (sameDay(date, now)) return clock(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `yesterday, ${clock(iso)}`;
  return `${shortDate(iso)}, ${clock(iso)}`;
}

/** For the Posted list: "Today 9:12 AM", "Yesterday", or "Mon". */
export function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (sameDay(date, now)) return `Today ${clock(iso)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
