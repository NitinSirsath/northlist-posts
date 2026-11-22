/**
 * The space switcher (owner, 22 Nov 2026): top of the side menu on the laptop, the page title on the phone.
 * One space at a time; each shows how many new drafts wait in it. "New space" runs the first-run steps again.
 */
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Check, ChevronDown, Plus, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SpaceView } from '../../shared/contracts';
import { setCurrentSpace } from '../lib/space';
import { useCurrentSpace } from '../queries';
import { SpaceAvatar } from './spaceParts';

function useMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, box };
}

function MenuItems({
  spaces,
  current,
  onDone,
  big,
}: {
  spaces: SpaceView[];
  current?: SpaceView;
  onDone: () => void;
  big?: boolean;
}) {
  const navigate = useNavigate();
  const row = clsx(
    'flex w-full items-center gap-2.5 text-left hover:bg-canvas-hover',
    big ? 'rounded-[14px] px-3.5 py-3 text-base' : 'h-10 rounded-lg px-2.5 text-sm',
  );
  return (
    <>
      <p className={clsx('text-text-tertiary', big ? 'px-3.5 pb-1.5 text-[13px]' : 'px-2.5 py-1.5 text-xs')}>Spaces</p>
      {spaces.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="menuitemradio"
          aria-checked={s.id === current?.id}
          className={row}
          onClick={() => {
            setCurrentSpace(s.id);
            onDone();
          }}
        >
          <SpaceAvatar name={s.name} size={big ? 30 : 24} muted={i > 0 && s.id !== current?.id} />
          <span className="min-w-0 flex-1 truncate">{s.name}</span>
          {s.newDrafts > 0 && <span className="text-xs text-text-tertiary tabular-nums">{s.newDrafts} new</span>}
          {s.id === current?.id && <Check size={15} aria-hidden className="text-text-secondary" />}
        </button>
      ))}
      <hr className="mx-1 my-1.5 border-border-subtle" />
      <button
        type="button"
        role="menuitem"
        className={row}
        onClick={() => {
          sessionStorage.removeItem('nlp.newSpace');
          onDone();
          void navigate({ to: '/welcome', search: { new: 1 } });
        }}
      >
        <Plus size={16} aria-hidden className="text-text-secondary" /> New space
      </button>
      <button
        type="button"
        role="menuitem"
        className={row}
        onClick={() => {
          onDone();
          void navigate({ to: '/space', search: {} });
        }}
      >
        <Settings2 size={16} aria-hidden className="text-text-secondary" /> Space settings
      </button>
    </>
  );
}

/** Laptop: the row at the top of the side menu, with a menu that grows from it. */
export function SideSwitcher() {
  const { space, spaces } = useCurrentSpace();
  const { open, setOpen, box } = useMenu();
  return (
    <div ref={box} className="relative px-2 pt-2.5">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-nav-active',
          open && 'bg-nav-active',
        )}
      >
        <SpaceAvatar name={space?.name ?? '…'} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px] font-[650]">{space?.name ?? '…'}</b>
          <small className="block text-xs text-text-tertiary">Space</small>
        </span>
        <ChevronDown size={16} aria-hidden className="text-text-tertiary" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Spaces"
          className="pop-in absolute top-full right-0 left-2 z-30 mt-1 w-[272px] origin-top-left rounded-[14px] bg-surface p-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.18),inset_0_0_0_1px_var(--border-default)]"
        >
          <MenuItems spaces={spaces.data ?? []} current={space} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Phone: the page title is the space's name; tapping it opens a sheet with the spaces. */
export function TitleSwitcher() {
  const { space, spaces } = useCurrentSpace();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-left"
      >
        <span className="truncate">{space?.name ?? 'Today'}</span>
        <ChevronDown size={22} aria-hidden className="mt-1 shrink-0 text-text-tertiary" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label="Spaces"
            className="sheet-up absolute inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8px)] rounded-[38px] bg-surface px-2.5 pt-4 pb-6 shadow-[0_-10px_40px_rgb(0_0_0/0.25)]"
          >
            <span aria-hidden className="mx-auto mb-3 block h-[5px] w-9 rounded-full bg-border-default" />
            <MenuItems spaces={spaces.data ?? []} current={space} onDone={() => setOpen(false)} big />
          </div>
        </div>
      )}
    </>
  );
}
