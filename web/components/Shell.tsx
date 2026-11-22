/** The signed-in frame: side menu on the laptop, glass tab bar on the phone. */
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import { LayoutGrid, LogOut, Plug, Send, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MeView } from '../../shared/contracts';
import { useIsPhone } from '../lib/hooks';
import { useCurrentSpace, useSignOut } from '../queries';
import { SideSwitcher } from './SpaceSwitcher';
import { Avatar, ErrorText } from './ui';

type Path = '/' | '/posted' | '/space' | '/connect';
const NAV: { to: Path; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/posted', label: 'Posted', icon: Send },
  { to: '/space', label: 'Space', icon: LayoutGrid },
  { to: '/connect', label: 'Connect', icon: Plug }
];

const titleOf = (path: string) =>
  path.startsWith('/post/') ? 'Today' : (NAV.find((n) => n.to !== '/' && path.startsWith(n.to))?.label ?? 'Today');

export function Shell({ me }: { me: MeView }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const phone = useIsPhone();
  if (phone)
    return (
      <>
        <main>
          <Outlet />
        </main>
        {!path.startsWith('/post/') && <TabBar />}
      </>
    );
  return (
    <div className="flex h-dvh">
      <SideMenu me={me} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle px-8 text-[13px]">
          <b className="font-medium text-text-primary">{titleOf(path)}</b>
        </div>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideMenu({ me }: { me: MeView }) {
  const count = useCurrentSpace().space?.newDrafts;
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-border-subtle">
      <SideSwitcher />
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-2 py-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="group flex h-[34px] items-center gap-2.5 rounded-full px-3 text-sm text-text-secondary hover:bg-canvas-hover data-[status=active]:bg-nav-active data-[status=active]:font-medium data-[status=active]:text-text-primary"
          >
            <Icon size={16} className="text-text-tertiary group-data-[status=active]:text-text-primary" aria-hidden />
            {label}
            {to === '/' && count !== undefined && count > 0 && (
              <span className="ml-auto text-xs text-text-tertiary tabular-nums" aria-label={`${count} ideas`}>
                {count}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <UserMenu me={me} />
    </aside>
  );
}

function UserMenu({ me }: { me: MeView }) {
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
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

  return (
    <div ref={box} className="relative mt-auto border-t border-border-subtle">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-2 bottom-full left-2 mb-1 rounded-xl bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/0.16),inset_0_0_0_1px_var(--border-default)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-canvas-hover"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            <LogOut size={16} className="text-text-secondary" aria-hidden />
            Sign out
          </button>
          <ErrorText error={signOut.error} className="px-3 pb-2" />
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-[13px] leading-[17px] hover:bg-canvas-hover"
      >
        <Avatar name={me.name || me.email} />
        <span className="min-w-0">
          <span className="block truncate">{me.name || me.email}</span>
          <small className="block truncate text-xs text-text-tertiary">{me.email}</small>
        </span>
      </button>
    </div>
  );
}

function TabBar() {
  return (
    <nav
      aria-label="Tabs"
      className="glass fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-20 grid h-[62px] grid-cols-4 rounded-full p-1"
    >
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === '/' }}
          className={clsx(
            'flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium text-text-secondary',
            'data-[status=active]:bg-[rgb(127_127_127/0.14)] data-[status=active]:text-link',
          )}
        >
          <Icon size={22} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
