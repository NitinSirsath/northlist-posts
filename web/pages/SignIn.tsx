/** Sign in with Google. Only the owner can get in for now. */
import { TriangleAlert } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorText, Logo } from '../components/ui';

const ERRORS: Record<string, string> = {
  private: 'This app is private.',
  expired: 'That took too long. Try again.',
  google: 'Google sign-in did not work. Try again.',
};

export function SignInPage({ error }: { error?: string }) {
  const message = error ? (ERRORS[error] ?? ERRORS.google) : null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-4 text-center">
        <Logo />
        <h1 className="mt-2 text-[28px] leading-9 font-semibold tracking-[-0.02em]">Sign in</h1>
        <p className="leading-[21px] text-text-secondary">
          Your AI writes the drafts. You pick them, add your take and post to X and LinkedIn.
        </p>
        {message && (
          <div role="alert" className="tag-yellow flex w-full gap-2.5 rounded-xl px-3.5 py-3 text-left leading-5">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{message}</span>
          </div>
        )}
        <a href="/api/auth/google" className="btn btn-secondary h-11 w-full text-[15px]">
          <span
            aria-hidden
            className="inline-flex size-[18px] items-center justify-center rounded-full text-[11px] font-bold shadow-[inset_0_0_0_1.5px_var(--text-secondary)]"
          >
            G
          </span>
          Continue with Google
        </a>
        {import.meta.env.DEV && <DevSignIn />}
      </div>
    </main>
  );
}

/** Vite dev only: sign in as an owner email without Google (the server must have DEV_LOGIN=1). */
function DevSignIn() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/dev-login', 'POST', { email: email.trim() });
      window.location.assign('/');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-4 flex w-full flex-col gap-2 text-left">
      <label htmlFor={id} className="text-xs text-text-tertiary">
        Dev sign-in
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="email"
          required
          className="field"
          placeholder="owner@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost" disabled={busy}>
          Sign in
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
