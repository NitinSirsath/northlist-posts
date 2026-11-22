/**
 * Today: the drafts your AI sent. Laptop: the list on the left and the open draft on the right (like an inbox).
 * Phone: the same rows; a row opens the draft on its own page. Rows are grouped: new from the latest run,
 * still open from earlier runs, and posted everywhere.
 */
import { Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { IdeaView } from '../../shared/contracts';
import { ChannelMark } from '../components/brand';
import { DraftEditor, KIND_ICON } from '../components/DraftEditor';
import { TitleSwitcher } from '../components/SpaceSwitcher';
import { Avatar, LoadError, Loading, Page } from '../components/ui';
import { kindShort, timeAgo, when } from '../lib/format';
import { useIsPhone } from '../lib/hooks';
import { channelsOf, firstOf, groupToday, latestPost, type TodayGroups } from '../lib/today';
import { useMe, useToday } from '../queries';

const GROUP_TITLES: { key: keyof TodayGroups; title: string }[] = [
  { key: 'fresh', title: 'New' },
  { key: 'earlier', title: 'Earlier' },
  { key: 'done', title: 'Posted' },
];

/** "From Claude Code at 8:12 AM", from the newest idea (the list is newest first). */
function fromLine(ideas: IdeaView[]) {
  const newest = ideas[0];
  if (!newest) return null;
  const time = when(newest.createdAt);
  return `From ${newest.fromAi} ${/^\d/.test(time) ? 'at ' : ''}${time}`;
}

export function TodayPage({ draft }: { draft?: string }) {
  const today = useToday();
  const phone = useIsPhone();
  const ideas = (today.data ?? []).filter((idea) => idea.kind !== 'REPLY');

  if (today.isPending || (today.isError && !today.data) || !ideas.length || phone)
    return (
      <Page
        title={phone ? <TitleSwitcher /> : 'Today'}
        subtitle={fromLine(ideas) ?? 'Drafts from your AI. Nothing is posted until you tap Post.'}
        phoneBar={phone && <PhoneAvatarButton />}
      >
        {today.isPending ? (
          <Loading label="Loading your drafts…" />
        ) : today.isError && !today.data ? (
          <LoadError error={today.error} onRetry={() => void today.refetch()} />
        ) : !ideas.length ? (
          <EmptyToday />
        ) : (
          <PhoneToday groups={groupToday(ideas)} />
        )}
      </Page>
    );
  return <LaptopToday ideas={ideas} draft={draft} />;
}

/* ── Laptop ──────────────────────────────────────────── */

function LaptopToday({ ideas, draft }: { ideas: IdeaView[]; draft?: string }) {
  const navigate = useNavigate();
  const groups = groupToday(ideas);
  const open = ideas.find((idea) => idea.id === draft) ?? firstOf(groups);
  const pick = (id?: string) => void navigate({ to: '/', search: id ? { draft: id } : {}, replace: true });

  // After Skip, open the next draft in the list (or the one before, at the end).
  function afterSkip(id: string) {
    const order = [...groups.fresh, ...groups.earlier, ...groups.done];
    const at = order.findIndex((idea) => idea.id === id);
    pick((order[at + 1] ?? order[at - 1])?.id);
  }

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Drafts" className="flex w-[360px] shrink-0 flex-col border-r border-border-subtle">
        <header className="flex items-baseline justify-between px-5 pt-6 pb-3">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">Today</h1>
          <span className="text-xs text-text-tertiary">{fromLine(ideas)}</span>
        </header>
        <div className="flex-1 overflow-y-auto pb-6">
          {GROUP_TITLES.map(({ key, title }) =>
            groups[key].length ? (
              <div key={key} role="group" aria-label={title}>
                <h2 className="flex items-baseline gap-2 px-5 pt-4 pb-1.5 text-xs font-medium text-text-secondary">
                  {title}
                  <span className="font-normal text-text-tertiary">{groups[key].length}</span>
                </h2>
                <ul>
                  {groups[key].map((idea) => (
                    <li key={idea.id}>
                      <DraftRow idea={idea} selected={idea.id === open?.id} onSelect={() => pick(idea.id)} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <AskHint />
        </div>
      </section>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-10 pt-7 pb-16">
          {open && <DraftEditor key={open.id} idea={open} onSkipped={() => afterSkip(open.id)} />}
        </div>
      </div>
    </div>
  );
}

function ChannelMarks({ idea }: { idea: IdeaView }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {channelsOf(idea).map((channel) => (
        <ChannelMark key={channel} channel={channel} status={latestPost(idea, channel)?.status} />
      ))}
    </span>
  );
}

function DraftRow({ idea, selected, onSelect }: { idea: IdeaView; selected: boolean; onSelect: () => void }) {
  const Icon = KIND_ICON[idea.kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={clsx(
        'mx-2 flex w-[calc(100%-16px)] items-start gap-3 rounded-lg px-3 py-2.5 text-left',
        selected ? 'bg-nav-active' : 'hover:bg-canvas-hover',
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0 text-text-tertiary" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{idea.title}</span>
        <span className="truncate text-xs text-text-secondary">
          {[kindShort[idea.kind], idea.sourceName, timeAgo(idea.createdAt)].filter(Boolean).join(' · ')}
        </span>
      </span>
      <ChannelMarks idea={idea} />
    </button>
  );
}

function AskHint() {
  return (
    <p className="mx-5 mt-6 flex gap-2 text-xs leading-[18px] text-text-tertiary">
      <Sparkles size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        Want something else? Ask your AI, for example <code>write about …</code>. It shows up here.
      </span>
    </p>
  );
}

function EmptyToday() {
  return (
    <div className="panel flex flex-col items-center gap-2.5 px-6 py-12 text-center text-text-secondary">
      <b className="text-base text-text-primary">No drafts yet today</b>
      <span>
        Open your AI in the NorthList Posts folder and type <code>daily</code>. Drafts for this space show up here in a
        few minutes, with an alert.
      </span>
    </div>
  );
}

/* ── Phone ───────────────────────────────────────────── */

function PhoneAvatarButton() {
  const me = useMe();
  return (
    <Link
      to="/space"
      aria-label="Space settings"
      className="glass ml-auto inline-flex size-10 items-center justify-center rounded-full"
    >
      <Avatar name={me.data?.name || me.data?.email || '?'} size={32} />
    </Link>
  );
}

function PhoneToday({ groups }: { groups: TodayGroups }) {
  return (
    <>
      {GROUP_TITLES.map(({ key, title }) =>
        groups[key].length ? (
          <section key={key} aria-label={title}>
            <h2 className="mx-1 mt-3 flex items-baseline gap-2 text-[17px] leading-[22px] font-semibold">
              {title}
              <span className="text-[15px] font-normal text-text-tertiary">{groups[key].length}</span>
            </h2>
            <div className="panel rows mt-2 overflow-hidden">
              {groups[key].map((idea) => {
                const Icon = KIND_ICON[idea.kind];
                return (
                  <Link
                    key={idea.id}
                    to="/post/$id"
                    params={{ id: idea.id }}
                    className="flex items-center gap-3 px-4 py-3 active:bg-surface-selected"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="text-[17px] leading-[22px]">{idea.title}</span>
                      <span className="flex items-center gap-1.5 text-[15px] leading-5 text-text-secondary">
                        <Icon size={14} className="shrink-0 text-text-tertiary" aria-hidden />
                        {kindShort[idea.kind]} · {timeAgo(idea.createdAt)}
                      </span>
                    </span>
                    <ChannelMarks idea={idea} />
                    <ChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null,
      )}
    </>
  );
}
