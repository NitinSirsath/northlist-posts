/** Profile: what your AI reads before it writes. One Save button for the whole form. */
import { Plus, Sparkles, X as XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  INTERESTS_MAX,
  SHIPPED_FROM_MAX,
  STYLE_SAMPLES_MAX,
  STYLE_SAMPLE_LENGTH,
  type Goal,
  type ProfileFields,
  type ProfileView,
} from '../../shared/contracts';
import { errorMessage, isApiError } from '../api';
import { AutoTextarea, ErrorText, LoadError, Loading, Page } from '../components/ui';
import { shortDate } from '../lib/format';
import { useIsPhone } from '../lib/hooks';
import { useProfile, useSaveProfile, useSignOut } from '../queries';

const GOALS: { value: Goal; label: string }[] = [
  { value: 'PROMOTE', label: 'Promote my product' },
  { value: 'NETWORK', label: 'Grow my network' },
  { value: 'JOB', label: 'Find a job' },
];

const FIELD_NAMES: Record<string, string> = {
  productName: 'product name',
  productUrl: 'product link (use https://…)',
  productLine: 'product line',
  interests: 'interests',
  shippedFrom: 'shipped posts from',
  postsPerDay: 'posts each day',
  repliesPerDay: 'reply drafts each day',
  styleSamples: 'your style',
};

/** "Some fields are not valid. Check: product link." */
function saveErrorText(err: unknown) {
  const fields = isApiError(err) ? (err.fields ?? []) : [];
  const names = [...new Set(fields.map((f) => FIELD_NAMES[f.split('.')[0]] ?? f))];
  return names.length ? new Error(`${errorMessage(err)} Check: ${names.join(', ')}.`) : err;
}

const fieldsOf = (p: ProfileView): ProfileFields => ({
  goal: p.goal,
  productName: p.productName,
  productUrl: p.productUrl,
  productLine: p.productLine,
  interests: p.interests,
  shippedFrom: p.shippedFrom,
  postsPerDay: p.postsPerDay,
  repliesPerDay: p.repliesPerDay,
  useX: p.useX,
  useLinkedIn: p.useLinkedIn,
  styleSamples: p.styleSamples,
});

export function ProfilePage() {
  const profile = useProfile();
  const phone = useIsPhone();
  return (
    <Page
      title="Profile"
      subtitle="What your AI reads before it writes. You can change anything here."
      aside={profile.data && <LastChanged profile={profile.data} />}
    >
      {profile.isPending ? (
        <Loading />
      ) : !profile.data ? (
        <LoadError error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <ProfileForm profile={profile.data} />
      )}
      {phone && <PhoneSignOut />}
    </Page>
  );
}

function LastChanged({ profile }: { profile: ProfileView }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
      <Sparkles size={14} aria-hidden />
      Last changed by {profile.updatedBy} on {shortDate(profile.updatedAt)}
    </span>
  );
}

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'div';
  return (
    <div className="grid gap-2 px-4 py-3.5 md:grid-cols-[220px_1fr] md:items-start md:gap-6 md:px-6 md:py-[18px]">
      <Label htmlFor={htmlFor} className="text-[15px] font-semibold md:text-sm">
        {label}
        {hint && <small className="mt-1 block text-xs leading-[17px] font-normal text-text-tertiary">{hint}</small>}
      </Label>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}

