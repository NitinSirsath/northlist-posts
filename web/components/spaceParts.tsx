/**
 * The pieces a space is made of, as pictures (owner, 22 Nov 2026): goal cards, topic tiles, tone cards,
 * posts a day with a small week, and the time drafts are ready. Used by the first-run steps and the
 * Space page, so both look and behave the same.
 */
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useState } from 'react';
import type { Goal, SourceLinkView, SpaceView, Tone } from '../../shared/contracts';

export type Tint = 'sand' | 'sage' | 'lilac' | 'rose' | 'stone' | 'mint' | 'peach' | 'olive';
const tint = (t: Tint) => `var(--tint-${t})`;

export function CheckDot({ fresh }: { fresh?: boolean }) {
  return (
    <span className={clsx('pick-check', fresh && 'pop-in')} aria-hidden>
      <Check size={13} strokeWidth={3} />
    </span>
  );
}

/* ── Topics ─────────────────────────────────────────── */

export const TOPICS: { name: string; tint: Tint; art: number }[] = [
  { name: 'AI coding tools', tint: 'lilac', art: 5 },
  { name: 'Job search', tint: 'sand', art: 4 },
  { name: 'Building in public', tint: 'sage', art: 6 },
  { name: 'React', tint: 'mint', art: 0 },
  { name: 'TypeScript', tint: 'stone', art: 1 },
  { name: 'Startups', tint: 'peach', art: 7 },
  { name: 'Product design', tint: 'rose', art: 2 },
  { name: 'Open source', tint: 'olive', art: 3 },
  { name: 'Career growth', tint: 'sage', art: 4 },
  { name: 'Remote work', tint: 'mint', art: 2 },
  { name: 'Web performance', tint: 'sand', art: 3 },
  { name: 'Mobile apps', tint: 'lilac', art: 1 },
  { name: 'DevOps', tint: 'stone', art: 6 },
  { name: 'Data and AI', tint: 'peach', art: 5 },
  { name: 'Security', tint: 'rose', art: 0 },
  { name: 'SaaS', tint: 'olive', art: 7 },
];

const topicOf = (name: string) =>
  TOPICS.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? {
    name,
    tint: (['stone', 'sand', 'sage', 'mint'] as Tint[])[name.length % 4]!,
    art: name.length % 8,
  };

/** Drawn lines on a soft tint: one of eight patterns. */
export function TopicArt({ art, color }: { art: number; color: Tint }) {
  const line = { stroke: 'var(--art)', fill: 'none', strokeWidth: 1.4, opacity: 0.28 };
  const parts: React.ReactNode[] = [];
  if (art === 0) for (let r = 8; r < 120; r += 12) parts.push(<circle key={r} cx={150} cy={10} r={r} {...line} />);
  if (art === 1)
    for (let x = 8; x < 170; x += 12)
      for (let y = 8; y < 100; y += 12)
        parts.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="var(--art)" opacity={0.22} />);
  if (art === 2)
    for (let y = 10; y < 100; y += 12)
      parts.push(<path key={y} d={`M0 ${y} q20 -10 40 0 t40 0 t40 0 t40 0 t40 0`} {...line} />);
  if (art === 3)
    for (let x = -100; x < 180; x += 12) parts.push(<path key={x} d={`M${x} 100 L${x + 100} 0`} {...line} />);
  if (art === 4)
    for (let i = 0; i < 6; i++)
      parts.push(
        <rect
          key={i}
          x={96 + i * 4}
          y={8 + i * 13}
          width={70 - i * 8}
          height={8}
          rx={4}
          fill="var(--art)"
          opacity={0.08 + i * 0.03}
        />,
      );
  if (art === 5)
    parts.push(
      <ellipse key="a" cx={130} cy={30} rx={44} ry={16} {...line} />,
      <ellipse key="b" cx={130} cy={30} rx={16} ry={44} {...line} />,
      <circle key="c" cx={130} cy={30} r={6} fill="var(--art)" opacity={0.3} />,
    );
  if (art === 6)
    for (let x = 0; x < 170; x += 18)
      for (let y = 0; y < 100; y += 18)
        if ((x + y) % 36 === 0)
          parts.push(
            <rect
              key={`${x}-${y}`}
              x={x + 2}
              y={y + 2}
              width={14}
              height={14}
              rx={3}
              fill="var(--art)"
              opacity={0.1}
            />,
          );
  if (art === 7)
    for (let i = 0; i < 5; i++)
      parts.push(<path key={i} d={`M${110 + i * 10} ${70 - i * 12} l14 -24 l14 24 z`} {...line} />);
  return (
    <svg viewBox="0 0 170 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={170} height={100} fill={tint(color)} />
      {parts}
    </svg>
  );
}

