/**
 * The first-run steps (owner, 22 Nov 2026), right after sign-up: welcome, goal, links, interests, voice,
 * accounts, rhythm, your AI, done. One question per screen; on the laptop a live picture of the space fills
 * in on the right as you answer. "New space" runs the goal-to-rhythm steps again for a second space.
 * Steps slide the way you move (view transitions where the browser has them); Reduce Motion = no movement.
 */
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Check, Copy, Download, Globe, Link2, Lock, Monitor, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Goal, MeView, SourceLinkView, SpaceView } from '../../shared/contracts';
import { BrandLogo, ChannelLogo } from '../components/brand';
import {
  CheckDot,
  GOALS,
  GoalCards,
  MiniTopic,
  Rhythm,
  SpaceAvatar,
  TopicTiles,
  ToneCards,
  connectUrl,
  samplePost,
  suggestTopics,
  timeLabel,
} from '../components/spaceParts';
import { ErrorText, Logo } from '../components/ui';
import { copyText } from '../lib/clipboard';
import { useIsPhone } from '../lib/hooks';
import { setCurrentSpace } from '../lib/space';
import {
  useAddLink,
  useCreateSpace,
  useCreateToken,
  useSaveOnboarding,
  useSpaces,
  useTokens,
  useUpdateSpace,
} from '../queries';
import { setupPrompt } from './Connect';

export interface WelcomeSearch {
  channel?: string;
  connected?: number;
  error?: string;
  /** 1: making another space (goal to rhythm only). */
  new?: number;
}

const STEP_NAMES = ['Welcome', 'Goal', 'Links', 'Interests', 'Voice', 'Accounts', 'Rhythm', 'Your AI', 'Done'];
const FIRST = 1;
const LAST = 9;
const NEW_SPACE_KEY = 'nlp.newSpace';

function moveTo(update: () => void, forward: boolean) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (arg: unknown) => { finished: Promise<void> } };
  if (!doc.startViewTransition || reduce) return update();
  const run = () => flushSync(update);
  try {
    doc.startViewTransition({ update: run, types: [forward ? 'forward' : 'backward'] }).finished.catch(() => {});
  } catch {
    doc.startViewTransition(run).finished.catch(() => {});
  }
}

