/**
 * The Space page (owner, 22 Nov 2026; replaces Profile): everything one space is made of — links the AI
 * reads, its own X and LinkedIn accounts, goal, interests, voice and rhythm. Changes save at once.
 */
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Check, Link2, Trash2, X as XIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { RECONNECT_WARNING_DAYS, type Channel, type SpaceView } from '../../shared/contracts';
import { ChannelLogo } from '../components/brand';
import {
  GOALS,
  GoalCards,
  Rhythm,
  SpaceAvatar,
  TopicTiles,
  ToneCards,
  connectUrl,
  timeLabel,
} from '../components/spaceParts';
import { ErrorText, LoadError, Loading, Page, SectionHeading } from '../components/ui';
import { channelName, when } from '../lib/format';
import { useIsPhone } from '../lib/hooks';
import { setCurrentSpace } from '../lib/space';
import {
  useAddLink,
  useCurrentSpace,
  useDeleteSpace,
  useDisconnect,
  useMe,
  useRemoveLink,
  useUpdateSpace,
} from '../queries';
import { LinkCard } from './Welcome';

export interface SpaceSearch {
  channel?: string;
  connected?: number;
  error?: string;
}

export function SpacePage({ search }: { search: SpaceSearch }) {
  const { space, spaces } = useCurrentSpace();
  const phone = useIsPhone();
  if (spaces.isPending)
    return (
      <Page title="Space">
        <Loading />
      </Page>
    );
  if (!space)
    return (
      <Page title="Space">
        <LoadError error={spaces.error} onRetry={() => void spaces.refetch()} />
      </Page>
    );
  const summary = `${GOALS[space.goal].title} · ${space.postsPerDay} a day at ${timeLabel(space.readyAt)}${space.weekends ? '' : ' · weekdays'}`;
  return (
    <Page title={space.name} subtitle={summary}>
      <Banner search={search} />
      <div key={space.id} className="flex max-w-[760px] flex-col gap-2">
        <NameRow space={space} />
        <Links space={space} />
        <Accounts space={space} />
        <Section title="Goal">
          <GoalField space={space} compact={phone} />
        </Section>
        <Section title="Interests" note={`${space.interests.length} of 8`}>
          <InterestsField space={space} columns={phone ? 2 : 4} />
        </Section>
        <Section title="Voice">
          <VoiceField space={space} />
        </Section>
        <Section title="Rhythm">
          <RhythmField space={space} />
        </Section>
        <DeleteSpace space={space} count={spaces.data?.length ?? 1} />
        {space.updatedBy !== 'you' && (
          <p className="px-1 pt-2 text-xs text-text-tertiary">
            Last changed by {space.updatedBy} {when(space.updatedAt)}.
          </p>
        )}
      </div>
    </Page>
  );
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <SectionHeading title={title} note={note} />
      {children}
    </section>
  );
}

function Banner({ search }: { search: SpaceSearch }) {
  const navigate = useNavigate();
  const name = search.channel === 'linkedin' ? 'LinkedIn' : search.channel === 'x' ? 'X' : 'The account';
  const text =
    search.connected === 1
      ? `${name} is connected to this space.`
      : search.error === 'other_space'
        ? `That ${name} account is already in another space. Each account is in one space only.`
        : search.error === 'expired'
          ? 'That took too long. Try again.'
          : search.error === 'denied'
            ? `${name} was not allowed. Try again if you meant to connect.`
            : search.error
              ? `Could not connect ${name}. Try again.`
              : null;
  if (!text) return null;
  return (
    <div
      role="status"
      className={clsx(
        'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px]',
        search.connected ? 'tag-green' : 'tag-yellow',
      )}
    >
      {search.connected === 1 && <Check size={16} aria-hidden />}
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label="Close"
        className="inline-flex size-6 items-center justify-center rounded-full"
        onClick={() => void navigate({ to: '/space', search: {}, replace: true })}
      >
        <XIcon size={14} aria-hidden />
      </button>
    </div>
  );
}

function NameRow({ space }: { space: SpaceView }) {
  const update = useUpdateSpace();
  const [name, setName] = useState(space.name);
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-group px-4 py-3">
      <SpaceAvatar name={name || space.name} size={36} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-text-tertiary">Space name</span>
        <input
          className="min-w-0 bg-transparent text-[15px] font-semibold outline-none"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== space.name && update.mutate({ id: space.id, name: name.trim() })}
        />
      </span>
      <ErrorText error={update.error} />
    </label>
  );
}

function Links({ space }: { space: SpaceView }) {
  const add = useAddLink(space.id);
  const remove = useRemoveLink(space.id);
  const [value, setValue] = useState('');
  return (
    <Section title="Links the AI reads" note={`${space.links.length} of 12`}>
      <div>
        {space.links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            right={
              <button
                type="button"
                className="btn btn-plain btn-sm"
                aria-label={`Remove ${link.title || link.url}`}
                onClick={() => remove.mutate(link.id)}
                disabled={remove.isPending}
              >
                Remove
              </button>
            }
          />
        ))}
        {add.isPending && (
          <div className="pop-in mb-2 flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            <span className="skel size-[38px] shrink-0 rounded-[10px]" />
            <span className="shimmer text-[13px] font-semibold">Reading {add.variables}…</span>
          </div>
        )}
        <form
          className="flex items-center gap-2 rounded-2xl bg-surface py-1.5 pr-1.5 pl-3.5 shadow-[inset_0_0_0_1px_var(--border-default)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) add.mutate(value.trim(), { onSuccess: () => setValue('') });
          }}
        >
          <Link2 size={16} className="shrink-0 text-text-tertiary" aria-hidden />
          <input
            aria-label="Paste a link"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary"
            placeholder="Paste a link: a site, a GitHub repo, any page"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="url"
            autoCapitalize="off"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!value.trim() || add.isPending}>
            Add
          </button>
        </form>
        <ErrorText error={add.error ?? remove.error} className="mt-2" />
      </div>
    </Section>
  );
}

