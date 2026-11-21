/**
 * One draft, open: where it came from, the X | LinkedIn switch with each logo and its state, your take, the
 * draft, Post (with Undo), Copy and Skip. The laptop shows it beside the list; the phone on its own page.
 */
import clsx from 'clsx';
import { Copy, ExternalLink, GitCommitHorizontal, Newspaper, PenLine, X as XIcon, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { finalText, type Channel, type IdeaKind, type IdeaView, type PostStatus } from '../../shared/contracts';
import { useCopy } from '../lib/clipboard';
import { channelName, hostOf, kindLabel, timeAgo } from '../lib/format';
import { useFlash } from '../lib/hooks';
import { channelsOf, latestPost } from '../lib/today';
import { useIdeaEdits } from '../lib/useIdeaEdits';
import { useProfile, useSkipIdea } from '../queries';
import { ChannelLogo } from './brand';
import { ChannelAction, Counter, DraftBox, TakeField, UndoBar } from './drafts';
import { ErrorText } from './ui';

export const KIND_ICON: Record<IdeaKind, LucideIcon> = {
  SHIPPED: GitCommitHorizontal,
  NEWS: Newspaper,
  OWN: PenLine,
  REPLY: PenLine,
};

/** "News · IEEE Spectrum · 2 hours ago", or "What you shipped · NorthList app · 1 hour ago". */
export function sourceLine(idea: IdeaView) {
  const source = idea.sourceName ?? (idea.sourceUrl ? hostOf(idea.sourceUrl) : null);
  return [kindLabel[idea.kind], source, timeAgo(idea.createdAt)].filter(Boolean).join(' · ');
}

/** What Copy puts on the clipboard: the open channel's text, with your take on top. */
const copyText = (take: string, draft: string) => finalText(take, draft);

const STATE_WORD: Partial<Record<PostStatus, string>> = {
  POSTED: 'Posted',
  WAITING: 'Posting',
  SENDING: 'Posting',
  FAILED: 'Failed',
};

function ChannelSwitch({
  idea,
  channels,
  channel,
  onPick,
  phone,
}: {
  idea: IdeaView;
  channels: Channel[];
  channel: Channel;
  onPick: (channel: Channel) => void;
  phone?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Channel"
      className={clsx(
        'grid rounded-[10px] bg-[rgb(127_127_127/0.14)] p-0.5',
        channels.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
      )}
    >
      {channels.map((c) => {
        const word = STATE_WORD[latestPost(idea, c)?.status ?? 'CANCELLED'];
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === channel}
            aria-label={channelName(c)}
            onClick={() => onPick(c)}
            className={clsx(
              'flex items-center justify-center gap-2 rounded-lg aria-checked:bg-[var(--seg-on)] aria-checked:font-semibold aria-checked:shadow-[0_1px_4px_rgb(0_0_0/0.12)]',
              phone ? 'h-9 text-[15px]' : 'h-8 text-[13px]',
            )}
          >
            <ChannelLogo channel={c} size={phone ? 15 : 13} />
            {/* X's logo is its name; LinkedIn gets both. */}
            {c !== 'X' && channelName(c)}
            {word && (
              <span
                className={clsx(
                  'text-xs font-normal',
                  word === 'Posted' && 'text-ok',
                  word === 'Failed' && 'text-danger-text',
                  word === 'Posting' && 'text-text-secondary',
                )}
              >
                · {word}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DraftEditor({ idea, phone, onSkipped }: { idea: IdeaView; phone?: boolean; onSkipped?: () => void }) {
  const edits = useIdeaEdits(idea);
  const skip = useSkipIdea(idea.id);
  const copy = useCopy();
  const [copied, flashCopied] = useFlash();
  const channels = channelsOf(idea);
  // Open on the first channel still to post.
  const [picked, setPicked] = useState<Channel>(
    () => channels.find((c) => latestPost(idea, c)?.status !== 'POSTED') ?? channels[0] ?? 'X',
  );
  const channel = channels.includes(picked) ? picked : (channels[0] ?? 'X');
  const field = channel === 'X' ? 'xText' : 'linkedinText';
  const draft = edits[field];
  const post = latestPost(idea, channel);
  const locked = post?.status === 'WAITING' || post?.status === 'SENDING';
  const anyLocked = channels.some((c) => ['WAITING', 'SENDING'].includes(latestPost(idea, c)?.status ?? ''));
  // Every channel's Undo shows, so switching never hides a countdown.
  const waiting = channels.map((c) => latestPost(idea, c)).filter((p) => p?.status === 'WAITING');
  const Icon = KIND_ICON[idea.kind];
  const productName = useProfile().data?.productName.trim();

  const actions = (
    <>
      <button
        type="button"
        className={phone ? 'pill' : 'btn btn-plain btn-sm'}
        onClick={() => void copy.run(copyText(edits.take, draft), flashCopied)}
      >
        {!phone && <Copy size={14} aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        className={phone ? 'pill pill-muted' : 'btn btn-plain btn-sm'}
        disabled={skip.isPending || anyLocked}
        onClick={() => skip.mutate(undefined, { onSuccess: onSkipped })}
      >
        {!phone && <XIcon size={14} aria-hidden />}
        Skip
      </button>
    </>
  );

  return (
    <article aria-label={idea.title} className="flex flex-col">
      <div className="flex items-center gap-2 text-text-secondary">
        <Icon size={phone ? 15 : 14} className="shrink-0 text-text-tertiary" aria-hidden />
        <span className={phone ? 'text-[15px]' : 'text-[13px]'}>{sourceLine(idea)}</span>
        {idea.mentionsProduct && productName && !phone && <span className="tag tag-gray">Mentions {productName}</span>}
        {!phone && <span className="ml-auto flex items-center gap-1">{actions}</span>}
      </div>
      <h1
        className={clsx(
          'flex items-start gap-2 font-semibold',
          phone ? 'mt-2 text-2xl leading-[30px] font-bold' : 'mt-3 text-[22px] leading-[28px] tracking-[-0.01em]',
        )}
      >
        <span>{idea.title}</span>
        {idea.sourceUrl && !phone && (
          <a
            href={idea.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the source"
            className="mt-1.5 shrink-0 rounded text-text-tertiary hover:text-text-primary"
          >
            <ExternalLink size={15} aria-hidden />
          </a>
        )}
      </h1>
      {idea.why && (
        <p className={clsx('mt-2 text-text-secondary', phone ? 'text-[15px]' : 'text-sm')}>Why: {idea.why}</p>
      )}

      <div className={phone ? 'mt-[18px]' : 'mt-6'}>
        <ChannelSwitch idea={idea} channels={channels} channel={channel} onPick={setPicked} phone={phone} />
      </div>

      <div className="mt-4">
        {locked ? (
          <p className="px-1 text-[13px] text-text-secondary">Your take: {edits.take.trim() || 'none'}</p>
        ) : (
          <TakeField
            bound={edits.bind('take')}
            note={channels.length > 1 ? 'goes first in both posts' : 'goes first'}
          />
        )}
      </div>

      {post?.status !== 'POSTED' && (
        <>
          <div className="mt-3 flex items-center justify-between px-1 text-[13px] text-text-secondary md:px-0 md:text-xs">
            <span className="flex items-center gap-1.5">
              <ChannelLogo channel={channel} size={11} />
              {channelName(channel)} post
            </span>
            <Counter channel={channel} text={finalText(edits.take, draft)} />
          </div>
          <div className="mt-1.5">
            <DraftBox key={channel} channel={channel} take={edits.take} bound={edits.bind(field)} readOnly={locked} />
          </div>
        </>
      )}

      <div className="mt-4">
        {post?.status === 'WAITING' && phone ? null : (
          <ChannelAction
            idea={idea}
            channel={channel}
            take={edits.take}
            draft={draft}
            beforePost={() => edits.flush()}
            big={phone}
          />
        )}
      </div>

      {!phone &&
        waiting
          .filter((p) => p && p.channel !== channel)
          .map(
            (p) =>
              p && (
                <div key={p.id} className="mt-2">
                  {<UndoBar post={p} />}
                </div>
              ),
          )}
      {phone && <div className="mt-2.5 flex justify-center gap-2">{actions}</div>}
      <ErrorText error={edits.saveError ?? copy.error ?? skip.error} className="mt-2" />

      {phone && waiting.length > 0 && (
        <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+20px)] z-20 mx-auto flex max-w-[608px] flex-col gap-2">
          {waiting.map((p) => p && <UndoBar key={p.id} post={p} toast />)}
        </div>
      )}
    </article>
  );
}
