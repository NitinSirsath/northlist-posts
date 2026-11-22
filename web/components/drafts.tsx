/** The pieces of a post draft: your take, the draft box, the counter, and the Post / Undo / Posted state. */
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { CircleCheck } from 'lucide-react';
import { useId, type ComponentProps } from 'react';
import {
  LINKEDIN_MAX,
  TAKE_MAX,
  X_MAX,
  finalText,
  xLength,
  type Channel,
  type IdeaView,
  type PostView,
} from '../../shared/contracts';
import { isApiError } from '../api';
import { useNow } from '../lib/hooks';
import { channelName, clock } from '../lib/format';
import { latestPost, usePostIdea, useSpaces, useUndoPost } from '../queries';
import { ChannelLogo } from './brand';
import { AutoTextarea, ErrorText } from './ui';

type Bound = Pick<ComponentProps<'input'>, 'value' | 'onChange' | 'onFocus' | 'onBlur'>;

export function TakeField({ bound, note = 'goes first in both posts' }: { bound: Bound; note?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-1 text-[13px] font-medium text-text-secondary md:px-0 md:text-xs">
        Your take <span className="font-normal text-text-tertiary">· {note}</span>
      </label>
      <input
        id={id}
        className="field"
        maxLength={TAKE_MAX}
        placeholder="Optional. One line of what you think."
        autoComplete="off"
        {...bound}
      />
    </div>
  );
}

/** How long the final text is, as each site counts it. */
export function measure(channel: Channel, text: string) {
  const length = channel === 'X' ? xLength(text) : [...text].length;
  const max = channel === 'X' ? X_MAX : LINKEDIN_MAX;
  return { length, max, over: length > max };
}

export function Counter({ channel, text }: { channel: Channel; text: string }) {
  const { length, max, over } = measure(channel, text);
  return (
    <span className={clsx('tabular-nums', over && 'text-danger-text')} aria-live="polite">
      {channel === 'X' ? `${length} / ${max}` : `${length.toLocaleString('en-US')} characters`}
    </span>
  );
}

/** The draft as it will be posted: your take (highlighted) on top, then the editable draft. */
export function DraftBox({
  channel,
  take,
  bound,
  readOnly,
  label,
}: {
  channel: Channel;
  take: string;
  bound: Pick<ComponentProps<'textarea'>, 'value' | 'onChange' | 'onFocus' | 'onBlur'>;
  readOnly?: boolean;
  label?: string;
}) {
  return (
    <div className="dbox">
      {take.trim() && <span className="take-mark">{take.trim()}</span>}
      <AutoTextarea aria-label={label ?? `${channelName(channel)} draft`} readOnly={readOnly} {...bound} />
    </div>
  );
}

/** Why Post is turned off, or null when it can be posted. */
export function blockReason(channel: Channel, take: string, draft: string) {
  if (!draft.trim()) return `Write the ${channelName(channel)} text first.`;
  const { length, max, over } = measure(channel, finalText(take, draft));
  if (over) return `Too long for ${channelName(channel)}: ${length} / ${max}. Shorten it to post.`;
  return null;
}

/** Seconds left before a waiting post is sent. */
export function secondsLeft(post: PostView, now: number) {
  return Math.max(0, Math.ceil((new Date(post.sendAt).getTime() - now) / 1000));
}

export function UndoBar({ post, toast }: { post: PostView; toast?: boolean }) {
  const now = useNow(true);
  const undo = useUndoPost();
  const left = secondsLeft(post, now);
  const name = channelName(post.channel);
  const tooLate = isApiError(undo.error) && undo.error.code === 'TOO_LATE';
  return (
    <div className="flex w-full flex-col gap-1">
      <div className={clsx('undo', toast && 'toast')} role="status">
        <span>{left > 0 ? `Posting to ${name} in ${left} s` : `Posting to ${name}…`}</span>
        <button type="button" onClick={() => undo.mutate(post.id)} disabled={undo.isPending || left === 0}>
          Undo
        </button>
      </div>
      {undo.error && (
        <p role="alert" className={clsx('text-[13px] text-danger-text', toast && 'rounded-full bg-canvas px-4 py-1')}>
          {tooLate ? 'Too late: it was already sent.' : undo.error.message}
        </p>
      )}
    </div>
  );
}

export function PostedLine({ post }: { post: PostView }) {
  return (
    <div className="flex min-h-9 items-center gap-2 text-[13px] md:text-[13px]">
      <CircleCheck size={16} className="shrink-0 text-ok" aria-hidden />
      <span>
        Posted to {channelName(post.channel)} at {clock(post.postedAt ?? post.sendAt)}
        {post.url && (
          <>
            {' · '}
            <a className="text-link hover:underline" href={post.url} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * What sits under a draft: the Post button, the Undo countdown, "Posting…", "Posted", or the error with Try again.
 * `beforePost` saves unsaved edits first; it returns false when that failed.
 */
export function ChannelAction({
  idea,
  channel,
  take,
  draft,
  beforePost,
  big,
}: {
  idea: IdeaView;
  channel: Channel;
  take: string;
  draft: string;
  beforePost: () => Promise<boolean>;
  big?: boolean;
}) {
  const post = latestPost(idea, channel);
  const send = usePostIdea(idea.id);
  const name = channelName(channel);
  // The account of this draft's own space, so you see where it goes before you tap.
  const account = useSpaces()
    .data?.find((s) => s.id === idea.spaceId)
    ?.connections.find((c) => c.channel === channel);
  const reason = blockReason(channel, take, draft);

  async function onPost() {
    if (await beforePost()) send.mutate(channel);
  }

  if (post?.status === 'WAITING') return <UndoBar post={post} toast={big} />;
  if (post?.status === 'SENDING')
    return (
      <p role="status" className="flex min-h-9 items-center text-[13px] text-text-secondary">
        Posting…
      </p>
    );
  if (post?.status === 'POSTED') return <PostedLine post={post} />;

  const failed = post?.status === 'FAILED';
  const notConnected = isApiError(send.error) && send.error.code === 'NOT_CONNECTED';
  const disabled = Boolean(reason) || send.isPending;
  return (
    <div className="flex w-full flex-col gap-2">
      {failed && (
        <p role="alert" className="text-[13px] text-danger-text">
          {post.error || `Could not post to ${name}.`}
        </p>
      )}
      <div className={clsx('flex flex-wrap items-center gap-2', big && 'flex-col items-stretch')}>
        <button
          type="button"
          className={big ? 'bigbtn' : 'btn btn-primary btn-sm'}
          disabled={disabled}
          onClick={() => void onPost()}
          aria-describedby={reason ? `${idea.id}-${channel}-reason` : undefined}
        >
          {!failed && <ChannelLogo channel={channel} size={big ? 16 : 13} />}
          {failed ? 'Try again' : account ? `Post to ${name} as ${account.accountName}` : `Post to ${name}`}
        </button>
        {reason && (
          <span id={`${idea.id}-${channel}-reason`} className="text-xs text-text-secondary md:text-xs">
            {reason}
          </span>
        )}
      </div>
      {notConnected ? (
        <p role="alert" className="text-[13px] text-danger-text">
          Connect {name} to this space first.{' '}
          <Link to="/space" className="font-semibold underline underline-offset-2">
            Go to Space
          </Link>
        </p>
      ) : (
        <ErrorText error={send.error} />
      )}
    </div>
  );
}