function Accounts({ space }: { space: SpaceView }) {
  const me = useMe();
  const disconnect = useDisconnect(space.id);
  return (
    <Section
      title="Accounts"
      note={me.data?.fakeSocial ? 'Test mode: X and LinkedIn are fake' : 'Posts from this space go here only'}
    >
      <div className="panel rows">
        {(['X', 'LINKEDIN'] as Channel[]).map((channel) => {
          const connection = space.connections.find((c) => c.channel === channel);
          const days = connection?.expiresInDays;
          const expiring =
            channel === 'LINKEDIN' && days !== null && days !== undefined && days <= RECONNECT_WARNING_DAYS;
          const name = channelName(channel);
          return (
            <div key={channel} className="flex min-h-[58px] items-center gap-3 px-4 py-3 text-sm md:px-5">
              <ChannelLogo channel={channel} size={18} />
              <span className="min-w-0 flex-1">
                <b className="block font-medium">{connection ? connection.accountName : name}</b>
                <span className="text-[13px] text-text-secondary">
                  {connection
                    ? expiring
                      ? days === 0
                        ? 'Reconnect today'
                        : `Reconnect in ${days} day${days === 1 ? '' : 's'}`
                      : `${name} · posts directly`
                    : 'Not connected'}
                </span>
              </span>
              {connection ? (
                <span className="flex items-center gap-1">
                  {expiring && (
                    <a href={connectUrl(channel, space.id, 'space')} className="btn btn-ghost btn-sm">
                      Reconnect
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-plain btn-sm"
                    onClick={() => disconnect.mutate(channel)}
                    disabled={disconnect.isPending}
                    aria-label={`Remove ${name} from this space`}
                  >
                    Remove
                  </button>
                </span>
              ) : (
                <a href={connectUrl(channel, space.id, 'space')} className="btn btn-secondary btn-sm">
                  Connect {name}
                </a>
              )}
            </div>
          );
        })}
      </div>
      <ErrorText error={disconnect.error} />
    </Section>
  );
}

function GoalField({ space, compact }: { space: SpaceView; compact: boolean }) {
  const update = useUpdateSpace();
  return (
    <>
      <GoalCards value={space.goal} onChange={(goal) => update.mutate({ id: space.id, goal })} compact={compact} />
      <ErrorText error={update.error} />
    </>
  );
}

function InterestsField({ space, columns }: { space: SpaceView; columns: number }) {
  const update = useUpdateSpace();
  return (
    <>
      <TopicTiles
        picked={space.interests}
        onChange={(interests) => update.mutate({ id: space.id, interests })}
        columns={columns}
      />
      <ErrorText error={update.error} />
    </>
  );
}

function VoiceField({ space }: { space: SpaceView }) {
  const update = useUpdateSpace();
  const [samples, setSamples] = useState(space.styleSamples.join('\n---\n'));
  function save() {
    const list = samples
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (list.join('\n') !== space.styleSamples.join('\n')) update.mutate({ id: space.id, styleSamples: list });
  }
  return (
    <div className="flex flex-col gap-3">
      <ToneCards value={space.tone} onChange={(tone) => update.mutate({ id: space.id, tone })} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] text-text-tertiary">Posts you wrote and liked (put --- between them)</span>
        <textarea
          className="field h-28 resize-y py-2.5"
          value={samples}
          onChange={(e) => setSamples(e.target.value)}
          onBlur={save}
          placeholder="Paste 2 or 3 posts. We copy the rhythm, not the words."
        />
      </label>
      <ErrorText error={update.error} />
    </div>
  );
}

function RhythmField({ space }: { space: SpaceView }) {
  const update = useUpdateSpace();
  return (
    <>
      <Rhythm
        postsPerDay={space.postsPerDay}
        readyAt={space.readyAt}
        weekends={space.weekends}
        onChange={(patch) => update.mutate({ id: space.id, ...patch })}
      />
      <ErrorText error={update.error} />
    </>
  );
}

function DeleteSpace({ space, count }: { space: SpaceView; count: number }) {
  const remove = useDeleteSpace();
  const { spaces } = useCurrentSpace();
  const [sure, setSure] = useState(false);
  if (count <= 1) return null;
  return (
    <Section title="Delete this space">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-group px-4 py-3 text-[13px] text-text-secondary">
        <span className="flex-1">Its drafts and stats go, and its accounts are disconnected. Other spaces stay.</span>
        {sure ? (
          <>
            <button type="button" className="btn btn-plain btn-sm" onClick={() => setSure(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-sm bg-danger-text text-white"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(space.id, {
                  onSuccess: () => {
                    const next = spaces.data?.find((s) => s.id !== space.id);
                    if (next) setCurrentSpace(next.id);
                  },
                })
              }
            >
              <Trash2 size={14} aria-hidden /> Delete {space.name}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-plain btn-sm text-danger-text" onClick={() => setSure(true)}>
            Delete space
          </button>
        )}
      </div>
      <ErrorText error={remove.error} />
    </Section>
  );
}