function ProfileForm({ profile }: { profile: ProfileView }) {
  const save = useSaveProfile();
  const [form, setForm] = useState<ProfileFields>(() => fieldsOf(profile));
  const [saved, setSaved] = useState(false);
  const ids = { name: useId(), url: useId(), line: useId(), posts: useId() };
  const original = JSON.stringify(fieldsOf(profile));
  const dirty = JSON.stringify(form) !== original;

  // Your AI may change the profile while this page is open; take its copy when nothing is edited here.
  const shown = useRef(original);
  useEffect(() => {
    if (original === shown.current) return;
    const unedited = JSON.stringify(form) === shown.current;
    shown.current = original;
    if (unedited) setForm(JSON.parse(original) as ProfileFields);
  }, [original, form]);

  const set = <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean: ProfileFields = {
      ...form,
      productName: form.productName.trim(),
      productUrl: form.productUrl.trim(),
      productLine: form.productLine.trim(),
      styleSamples: form.styleSamples.map((s) => s.trim()).filter(Boolean),
    };
    save.mutate(clean, {
      onSuccess: (next) => {
        setForm(fieldsOf(next));
        setSaved(true);
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Profile">
      <div className="panel rows flex flex-col">
        <Row label="Goal" hint="Sets the mix of posts.">
          <div role="radiogroup" aria-label="Goal" className="seg flex-wrap max-md:rounded-[18px]">
            {GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={form.goal === g.value}
                onClick={() => set('goal', g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Your product" hint="Mentioned in about 1 in 3 posts.">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              id={ids.name}
              aria-label="Product name"
              className="field"
              placeholder="Name"
              maxLength={80}
              value={form.productName}
              onChange={(e) => set('productName', e.target.value)}
            />
            <input
              id={ids.url}
              aria-label="Product link"
              className="field"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.productUrl}
              onChange={(e) => set('productUrl', e.target.value)}
            />
          </div>
          <input
            id={ids.line}
            aria-label="Product in one line"
            className="field"
            placeholder="What it does, in one line"
            maxLength={200}
            value={form.productLine}
            onChange={(e) => set('productLine', e.target.value)}
          />
        </Row>
        <Row label="Interests" hint={`Up to ${INTERESTS_MAX}. Your AI looks for news on these.`}>
          <ChipEditor
            label="interest"
            values={form.interests}
            max={INTERESTS_MAX}
            maxLength={60}
            onChange={(v) => set('interests', v)}
          />
        </Row>
        <Row
          label="Shipped posts from"
          hint={`Folders your AI reads for "what I shipped". Only AIs on your computer can do this.`}
        >
          <ChipEditor
            label="folder"
            values={form.shippedFrom}
            max={SHIPPED_FROM_MAX}
            maxLength={80}
            onChange={(v) => set('shippedFrom', v)}
          />
        </Row>
        <Row label="Each day">
          <span className="flex flex-wrap items-center gap-2">
            <NumberField
              id={ids.posts}
              label="Posts each day"
              value={form.postsPerDay}
              onChange={(n) => set('postsPerDay', n)}
            />
            posts
          </span>
        </Row>
        <Row label="Channels">
          <span className="flex flex-wrap items-center gap-4">
            <Check label="X" checked={form.useX} onChange={(v) => set('useX', v)} />
            <Check label="LinkedIn" checked={form.useLinkedIn} onChange={(v) => set('useLinkedIn', v)} />
            <span className="text-xs text-text-tertiary">Connect or remove them on Connect.</span>
          </span>
        </Row>
        <Row label="Your style" hint="2 or 3 posts you wrote. Drafts copy their tone and length.">
          <StyleSamples values={form.styleSamples} onChange={(v) => set('styleSamples', v)} />
        </Row>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-1 md:px-0">
        <button type="submit" className="btn btn-primary" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button type="button" className="btn btn-plain" onClick={() => setForm(fieldsOf(profile))}>
            Cancel
          </button>
        )}
        {saved && !dirty && (
          <span role="status" className="text-[13px] text-ok">
            Saved
          </span>
        )}
        <ErrorText error={save.error && saveErrorText(save.error)} />
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      min={0}
      max={10}
      step={1}
      inputMode="numeric"
      className="field w-16 text-center tabular-nums md:h-[34px]"
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(10, Math.round(Number(e.target.value) || 0))))}
    />
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        className="size-4 accent-[var(--action-primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function ChipEditor({
  label,
  values,
  max,
  maxLength,
  onChange,
}: {
  label: string;
  values: string[];
  max: number;
  maxLength: number;
  onChange: (v: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  function add() {
    const value = text.trim();
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase()) && values.length < max)
      onChange([...values, value]);
    setText('');
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
          <button
            type="button"
            aria-label={`Remove ${value}`}
            className="inline-flex size-5 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-selected hover:text-text-primary"
            onClick={() => onChange(values.filter((v) => v !== value))}
          >
            <XIcon size={12} aria-hidden />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          aria-label={`New ${label}`}
          className="field h-7 w-44 rounded-full px-3 text-[13px] md:h-7"
          maxLength={maxLength}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Escape') {
              setText('');
              setAdding(false);
            }
          }}
        />
      ) : (
        values.length < max && (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] text-link shadow-[inset_0_0_0_1px_var(--border-default)]"
            onClick={() => setAdding(true)}
            aria-label={`Add ${label}`}
          >
            <Plus size={12} aria-hidden />
            Add
          </button>
        )
      )}
    </div>
  );
}

function StyleSamples({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const count = values.filter((v) => v.trim()).length;
  if (!open)
    return (
      <>
        <span>{count ? `${count} post${count === 1 ? '' : 's'} saved` : 'No posts saved yet'}</span>
        <span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
            Edit
          </button>
        </span>
      </>
    );
  return (
    <div className="flex flex-col gap-3">
      {values.map((value, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Post {i + 1}</span>
            <button
              type="button"
              className="btn btn-plain btn-sm"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
          <AutoTextarea
            aria-label={`Sample post ${i + 1}`}
            className="field"
            maxLength={STYLE_SAMPLE_LENGTH}
            value={value}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
          />
        </div>
      ))}
      <div className="flex gap-2">
        {values.length < STYLE_SAMPLES_MAX && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...values, ''])}>
            <Plus size={14} aria-hidden />
            Add a post
          </button>
        )}
        <button type="button" className="btn btn-plain btn-sm" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </div>
  );
}

function PhoneSignOut() {
  const signOut = useSignOut();
  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        className="panel min-h-[50px] w-full text-[17px] text-danger-text"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        Sign out
      </button>
      <ErrorText error={signOut.error} className="px-4" />
    </div>
  );
}
