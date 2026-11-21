/** The X and LinkedIn logos (Simple Icons, CC0), in the text colour, and a channel's logo with its post state. */
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { Channel, PostStatus } from '../../shared/contracts';
import { channelName } from '../lib/format';

const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const LINKEDIN_PATH =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

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