export function WelcomePage({ me, search }: { me: MeView; search: WelcomeSearch }) {
  const navigate = useNavigate();
  const phone = useIsPhone();
  const spaces = useSpaces();
  const newMode = search.new === 1 || (me.onboarded && Boolean(sessionStorage.getItem(NEW_SPACE_KEY)));
  const [newId, setNewId] = useState<string | null>(() => sessionStorage.getItem(NEW_SPACE_KEY));
  const space: SpaceView | undefined = newMode ? spaces.data?.find((s) => s.id === newId) : spaces.data?.[0];
  const [step, setStep] = useState(() =>
    newMode ? (search.channel ? 6 : 2) : Math.min(LAST, Math.max(FIRST, me.onboardingStep || FIRST)),
  );
  const save = useSaveOnboarding();
  const lastStep = newMode ? 7 : LAST;
  // The goal tapped on step 2, shown on the live picture before Continue makes the space.
  const [previewGoal, setPreviewGoal] = useState<Goal | null>(null);

  function go(next: number) {
    const to = Math.min(lastStep, Math.max(newMode ? 2 : FIRST, next));
    if (to === step) return;
    moveTo(() => setStep(to), to > step);
    if (!newMode) save.mutate({ step: to });
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    if (newMode) {
      if (space) setCurrentSpace(space.id);
      sessionStorage.removeItem(NEW_SPACE_KEY);
    } else {
      await save.mutateAsync({ step: LAST, done: true });
      if (space) setCurrentSpace(space.id);
    }
    void navigate({ to: '/', search: {} });
  }

  if (spaces.isPending) return <div role="status" aria-label="Loading" className="min-h-dvh" />;

  const props: Omit<StepProps, 'render'> = {
    me,
    space,
    phone,
    search,
    newMode,
    go,
    step,
    onCreated: (created) => {
      if (newMode) {
        sessionStorage.setItem(NEW_SPACE_KEY, created.id);
        setNewId(created.id);
      }
    },
    beforeLeave: () => {
      if (!newMode) save.mutate({ step });
    },
    onGoal: setPreviewGoal,
  };
  const showProgress = step > 1 && step < LAST;
  const footer = (body: Body) => (
    <div
      className={clsx(
        'flex items-center gap-2 pt-4',
        phone ? 'pb-[calc(env(safe-area-inset-bottom)+12px)]' : 'justify-between',
      )}
    >
      {step > (newMode ? 2 : FIRST) || newMode ? (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => (step === 2 && newMode ? void navigate({ to: '/', search: {} }) : go(step - 1))}
        >
          {step === 2 && newMode ? 'Cancel' : 'Back'}
        </button>
      ) : (
        <span />
      )}
      <div className={clsx('flex items-center gap-3', phone && 'flex-1 justify-end')}>
        {body.status}
        {body.canSkip && (
          <button type="button" className="btn btn-ghost" onClick={() => go(step + 1)}>
            Skip
          </button>
        )}
        <button
          type="button"
          className={clsx('btn btn-primary', phone && 'h-12 flex-1')}
          disabled={body.busy || body.blocked}
          onClick={() => {
            if (body.onNext) return void body.onNext();
            if (step >= lastStep) return void finish();
            go(step + 1);
          }}
        >
          {body.cta ?? (step >= lastStep ? (newMode ? 'Open the new space' : 'Open Today') : 'Continue')}
        </button>
      </div>
    </div>
  );

  const layout = (body: Body) =>
    phone ? (
      <div className="flex min-h-dvh flex-col bg-canvas px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        {showProgress && <Progress step={step} newMode={newMode} />}
        {step === 1 || step === LAST ? (
          <div className="stage -mx-5 mt-2 h-[280px]">
            <div className="absolute top-[-10px] left-1/2 ml-[-210px] origin-top scale-[0.78]">
              <Flow done={step === LAST} />
            </div>
          </div>
        ) : (
          space && <Strip space={space} />
        )}
        <div className="welcome-step flex flex-1 flex-col">
          <StepText body={body} />
        </div>
        {footer(body)}
      </div>
    ) : (
      <div className="grid h-dvh grid-cols-[minmax(480px,560px)_1fr] bg-canvas">
        <div className="flex min-h-0 flex-col px-12 pt-6 pb-6">
          <div className="flex items-center justify-between">
            <Logo />
            {newMode && <span className="text-[13px] text-text-tertiary">New space</span>}
          </div>
          {showProgress ? <Progress step={step} newMode={newMode} /> : <div className="h-20" />}
          <div className="welcome-step flex min-h-0 flex-1 flex-col">
            {showProgress && (
              <p className="mb-2 text-[12.5px] text-text-tertiary">
                Step {newMode ? step - 1 : step - 1} of {newMode ? 6 : 7} · {STEP_NAMES[step - 1]}
              </p>
            )}
            <StepText body={body} />
          </div>
          {footer(body)}
        </div>
        <div className="stage flex items-center justify-center">
          <Rings />
          {step === 1 || step === LAST ? (
            <Flow done={step === LAST} />
          ) : (
            <LivePicture space={space} step={step} goal={step === 2 ? (previewGoal ?? undefined) : undefined} />
          )}
        </div>
      </div>
    );

  const Step = STEP_VIEWS[step] ?? DoneStep;
  return <Step key={step} {...props} render={layout} />;
}

/* ── Steps ──────────────────────────────────────────── */

interface StepProps {
  me: MeView;
  space?: SpaceView;
  phone: boolean;
  search: WelcomeSearch;
  newMode: boolean;
  step: number;
  go: (step: number) => void;
  onCreated: (space: SpaceView) => void;
  beforeLeave: () => void;
  onGoal: (goal: Goal) => void;
  /** Lays out the step's text, content and buttons on the page. */
  render: (body: Body) => ReactNode;
}

interface Body {
  title: string;
  sub: string;
  content: ReactNode;
  cta?: string;
  canSkip?: boolean;
  busy?: boolean;
  blocked?: boolean;
  status?: ReactNode;
  onNext?: () => void | Promise<void>;
}

function StepText({ body }: { body: Body }) {
  return (
    <>
      <h1 className="mt-2 mb-2.5 text-[26px] leading-[1.15] font-[650] tracking-[-0.02em] md:mt-0 md:text-[30px]">
        {body.title}
      </h1>
      <p className="mb-5 max-w-[440px] text-[14.5px] text-text-secondary md:mb-6 md:text-[15px]">{body.sub}</p>
      <div className="-mx-0.5 min-h-0 flex-1 overflow-y-auto p-0.5">{body.content}</div>
    </>
  );
}

