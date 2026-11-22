/** Small shared pieces: page frame, section headings, messages. */
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { errorMessage } from '../api';

export function Page({
  title,
  subtitle,
  aside,
  phoneBar,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  /** Phone only: the glass buttons above the title (back, avatar). */
  phoneBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'mx-auto flex w-full max-w-[1088px] flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] md:px-8 md:pt-8 md:pb-12',
        !phoneBar && 'pt-[calc(env(safe-area-inset-top)+20px)]',
      )}
    >
      {phoneBar && (
        <div className="sticky top-0 z-10 -mb-2 flex h-[calc(env(safe-area-inset-top)+54px)] items-end justify-between pb-1 md:hidden">
          {phoneBar}
        </div>
      )}
      <header className="flex flex-col gap-1 md:mb-2 md:flex-row md:items-end md:justify-between md:gap-4">
        <div>
          <h1 className="mx-1 text-[34px] leading-[41px] font-bold md:mx-0 md:mb-1 md:text-[28px] md:leading-9 md:font-semibold md:tracking-[-0.02em]">
            {title}
          </h1>
          {subtitle && <p className="mx-1 text-[15px] text-text-secondary md:mx-0 md:text-sm">{subtitle}</p>}
        </div>
        {aside && (
          <div className="mx-1 flex items-center gap-3 text-[13px] text-text-secondary md:mx-0 md:text-xs">{aside}</div>
        )}
      </header>
      {children}
    </div>
  );
}

export function SectionHeading({ icon: Icon, title, note }: { icon?: LucideIcon; title: string; note?: ReactNode }) {
  return (
    <div className="mt-4 flex items-baseline gap-2 px-1 md:mt-5 md:gap-2.5 md:px-0">
      <h2 className="flex items-center gap-2 text-[17px] leading-[22px] font-semibold md:text-base">
        {Icon && <Icon size={16} className="hidden text-text-tertiary md:block" aria-hidden />}
        {title}
      </h2>
      {note !== undefined && <span className="text-[15px] text-text-tertiary md:text-[13px]">{note}</span>}
    </div>
  );
}

export function ErrorText({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={clsx('text-[13px] text-danger-text', className)}>
      {errorMessage(error)}
    </p>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="panel animate-pulse px-6 py-10 text-center text-text-tertiary">
      {label}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-10 text-center">
      <ErrorText error={error} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-avatar font-semibold text-avatar-text"
      style={{ width: size, height: size, fontSize: size * 0.43 }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-[15px] font-[650]">
      {/* The NorthList mark (a half sun over a list), in its brand blue: the one blue left. */}
      <svg width={22} height={22} viewBox="2 2 28 28" aria-hidden className="shrink-0 fill-mark">
        <path d="M2 16A14 14 0 0 1 30 16ZM2.144 18H22A2 2 0 0 1 22 22H3.351A14 14 0 0 1 2.144 18ZM4.511 24H15.5A2 2 0 0 1 15.5 28H8.789A14 14 0 0 1 4.511 24Z" />
      </svg>
      NorthList Posts
    </span>
  );
}

/** A textarea that grows with its text. */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={3} {...props} />;
}