export function MiniTopic({ name, className }: { name: string; className?: string }) {
  const t = topicOf(name);
  return (
    <i
      title={name}
      className={clsx(
        'relative block overflow-hidden rounded-lg [&_svg]:absolute [&_svg]:inset-0 [&_svg]:size-full',
        className,
      )}
    >
      <TopicArt art={t.art} color={t.tint} />
    </i>
  );
}

/** Topic picture tiles: tap to pick, up to `max`. Topics you added yourself show as tiles too. */
export function TopicTiles({
  picked,
  onChange,
  max = 8,
  columns = 4,
}: {
  picked: string[];
  onChange: (next: string[]) => void;
  max?: number;
  columns?: number;
}) {
  const [fresh, setFresh] = useState<string | null>(null);
  const has = (name: string) => picked.some((p) => p.toLowerCase() === name.toLowerCase());
  const own = picked.filter((p) => !TOPICS.some((t) => t.name.toLowerCase() === p.toLowerCase()));
  const all = [...TOPICS, ...own.map(topicOf)];
  function toggle(name: string) {
    if (has(name)) {
      setFresh(null);
      onChange(picked.filter((p) => p.toLowerCase() !== name.toLowerCase()));
    } else if (picked.length < max) {
      setFresh(name);
      onChange([...picked, name]);
    }
  }
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {all.map((t) => {
        const on = has(t.name);
        return (
          <button
            key={t.name}
            type="button"
            aria-pressed={on}
            className={clsx('tile', fresh === t.name && 'bump')}
            onClick={() => toggle(t.name)}
            disabled={!on && picked.length >= max}
          >
            <TopicArt art={t.art} color={t.tint} />
            <span className="tile-label">{t.name}</span>
            {on && <CheckDot fresh={fresh === t.name} />}
          </button>
        );
      })}
    </div>
  );
}

/** Topics that fit what the links say, to pick for the user first. */
export function suggestTopics(links: SourceLinkView[], goal: Goal) {
  const text = links
    .map((l) => `${l.url} ${l.title} ${l.description}`)
    .join(' ')
    .toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(ai|agent|llm|claude|gpt|copilot|cursor)\b/, 'AI coding tools'],
    [/\b(job|jobs|career|hiring|recruit|apply|resume)\b/, 'Job search'],
    [/\breact\b/, 'React'],
    [/\btypescript\b/, 'TypeScript'],
    [/\b(startup|founder|launch)\b/, 'Startups'],
    [/\bdesign\b/, 'Product design'],
    [/github\.com/, 'Open source'],
    [/\b(saas|subscription|pricing)\b/, 'SaaS'],
    [/\b(mobile|ios|android|iphone)\b/, 'Mobile apps'],
  ];
  const found = rules.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (goal === 'PROMOTE') found.push('Building in public');
  if (goal === 'JOB') found.push('Job search', 'Career growth');
  return [...new Set(found)].slice(0, 4);
}

/* ── Goals ──────────────────────────────────────────── */