function WelcomeStep(p: StepProps) {
  return p.render({
    title: 'Your posts, ready every morning.',
    sub: 'Tell us what you are building and who you want to reach. Your AI writes the drafts; you pick, edit and post.',
    cta: 'Get started',
    content: (
      <ul className="stagger mt-2 grid gap-3 text-[13.5px] text-text-secondary">
        <li className="flex items-center gap-2.5">
          <Link2 size={16} aria-hidden /> Paste a link, we read the rest
        </li>
        <li className="flex items-center gap-2.5">
          <SpaceIcon /> One space per goal, each with its own accounts
        </li>
        <li className="flex items-center gap-2.5">
          <Sparkles size={16} aria-hidden /> About 3 minutes
        </li>
      </ul>
    ),
  });
}

function DoneStep(p: StepProps) {
  return p.render({
    title: 'You are all set.',
    sub: 'Your AI writes the first drafts at the time you picked. They land on Today, and you get an alert when they are ready.',
    cta: 'Open Today',
    content: (
      <div className="stagger flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          <span className="pulse-ring inline-block size-2.5 rounded-full bg-text-tertiary" aria-hidden />
          <span className="shimmer text-sm">Waiting for your AI's first drafts…</span>
        </div>
        <p className="text-[13px] text-text-tertiary">
          Want a space for another account? Add one from the switcher at the top of the app.
        </p>
      </div>
    ),
  });
}

function GoalStep(p: StepProps) {
  const [goal, setGoal] = useState<Goal | undefined>(p.space?.goal);
  const create = useCreateSpace();
  const update = useUpdateSpace();
  return p.render({
    title: 'What do you want from posting?',
    sub: p.newMode
      ? 'A new space has its own goal, links and accounts.'
      : 'This is your first space. You can add more later, one per goal.',
    blocked: !goal,
    busy: create.isPending || update.isPending,
    content: (
      <div className="stagger">
        <GoalCards
          value={goal}
          onChange={(next) => {
            setGoal(next);
            p.onGoal(next);
          }}
          compact={p.phone}
        />
        <ErrorText error={create.error ?? update.error} className="mt-3" />
      </div>
    ),
    onNext: async () => {
      if (!goal) return;
      if (!p.space) p.onCreated(await create.mutateAsync({ goal }));
      else if (p.space.goal !== goal) await update.mutateAsync({ id: p.space.id, goal });
      p.go(3);
    },
  });
}

function LinksStep(p: StepProps) {
  const [value, setValue] = useState('');
  const add = useAddLink(p.space?.id ?? '');
  const links = p.space?.links ?? [];
  const pending = add.isPending ? add.variables : null;
  function submit() {
    const url = value.trim();
    if (!url || !p.space) return;
    add.mutate(url, { onSuccess: () => setValue('') });
  }
  return p.render({
    title: 'Where does your work live?',
    sub: "Paste your product site, GitHub repos or any page. We read them, so you don't have to type.",
    canSkip: true,
    content: (
      <div className="stagger flex flex-col">
        <form
          className="mb-3.5 flex items-center gap-2 rounded-2xl bg-surface py-1.5 pr-1.5 pl-3.5 shadow-[inset_0_0_0_1px_var(--border-default)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Link2 size={16} className="shrink-0 text-text-tertiary" aria-hidden />
          <input
            aria-label="Paste a link"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-text-tertiary"
            placeholder="northlist.site, github.com/you/repo…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!value.trim() || add.isPending}>
            Add
          </button>
        </form>
        <ErrorText error={add.error} className="mb-2" />
        {pending && (
          <div className="pop-in mb-2 flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            <span className="skel size-[38px] shrink-0 rounded-[10px]" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="shimmer text-[13px] font-semibold">Reading {pending}…</span>
              <span className="skel h-2 w-2/3" />
            </span>
          </div>
        )}
        {[...links].reverse().map((link) => (
          <LinkCard key={link.id} link={link} />
        ))}
        <p className="mt-2.5 flex flex-wrap gap-4 text-[12.5px] text-text-tertiary">
          <span>Websites</span>
          <span>GitHub repos and profiles</span>
          <span>Changelogs</span>
          <span>Any page</span>
        </p>
      </div>
    ),
  });
}

