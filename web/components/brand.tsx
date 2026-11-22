/** The X and LinkedIn logos (Simple Icons, CC0), in the text colour, and a channel's logo with its post state. */
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { Channel, PostStatus } from '../../shared/contracts';
import { channelName } from '../lib/format';

const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const LINKEDIN_PATH =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

const GITHUB_PATH =
  'M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z';

/** Logos that are not a posting channel: GitHub, for links to repos (Simple Icons, CC0). */
export function BrandLogo({ name, size = 16 }: { name: 'github'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0 fill-current">
      <path d={name === 'github' ? GITHUB_PATH : ''} />
    </svg>
  );
}

export function ChannelLogo({
  channel,
  size = 16,
  className,
}: {
  channel: Channel;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={clsx('shrink-0 fill-current', className)}
    >
      <path d={channel === 'X' ? X_PATH : LINKEDIN_PATH} />
    </svg>
  );
}

/** A channel's logo for a list row: grey while it waits for you, with a green tick once posted. */
export function ChannelMark({ channel, status }: { channel: Channel; status?: PostStatus }) {
  const posted = status === 'POSTED';
  const moving = status === 'WAITING' || status === 'SENDING';
  const failed = status === 'FAILED';
  const state = posted ? 'posted' : moving ? 'posting' : failed ? 'failed' : 'not posted yet';
  return (
    <span
      className="relative inline-flex size-6 items-center justify-center rounded-md bg-[rgb(127_127_127/0.12)]"
      title={`${channelName(channel)}: ${state}`}
      aria-label={`${channelName(channel)}: ${state}`}
      role="img"
    >
      <ChannelLogo
        channel={channel}
        size={12}
        className={clsx(posted ? 'text-text-tertiary' : 'text-text-primary', moving && 'animate-pulse')}
      />
      {posted && (
        <span className="absolute -right-1 -bottom-1 inline-flex size-3.5 items-center justify-center rounded-full bg-ok text-canvas ring-2 ring-[var(--page)]">
          <Check size={9} strokeWidth={3.5} aria-hidden />
        </span>
      )}
      {failed && (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-danger-text ring-2 ring-[var(--page)]" />
      )}
    </span>
  );
}