export const GOALS: Record<Goal, { title: string; line: string; tint: Tint }> = {
  PROMOTE: { title: 'Promote a product', line: 'Posts about what you ship and news around it.', tint: 'sand' },
  NETWORK: {
    title: 'Grow my network',
    line: 'Smart takes on your field so the right people follow you.',
    tint: 'sage',
  },
  JOB: { title: 'Find a job', line: 'Show your skills and work so recruiters notice.', tint: 'lilac' },
};

export function GoalArt({ goal, fresh }: { goal: Goal; fresh?: boolean }) {
  const s = {
    stroke: 'var(--art)',
    strokeWidth: 2,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const card = { ...s, fill: 'var(--surface)' };
  const d = (n: number) => ({ '--d': n }) as React.CSSProperties;
  return (
    <svg viewBox="0 0 132 84" width="132" height="84" aria-hidden className={clsx('goal-art', fresh && 'fresh')}>
      {goal === 'PROMOTE' && (
        <>
          <rect className="bar" style={d(0)} x={16} y={52} width={14} height={18} rx={3} {...card} />
          <rect className="bar" style={d(1)} x={38} y={40} width={14} height={30} rx={3} {...card} />
          <rect className="bar" style={d(2)} x={60} y={28} width={14} height={42} rx={3} {...card} />
          <path className="draw" d="M18 40l24-14 18 8 34-22" {...s} />
          <path d="M84 12h10v10" {...s} />
          <circle className="node" style={d(4)} cx={108} cy={54} r={12} {...card} />
          <path d="M104 54l3 3 6-6" {...s} />
          <circle className="node" style={d(5)} cx={96} cy={74} r={2} fill="var(--art)" />
          <circle className="node" style={d(6)} cx={118} cy={30} r={2} fill="var(--art)" />
        </>
      )}
      {goal === 'NETWORK' && (
        <>
          <path
            className="draw"
            d="M66 42L30 22M66 42l38-18M66 42L36 66M66 42l34 24M30 22l-10 30M104 24l14 26"
            {...s}
            opacity={0.55}
          />
          <circle className="node" style={d(0)} cx={66} cy={42} r={12} {...card} />
          <circle cx={66} cy={39} r={3.5} fill="var(--art)" />
          <path d="M60 48a7 7 0 0 1 12 0" {...s} />
          <circle className="node" style={d(1)} cx={30} cy={22} r={7} {...card} />
          <circle className="node" style={d(2)} cx={104} cy={24} r={8} {...card} />
          <circle className="node" style={d(3)} cx={36} cy={66} r={6} {...card} />
          <circle className="node" style={d(4)} cx={100} cy={66} r={7} {...card} />
          <circle className="node" style={d(5)} cx={20} cy={52} r={4} fill="var(--art)" />
          <circle className="node" style={d(6)} cx={118} cy={50} r={4} fill="var(--art)" />
        </>
      )}
      {goal === 'JOB' && (
        <>
          <rect className="bar" x={30} y={26} width={64} height={44} rx={7} {...card} />
          <path d="M52 26v-6a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v6M30 44h64" {...s} />
          <rect x={56} y={40} width={12} height={8} rx={2} fill="var(--art)" />
          <circle className="node" style={d(3)} cx={102} cy={22} r={11} {...card} />
          <path className="draw" d="M97 22l3.5 3.5L107 19" {...s} />
          <path className="draw" d="M14 62h8M10 50h10M18 74h10" {...s} opacity={0.5} />
        </>
      )}
    </svg>
  );
}

export function GoalCards({
  value,
  onChange,
  compact,
}: {
  value?: Goal;
  onChange: (goal: Goal) => void;
  compact?: boolean;
}) {
  const [fresh, setFresh] = useState<Goal | null>(null);
  return (
    <div role="radiogroup" aria-label="Goal" className="grid gap-3">
      {(Object.keys(GOALS) as Goal[]).map((goal) => {
        const g = GOALS[goal];
        const on = value === goal;
        return (
          <button
            key={goal}
            type="button"
            role="radio"
            aria-checked={on}
            className={clsx(
              'pick grid items-center gap-4 p-2.5 pr-4',
              compact ? 'grid-cols-[96px_1fr]' : 'grid-cols-[132px_1fr]',
            )}
            onClick={() => {
              setFresh(goal);
              onChange(goal);
            }}
          >
            <span
              className={clsx(
                'flex items-center justify-center overflow-hidden rounded-xl',
                compact ? 'h-[68px]' : 'h-[84px]',
              )}
              style={{ background: tint(g.tint) }}
            >
              <GoalArt goal={goal} fresh={fresh === goal} />
            </span>
            <span>
              <b className="block text-base font-semibold">{g.title}</b>
              <span className="text-[13.5px] text-text-secondary">{g.line}</span>
            </span>
            {on && <CheckDot fresh={fresh === goal} />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Tone ───────────────────────────────────────────── */

export const TONES: Record<Tone, { title: string; line: string; tint: Tint }> = {
  PLAIN: { title: 'Plain', line: 'Short, clear sentences. No hype.', tint: 'stone' },
  FRIENDLY: { title: 'Friendly', line: 'Warm, a bit personal, a question at the end.', tint: 'peach' },
  BOLD: { title: 'Bold', line: 'Strong first line, clear opinion.', tint: 'rose' },
};

function ToneArt({ tone }: { tone: Tone }) {
  const f = { fill: 'var(--art)' };
  return (
    <svg viewBox="0 0 90 50" width="90" height="50" aria-hidden>
      {tone === 'PLAIN' && (
        <>
          <rect x={10} y={12} width={60} height={5} rx={2.5} {...f} opacity={0.5} />
          <rect x={10} y={23} width={48} height={5} rx={2.5} {...f} opacity={0.35} />
          <rect x={10} y={34} width={54} height={5} rx={2.5} {...f} opacity={0.35} />
        </>
      )}
      {tone === 'FRIENDLY' && (
        <>
          <rect
            x={8}
            y={10}
            width={54}
            height={22}
            rx={11}
            fill="var(--surface)"
            stroke="var(--art)"
            strokeWidth={1.6}
          />
          <circle cx={22} cy={21} r={2} {...f} />
          <circle cx={35} cy={21} r={2} {...f} />
          <circle cx={48} cy={21} r={2} {...f} />
          <rect x={40} y={30} width={42} height={14} rx={7} {...f} opacity={0.25} />
        </>
      )}
      {tone === 'BOLD' && (
        <>
          <rect x={10} y={9} width={70} height={11} rx={3} {...f} opacity={0.85} />
          <rect x={10} y={26} width={44} height={5} rx={2.5} {...f} opacity={0.35} />
          <rect x={10} y={36} width={56} height={5} rx={2.5} {...f} opacity={0.35} />
        </>
      )}
    </svg>
  );
}

export function ToneCards({ value, onChange }: { value: Tone; onChange: (tone: Tone) => void }) {
  return (
    <div role="radiogroup" aria-label="Tone" className="grid grid-cols-3 gap-2.5">
      {(Object.keys(TONES) as Tone[]).map((tone) => {
        const t = TONES[tone];
        const on = value === tone;
        return (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={on}
            className="pick p-3"
            onClick={() => onChange(tone)}
          >
            <span
              className="mb-2.5 flex h-16 items-center justify-center rounded-[10px]"
              style={{ background: tint(t.tint) }}
            >
              <ToneArt tone={tone} />
            </span>
            <b className="block text-sm font-semibold">{t.title}</b>
            <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-text-secondary">{t.line}</span>
            {on && <CheckDot fresh />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Rhythm ─────────────────────────────────────────── */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const READY_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00'];

export const timeLabel = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(2026, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export function Rhythm({
  postsPerDay,
  readyAt,
  weekends,
  onChange,
}: {
  postsPerDay: number;
  readyAt: string;
  weekends: boolean;
  onChange: (patch: { postsPerDay?: number; readyAt?: string; weekends?: boolean }) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Posts a day" className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={postsPerDay === n}
            onClick={() => onChange({ postsPerDay: n })}
            className={clsx(
              'size-14 rounded-2xl text-xl font-[650] transition-[transform,background-color] active:scale-95',
              postsPerDay === n
                ? 'bg-text-primary text-canvas'
                : 'bg-surface shadow-[inset_0_0_0_1px_var(--border-default)]',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div
        aria-hidden
        className="grid grid-cols-7 gap-2 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
      >
        {DAYS.map((day, i) => {
          const on = weekends || i < 5;
          return (
            <div key={day}>
              <div className="text-center text-[11.5px] text-text-tertiary">{day}</div>
              <div className="mt-2 flex flex-col items-center gap-[5px]">
                {[0, 1, 2, 3, 4].map((j) => (
                  <i
                    key={`${j}-${postsPerDay}-${on}`}
                    className={clsx(
                      'block h-3.5 w-full rounded-[5px]',
                      j < postsPerDay && on ? 'week-dot bg-text-primary/85' : 'bg-surface-subtle',
                    )}
                    style={{ animationDelay: `${(i * 5 + j) * 18}ms` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <p className="mb-2 text-[12.5px] text-text-tertiary">Drafts ready by</p>
        <div role="radiogroup" aria-label="Drafts ready by" className="flex flex-wrap gap-2">
          {READY_TIMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={readyAt === t}
              onClick={() => onChange({ readyAt: t })}
              className={clsx(
                'rounded-full px-3.5 py-1.5 text-[13px] transition-transform active:scale-95',
                readyAt === t
                  ? 'font-semibold shadow-[inset_0_0_0_2px_var(--text-primary)]'
                  : 'shadow-[inset_0_0_0_1px_var(--border-default)]',
              )}
            >
              {timeLabel(t)}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2.5 text-[13px] text-text-secondary">
        <input type="checkbox" checked={weekends} onChange={(e) => onChange({ weekends: e.target.checked })} />
        Weekends too
      </label>
    </div>
  );
}

/* ── Small things ───────────────────────────────────── */

export function SpaceAvatar({ name, size = 28, muted }: { name: string; size?: number; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-bold',
        muted ? 'bg-text-tertiary text-canvas' : 'bg-text-primary text-canvas',
      )}
      style={{ width: size, height: size, borderRadius: size * 0.28, fontSize: size * 0.45 }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** Start connecting X or LinkedIn to a space; comes back to the first-run steps or the Space page. */
export const connectUrl = (channel: 'X' | 'LINKEDIN', spaceId: string, back: 'welcome' | 'space') =>
  `/api/connect/${channel === 'X' ? 'x' : 'linkedin'}/start?space=${encodeURIComponent(spaceId)}&back=${back}`;

/** A post this space could get: changes with the goal and the tone, so the picks feel real. */
export function samplePost(space: Pick<SpaceView, 'goal' | 'tone' | 'productName' | 'productUrl'>) {
  const product = space.productName || 'your product';
  const site = space.productUrl.replace(/^https?:\/\//, '') || '';
  if (space.goal === 'PROMOTE') {
    if (space.tone === 'BOLD')
      return `Most tools ask you to do the work.\n\n${product} does it for you: the new version is out this week.${site ? `\n\n${site}` : ''}`;
    if (space.tone === 'FRIENDLY')
      return `Small win this week: ${product} got a change people asked for.\n\nWhat would you want it to do next?`;
    return `Shipped this week: a change to ${product} that makes the everyday part simpler.${site ? `\n\n${site}` : ''}`;
  }
  if (space.goal === 'NETWORK')
    return space.tone === 'BOLD'
      ? 'Hot take: the hard part of coding with AI is no longer the code. It is saying what you want.'
      : 'Spent the week with AI coding tools. The surprise: the hard part is no longer writing code, it is explaining what you want.\n\nWhat changed most in your work this year?';
  return 'Looking for my next role.\n\nThis month I built and shipped two small products. Both are live; happy to show either.';
}