export function LinkCard({ link, right }: { link: SourceLinkView; right?: ReactNode }) {
  const isGitHub = link.kind === 'GITHUB_REPO' || link.kind === 'GITHUB_PROFILE';
  const host = link.url.replace(/^https?:\/\//, '').split('/')[0];
  const kind = {
    WEBSITE: 'Website',
    PAGE: 'Page',
    GITHUB_REPO: link.isPrivate ? 'Private repo' : 'Public repo',
    GITHUB_PROFILE: 'GitHub profile',
  }[link.kind];
  return (
    <div
      className={clsx(
        'mb-2 flex items-center gap-3 rounded-2xl px-3.5 py-3',
        link.isPrivate
          ? 'bg-surface-subtle shadow-[inset_0_0_0_1px_var(--border-default)]'
          : 'bg-surface shadow-[inset_0_0_0_1px_var(--border-subtle)]',
      )}
    >
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-surface-subtle text-text-secondary">
        {link.isPrivate ? (
          <Lock size={16} aria-hidden />
        ) : isGitHub ? (
          <BrandLogo name="github" size={18} />
        ) : (
          <Globe size={16} aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm font-semibold">{link.title || host}</b>
        {link.isPrivate ? (
          <span className="block text-[13px] text-text-secondary">
            Private repo. Your AI reads it with its own GitHub access, the same way it reads your code today.
          </span>
        ) : (
          link.description && (
            <span className="line-clamp-2 block text-[13px] text-text-secondary">{link.description}</span>
          )
        )}
        <span className="block truncate text-[12.5px] text-text-tertiary">
          {host} · {kind}
        </span>
      </span>
      <span className="shrink-0 text-[12.5px] whitespace-nowrap">
        {right ??
          (link.isPrivate ? (
            <span className="text-text-tertiary">Read by your AI</span>
          ) : link.readOk ? (
            <span className="text-ok">Read</span>
          ) : (
            <span className="text-text-tertiary">Your AI will read it</span>
          ))}
      </span>
    </div>
  );
}

function InterestsStep(p: StepProps) {
  const update = useUpdateSpace();
  const [own, setOwn] = useState('');
  const space = p.space;
  const suggested = useMemo(() => (space ? suggestTopics(space.links, space.goal) : []), [space]);
  const filled = useRef(false);
  // The first time here with nothing picked: pick what the links suggest.
  useEffect(() => {
    if (!space || filled.current || space.interests.length || !suggested.length) return;
    filled.current = true;
    update.mutate({ id: space.id, interests: suggested });
  }, [space, suggested, update]);
  const picked = space?.interests ?? [];
  const set = (interests: string[]) => space && update.mutate({ id: space.id, interests });
  return p.render({
    title: 'Pick what you want to talk about',
    sub: suggested.length ? 'Choose 3 to 8. We picked a few from your links.' : 'Choose 3 to 8.',
    canSkip: true,
    status: (
      <span key={picked.length} className="swap-in text-[13px] text-text-tertiary">
        {picked.length} picked
      </span>
    ),
    content: (
      <div className="flex flex-col gap-3">
        {suggested.length > 0 && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary">
            <Sparkles size={14} aria-hidden /> From your links
          </p>
        )}
        <div className="stagger">
          <TopicTiles picked={picked} onChange={set} columns={p.phone ? 2 : 4} />
        </div>
        <form
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 shadow-[inset_0_0_0_1px_var(--border-default)]"
          onSubmit={(e) => {
            e.preventDefault();
            const name = own.trim().slice(0, 60);
            if (name && picked.length < 8 && !picked.includes(name)) set([...picked, name]);
            setOwn('');
          }}
        >
          <input
            aria-label="Add your own topic"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-text-tertiary"
            placeholder="Something else? Type a topic and press Enter"
            value={own}
            onChange={(e) => setOwn(e.target.value)}
          />
        </form>
        <ErrorText error={update.error} />
      </div>
    ),
  });
}

function VoiceStep(p: StepProps) {
  const update = useUpdateSpace();
  const space = p.space;
  const [samples, setSamples] = useState(() => (space?.styleSamples ?? []).join('\n---\n'));
  const saveSamples = () => {
    if (!space) return;
    const list = samples
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (list.join('\n') !== space.styleSamples.join('\n')) update.mutate({ id: space.id, styleSamples: list });
  };
  return p.render({
    title: 'How should your posts sound?',
    sub: p.phone
      ? 'Pick a tone. Posts you liked help even more.'
      : 'Pick a tone and watch the post on the right change. Posts you liked help even more.',
    canSkip: true,
    onNext: () => {
      saveSamples();
      p.go(6);
    },
    content: (
      <div className="stagger flex flex-col gap-4">
        {space && <ToneCards value={space.tone} onChange={(tone) => update.mutate({ id: space.id, tone })} />}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-text-tertiary">
            Optional · paste 2 or 3 posts you wrote and liked (put --- between them)
          </span>
          <textarea
            className="h-28 resize-none rounded-2xl bg-surface px-3.5 py-3 text-[13.5px] shadow-[inset_0_0_0_1px_var(--border-default)] outline-none"
            placeholder="Paste here. We copy the rhythm, not the words."
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            onBlur={saveSamples}
          />
        </label>
        <ErrorText error={update.error} />
      </div>
    ),
  });
}

function AccountsStep(p: StepProps) {
  const update = useUpdateSpace();
  const space = p.space;
  const [name, setName] = useState(space?.name ?? '');
  useEffect(() => setName(space?.name ?? ''), [space?.name]);
  const notice =
    p.search.connected === 1
      ? { ok: true, text: `${p.search.channel === 'linkedin' ? 'LinkedIn' : 'X'} is connected.` }
      : p.search.error === 'other_space'
        ? { ok: false, text: 'That account is already in another space. Each account is in one space only.' }
        : p.search.error
          ? { ok: false, text: 'Could not connect. Try again.' }
          : null;
  return p.render({
    title: 'Where should this space post?',
    sub: 'Each account belongs to one space, so a post for one space never goes out from another space’s account.',
    canSkip: true,
    content: (
      <div className="stagger flex flex-col gap-2.5">
        <label className="mb-2 flex flex-col gap-1.5">
          <span className="text-[12.5px] text-text-tertiary">Space name</span>
          <span className="flex items-center gap-2.5 rounded-xl bg-surface px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--border-default)]">
            <SpaceAvatar name={name || '?'} />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                space && name.trim() && name.trim() !== space.name && update.mutate({ id: space.id, name: name.trim() })
              }
            />
          </span>
        </label>
        {notice && (
          <p
            role="status"
            className={clsx('rounded-xl px-3.5 py-2.5 text-[13px]', notice.ok ? 'tag-green' : 'tag-yellow')}
          >
            {notice.text}
          </p>
        )}
        {(['X', 'LINKEDIN'] as const).map((channel) => {
          const connection = space?.connections.find((c) => c.channel === channel);
          return (
            <div
              key={channel}
              className="flex items-center gap-3.5 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--border-default)]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-surface-subtle">
                <ChannelLogo channel={channel} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{channel === 'X' ? 'X' : 'LinkedIn'}</b>
                <span className="text-[13px] text-text-secondary">
                  {connection ? connection.accountName : 'Not connected'}
                </span>
              </span>
              {connection ? (
                <span className="relative inline-flex size-[22px] items-center justify-center rounded-full bg-ok text-white">
                  <Check size={12} strokeWidth={3} aria-label="Connected" />
                </span>
              ) : (
                space && (
                  <a
                    href={connectUrl(channel, space.id, 'welcome')}
                    className="btn btn-primary btn-sm"
                    onClick={p.beforeLeave}
                  >
                    Connect
                  </a>
                )
              )}
            </div>
          );
        })}
        <ErrorText error={update.error} />
      </div>
    ),
  });
}

function RhythmStep(p: StepProps) {
  const update = useUpdateSpace();
  const space = p.space;
  return p.render({
    title: 'How often?',
    sub: 'How many drafts a day, and when they should be waiting for you.',
    canSkip: !p.newMode,
    content: space ? (
      <div className="stagger">
        <Rhythm
          postsPerDay={space.postsPerDay}
          readyAt={space.readyAt}
          weekends={space.weekends}
          onChange={(patch) => update.mutate({ id: space.id, ...patch })}
        />
        <ErrorText error={update.error} className="mt-2" />
      </div>
    ) : null,
  });
}

/* ── Your AI ────────────────────────────────────────── */

export const AI_APPS = [
  { key: 'ag', name: 'Antigravity', note: 'Recommended', open: 'In Antigravity: File › Open Folder, then choose it.' },
  {
    key: 'cc',
    name: 'Claude Code',
    note: 'Laptop app or Code tab',
    open: 'In the Claude app: Code tab, choose the folder.',
  },
  { key: 'cx', name: 'Codex', note: "OpenAI's coding app", open: 'In Codex: open the folder as a project.' },
] as const;

function AiStep(p: StepProps) {
  const [app, setApp] = useState<(typeof AI_APPS)[number]>(AI_APPS[0]);
  const [got, setGot] = useState(false);
  const [opened, setOpened] = useState(false);
  const [prompt, setPrompt] = useState<{ text: string; tokenId: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const create = useCreateToken();
  const tokens = useTokens(Boolean(prompt));
  const connected = prompt ? Boolean(tokens.data?.find((t) => t.id === prompt.tokenId)?.lastUsedAt) : false;
  const done = [got || opened || Boolean(prompt), opened || Boolean(prompt), Boolean(prompt), connected];
  const current = done.findIndex((d) => !d);

  async function copyPrompt() {
    setNote(null);
    let made = prompt;
    if (!made) {
      const { token, plaintext } = await create.mutateAsync(app.name);
      made = {
        text: setupPrompt({ mcpUrl: p.me.mcpUrl, kitUrl: p.me.kitUrl, token: plaintext, readyAt: p.space?.readyAt }),
        tokenId: token.id,
      };
      setPrompt(made);
    }
    try {
      await copyText(made.text);
      setNote('Copied. Paste it into ' + app.name + '.');
    } catch {
      setNote('Select the prompt and copy it.');
    }
  }

  if (p.phone)
    return p.render({
      title: 'Connect your AI',
      sub: 'Your AI reads your spaces each morning, writes the drafts and sends them here.',
      cta: 'Continue',
      content: (
        <div className="stagger">
          <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            <Monitor size={18} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden />
            <span>
              <b className="block font-semibold">Do this on your laptop</b>
              <span className="text-[13px] text-text-secondary">
                The kit runs in an AI app on your laptop (Antigravity recommended). Open this app on your laptop:
                Connect has the steps.
              </span>
            </span>
          </div>
        </div>
      ),
    });

  const kitZip = `${p.me.kitUrl.replace(/\/$/, '')}/archive/refs/heads/main.zip`;
  const steps: { title: string; line: string; act?: ReactNode }[] = [
    {
      title: 'Get the NorthList Posts kit',
      line: 'A small folder of instructions. Free, on GitHub.',
      act: (
        <>
          <a href={kitZip} className="btn btn-secondary btn-sm" onClick={() => setGot(true)}>
            <Download size={14} aria-hidden /> Download ZIP
          </a>
          <a
            href={p.me.kitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            onClick={() => setGot(true)}
          >
            Open on GitHub
          </a>
        </>
      ),
    },
    {
      title: `Open the folder in ${app.name}`,
      line: app.open,
      act: (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpened(true)}>
          It is open
        </button>
      ),
    },
    {
      title: 'Paste your setup prompt',
      line: 'It has your private key. We make it now; it works for one year.',
      act: (
        <div className="flex w-full flex-col gap-2">
          {prompt && (
            <pre className="max-h-32 overflow-y-auto rounded-[10px] bg-surface-subtle px-3 py-2.5 font-mono text-xs leading-[18px] whitespace-pre-wrap text-text-secondary">
              {prompt.text}
            </pre>
          )}
          <span className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void copyPrompt()}
              disabled={create.isPending}
            >
              <Copy size={14} aria-hidden /> {prompt ? 'Copy again' : 'Copy prompt'}
            </button>
            {note && <span className="text-[12.5px] text-text-secondary">{note}</span>}
          </span>
          <ErrorText error={create.error} />
        </div>
      ),
    },
    {
      title: `Allow "northlist-posts" when ${app.name} asks`,
      line: `One tap. It lets ${app.name} send drafts to this app and nothing else.`,
    },
  ];

  return p.render({
    title: 'Connect your AI',
    sub: 'Your AI reads your spaces each morning, writes the drafts and sends them here. Four short steps, once.',
    cta: connected ? 'Continue' : 'Skip for now',
    content: (
      <div className="stagger flex flex-col gap-3">
        <div role="radiogroup" aria-label="Your AI app" className="grid grid-cols-3 gap-2.5">
          {AI_APPS.map((a) => (
            <button
              key={a.key}
              type="button"
              role="radio"
              aria-checked={app.key === a.key}
              className="pick p-3.5"
              onClick={() => setApp(a)}
              disabled={Boolean(prompt)}
            >
              <span className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-surface-subtle font-mono text-[13px] font-bold">
                {a.key.toUpperCase()}
              </span>
              <b className="block text-sm font-semibold">{a.name}</b>
              <small
                className={clsx('text-xs', a.key === 'ag' ? 'font-semibold text-text-primary' : 'text-text-tertiary')}
              >
                {a.note}
              </small>
              {app.key === a.key && <CheckDot fresh />}
            </button>
          ))}
        </div>
        <ol className="flex flex-col">
          {steps.map((s, i) => {
            const isDone = done[i];
            const isCur = i === current;
            return (
              <li
                key={s.title}
                className={clsx(
                  'relative grid grid-cols-[30px_1fr] items-start gap-3 py-2',
                  !isDone && !isCur && 'opacity-55',
                )}
              >
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={clsx(
                      'absolute top-[38px] bottom-[-6px] left-[13.5px] w-[1.5px]',
                      isDone ? 'bg-ok' : 'bg-border-default',
                    )}
                  />
                )}
                <span
                  className={clsx(
                    'relative z-[1] inline-flex size-7 items-center justify-center rounded-full text-[12.5px] font-[650] transition-colors',
                    isDone
                      ? 'burst bg-ok text-white'
                      : isCur
                        ? 'bg-text-primary text-canvas'
                        : 'bg-surface-subtle text-text-secondary',
                  )}
                >
                  {isDone ? <Check size={13} strokeWidth={3} className="pop-in" aria-label="Done" /> : i + 1}
                </span>
                <span>
                  <b className="block text-sm font-semibold">{s.title}</b>
                  <small className="mt-0.5 block text-[12.5px] text-text-secondary">{s.line}</small>
                  {(isCur || (i === 2 && prompt && !connected)) && s.act && (
                    <span className="mt-2 flex flex-wrap gap-2">{s.act}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          {connected ? (
            <>
              <span className="burst relative inline-flex size-[22px] items-center justify-center rounded-full bg-ok text-white">
                <Check size={12} strokeWidth={3} aria-hidden />
              </span>
              <span>
                <b className="block text-sm">Connected</b>
                <small className="text-[12.5px] text-text-tertiary">{app.name} · first drafts on the way</small>
              </span>
            </>
          ) : (
            <>
              <span className="pulse-ring inline-block size-2.5 rounded-full bg-text-tertiary" aria-hidden />
              <span>
                <span className="shimmer text-sm">
                  {prompt ? `Waiting for ${app.name}…` : 'Follow the steps above'}
                </span>
                <small className="block text-[12.5px] text-text-tertiary">
                  This changes by itself once it connects.
                </small>
              </span>
            </>
          )}
        </div>
      </div>
    ),
  });
}

/* ── Pictures ───────────────────────────────────────── */

function Progress({ step, newMode }: { step: number; newMode: boolean }) {
  const count = newMode ? 6 : 7;
  return (
    <div className="progress-line my-6 md:mt-[26px] md:mb-[30px]" aria-label={`Step ${step - 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => {
        const n = i + 2;
        return <i key={n} className={step > n ? 'done' : step === n ? 'now' : ''} />;
      })}
    </div>
  );
}

function Rings() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full opacity-50">
      {Array.from({ length: 13 }, (_, i) => (
        <circle key={i} cx="50%" cy="50%" r={60 + i * 70} fill="none" stroke="var(--art)" strokeOpacity={0.06} />
      ))}
    </svg>
  );
}

const FLOW_START = [
  { title: 'Gmail summary page is live', from: 'Shipped · from GitHub', tint: 'sand' },
  { title: 'Unreal Engine 6 rebuilt for AI agents', from: 'News · IEEE Spectrum', tint: 'lilac' },
  { title: 'Why job trackers fail', from: 'Your idea', tint: 'sage' },
];

function Flow({ done }: { done: boolean }) {
  return (
    <div aria-hidden className="relative h-[440px] w-[420px]">
      {FLOW_START.map((row, i) => (
        <div
          key={row.title}
          className="flow-card card-float absolute right-[30px] left-[30px] flex items-center gap-3 px-4 py-3.5"
          style={{ top: 40 + i * 96, animationDelay: `${i * 0.6}s` }}
        >
          <span className="size-[34px] shrink-0 rounded-[10px]" style={{ background: `var(--tint-${row.tint})` }} />
          <span className="min-w-0">
            <b className="block truncate text-[13.5px]">{row.title}</b>
            <small className="text-xs text-text-tertiary">{row.from}</small>
          </span>
          <span className="ml-auto flex gap-1.5">
            <span className="relative flex size-[26px] items-center justify-center rounded-lg bg-surface-subtle">
              <ChannelLogo channel="X" size={13} />
              <i
                className="flow-tick absolute -right-1 -bottom-1 size-3.5 rounded-full bg-ok"
                style={{ animationDelay: `${i * 0.6 + 0.4}s` }}
              />
            </span>
            <span className="flex size-[26px] items-center justify-center rounded-lg bg-surface-subtle">
              <ChannelLogo channel="LINKEDIN" size={13} />
            </span>
          </span>
        </div>
      ))}
      <div
        className="flow-card card-float absolute top-[340px] right-[30px] left-[30px] px-4 py-3.5 text-center"
        style={{ animationDelay: '1.8s' }}
      >
        <small className="text-xs text-text-tertiary">
          {done ? 'Your first drafts, arriving soon' : 'Every morning, written by your AI. You pick, edit, post.'}
        </small>
      </div>
    </div>
  );
}

function LivePicture({ space: saved, step, goal }: { space?: SpaceView; step: number; goal?: Goal }) {
  const preview = goal
    ? {
        goal,
        tone: saved?.tone ?? ('PLAIN' as const),
        productName: saved?.productName ?? '',
        productUrl: saved?.productUrl ?? '',
      }
    : null;
  const space = saved && goal ? { ...saved, goal } : saved;
  const sample = space ? samplePost(space) : preview ? samplePost(preview) : '';
  const [shown, setShown] = useState(sample);
  // The sample post types itself again when the goal or tone changes.
  useEffect(() => {
    if (sample === shown) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(sample);
    let n = 0;
    const id = window.setInterval(() => {
      n += Math.max(2, Math.round(sample.length / 45));
      setShown(sample.slice(0, n));
      if (n >= sample.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample]);
  const typing = shown !== sample;
  const name = space?.name ?? 'Your space';
  const x = space?.connections.find((c) => c.channel === 'X');
  const li = space?.connections.find((c) => c.channel === 'LINKEDIN');
  return (
    <div aria-hidden className="relative flex w-[440px] flex-col gap-3">
      <p className="ml-1 text-[11.5px] tracking-[0.08em] text-text-tertiary uppercase">Your space</p>
      <div className="card-float p-[18px]">
        <div className="flex items-center gap-3">
          <SpaceAvatar name={name} size={44} />
          <div>
            <b className="block text-[17px] font-[650]">{name}</b>
            <span className="text-[13px] text-text-secondary">
              {space ? GOALS[space.goal].title : goal ? GOALS[goal].title : 'Goal not set'}
              {space && ` · ${space.postsPerDay} a day at ${timeLabel(space.readyAt)}`}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {space?.links.length ? (
            space.links.map((l) => (
              <span key={l.id} className="pop-in tag tag-gray gap-1.5">
                {l.isPrivate ? (
                  <Lock size={11} />
                ) : l.kind.startsWith('GITHUB') ? (
                  <BrandLogo name="github" size={11} />
                ) : (
                  <Globe size={11} />
                )}
                {l.title || l.url.replace(/^https?:\/\//, '')}
              </span>
            ))
          ) : (
            <span className="tag border border-dashed border-border-default text-text-tertiary">Your links</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {x || li ? (
            [x, li].filter(Boolean).map((c) => (
              <span key={c!.channel} className="pop-in tag tag-gray gap-1.5">
                <ChannelLogo channel={c!.channel} size={11} /> {c!.accountName}
              </span>
            ))
          ) : (
            <span className="tag border border-dashed border-border-default text-text-tertiary">Accounts</span>
          )}
        </div>
        {step >= 4 && space && space.interests.length > 0 && (
          <div className="mt-3 flex gap-1.5">
            {space.interests.slice(0, 6).map((t) => (
              <MiniTopic key={t} name={t} className="pop-in h-[34px] w-[46px]" />
            ))}
          </div>
        )}
      </div>
      <p className="mt-1.5 ml-1 text-[11.5px] tracking-[0.08em] text-text-tertiary uppercase">A post it could write</p>
      <div className="card-float px-[18px] py-4">
        <div className="mb-2 flex items-center gap-2.5">
          <SpaceAvatar name={name} />
          <span>
            <b className="text-sm">{name}</b>{' '}
            <span className="text-[12.5px] text-text-tertiary">{x?.accountName ?? '@you'} · draft</span>
          </span>
        </div>
        <p className={clsx('min-h-[80px] text-sm leading-normal whitespace-pre-line', typing && 'typing')}>{shown}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-text-tertiary">
          <span>{space?.goal === 'PROMOTE' ? 'Shipped' : 'News + your take'}</span>
          <span className="flex gap-2">
            <ChannelLogo channel="X" size={13} />
            <ChannelLogo channel="LINKEDIN" size={13} />
          </span>
        </div>
      </div>
    </div>
  );
}

function Strip({ space }: { space: SpaceView }) {
  return (
    <div className="mt-1 mb-1.5 flex items-center gap-2.5 rounded-2xl bg-[var(--stage)] px-3 py-2.5">
      <SpaceAvatar name={space.name} />
      <span className="text-[13px]">
        <b>{space.name}</b>
        <span className="block text-[11.5px] text-text-tertiary">
          {GOALS[space.goal].title} · {space.postsPerDay} a day
        </span>
      </span>
      <span className="ml-auto flex gap-1">
        {space.interests.slice(0, 4).map((t) => (
          <MiniTopic key={t} name={t} className="pop-in h-[18px] w-[22px] rounded-[5px]" />
        ))}
      </span>
    </div>
  );
}

function SpaceIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

const STEP_VIEWS: Record<number, (p: StepProps) => ReactNode> = {
  1: WelcomeStep,
  2: GoalStep,
  3: LinksStep,
  4: InterestsStep,
  5: VoiceStep,
  6: AccountsStep,
  7: RhythmStep,
  8: AiStep,
  9: DoneStep,
};
