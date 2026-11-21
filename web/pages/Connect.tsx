/** Connect: get the kit, connect your AI with a token, connect X and LinkedIn, and alerts. */
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Bell, Check, Copy, ExternalLink, X as XIcon } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  RECONNECT_WARNING_DAYS,
  type Channel,
  type ConnectionView,
  type IntegrationTokenView,
  type MeView,
} from '../../shared/contracts';
import { errorMessage } from '../api';
import { ErrorText, Page, SectionHeading } from '../components/ui';
import { alertsSupported, currentSubscription, turnAlertsOff, turnAlertsOn } from '../lib/alerts';
import { copyText, useCopy } from '../lib/clipboard';
import { channelName, shortDate, when } from '../lib/format';
import { useFlash } from '../lib/hooks';
import { useConnections, useCreateToken, useDisconnect, useMe, useRevokeToken, useTokens } from '../queries';

export interface ConnectSearch {
  channel?: string;
  /** 1 after a channel was connected. */
  connected?: number;
  error?: string;
}

export function setupPrompt({ mcpUrl, kitUrl, token }: { mcpUrl: string; kitUrl: string; token: string }) {
  return [
    'Connect NorthList Posts to this AI app, then set up my profile.',
    \`Server: \${mcpUrl}\`,
    \`Token: \${token}\`,
    \`1. Work in the NorthList Posts kit folder. If you are not in it, get it first: \${kitUrl}\`,
    '2. Follow instructions/connect.md in the kit to add the server with this token. Never write the token into the kit folder or any file in it.',
    '3. Then follow instructions/setup.md and ask me the setup questions.',
  ].join('\\n');
}

function bannerText(search: ConnectSearch) {
  const name = search.channel === 'linkedin' ? 'LinkedIn' : search.channel === 'x' ? 'X' : 'The account';
  if (search.connected === 1) return { ok: true, text: \`\${name} is connected.\` };
  if (search.error === 'expired') return { ok: false, text: 'That took too long. Try again.' };
  if (search.error === 'denied')
    return { ok: false, text: \`\${name} was not allowed. Try again if you meant to connect.\` };
  if (search.error) return { ok: false, text: \`Could not connect \${name}. Try again.\` };
  return null;
}

export function ConnectPage({ search }: { search: ConnectSearch }) {
  const me = useMe();
  const tokens = useTokens();
  const hasToken = (tokens.data ?? []).some((t) => t.status === 'active');
  return (
    <Page title="Connect" subtitle="Your AI writes the drafts. These steps link it to this app, once.">
      <Banner search={search} />
      {me.data && (
        <>
          <ol className="panel rows flex flex-col" aria-label="Steps">
            <Step n={1} done={hasToken} title="Get the kit" right={<KitLink url={me.data.kitUrl} />}>
              <p>A folder of instruction files. Open it in your AI app (Claude Code, Codex or Antigravity).</p>
            </Step>
            <ConnectAiStep me={me.data} tokens={tokens.data ?? []} done={hasToken} tokensError={tokens.error} />
            <Step n={3} title="Each morning">
              <p>
                Type <code>daily</code> in your AI. If your AI app can run scheduled tasks, set it there once and skip
                this.
              </p>
            </Step>
          </ol>
          <WherePostsGo fake={me.data.fakeSocial} />
          <Alerts vapidPublicKey={me.data.vapidPublicKey} />
        </>
      )}
      <ErrorText error={me.error} />
    </Page>
  );
}

function Banner({ search }: { search: ConnectSearch }) {
  const navigate = useNavigate();
  const banner = bannerText(search);
  if (!banner) return null;
  return (
    <div
      role="status"
      className={clsx(
        'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px]',
        banner.ok ? 'tag-green' : 'tag-yellow',
      )}
    >
      {banner.ok && <Check size={16} aria-hidden />}
      <span className="flex-1">{banner.text}</span>
      <button
        type="button"
        aria-label="Close"
        className="inline-flex size-6 items-center justify-center rounded-full"
        onClick={() => void navigate({ to: '/connect', search: {}, replace: true })}
      >
        <XIcon size={14} aria-hidden />
      </button>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  right,
  children,
}: {
  n: number;
  done?: boolean;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[28px_1fr] items-start gap-3.5 px-4 py-4 md:grid-cols-[28px_1fr_auto] md:px-6 md:py-[18px]">
      <span
        aria-label={done ? 'Done' : \`Step \${n}\`}
        className={clsx(
          'inline-flex size-[26px] items-center justify-center rounded-full text-[13px] font-semibold',
          done ? 'bg-ok text-white' : 'text-text-secondary shadow-[inset_0_0_0_1px_var(--border-default)]',
        )}
      >
        {done ? <Check size={14} strokeWidth={3} aria-hidden /> : n}
      </span>
      <div className="min-w-0 leading-5 text-text-secondary [&_b]:text-text-primary">
        <b className="mb-1 block font-semibold">{title}</b>
        {children}
      </div>
      {right && <div className="col-start-2 flex gap-2 md:col-start-auto">{right}</div>}
    </li>
  );
}

function KitLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
      <ExternalLink size={14} aria-hidden />
      Open on GitHub
    </a>
  );
}

function ConnectAiStep({
  me,
  tokens,
  done,
  tokensError,
}: {
  me: MeView;
  tokens: IntegrationTokenView[];
  done: boolean;
  tokensError: unknown;
}) {
  const nameId = useId();
  const [name, setName] = useState('Claude Code');
  const create = useCreateToken();
  const [created, setCreated] = useState<{ prompt: string; token: string } | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  function onCreate() {
    setCopyNote(null);
    create.mutate(name.trim() || 'Claude Code', {
      onSuccess: async ({ plaintext }) => {
        const prompt = setupPrompt({ mcpUrl: me.mcpUrl, kitUrl: me.kitUrl, token: plaintext });
        setCreated({ prompt, token: plaintext });
        try {
          await copyText(prompt);
          setCopyNote('Setup prompt copied. Paste it into your AI.');
        } catch {
          setCopyNote('Copy the setup prompt below and paste it into your AI.');
        }
      },
    });
  }

  return (
    <Step n={2} done={done} title="Connect your AI">
      <p>
        Copy the setup prompt and paste it into your AI. It connects itself, then asks you a few questions for your
        profile.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label htmlFor={nameId} className="sr-only">
          Name of your AI app
        </label>
        <input
          id={nameId}
          className="field max-w-60"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCreate}
          disabled={create.isPending || !name.trim()}
        >
          <Copy size={14} aria-hidden />
          Create and copy setup prompt
        </button>
      </div>
      <ErrorText error={create.error} className="mt-2" />
      {created && <SetupBox prompt={created.prompt} token={created.token} note={copyNote} />}
      <TokenList tokens={tokens} />
      <ErrorText error={tokensError} className="mt-2" />
    </Step>
  );
}

function SetupBox({ prompt, token, note }: { prompt: string; token: string; note: string | null }) {
  const copy = useCopy();
  const [promptCopied, flashPrompt] = useFlash();
  const [tokenCopied, flashToken] = useFlash();
  return (
    <div className="mt-3 flex flex-col gap-2">
      {note && (
        <p role="status" className="text-[13px] text-text-primary">
          {note}
        </p>
      )}
      <pre
        aria-label="Setup prompt"
        className="overflow-x-auto rounded-[10px] bg-surface-selected px-3 py-2.5 font-mono text-xs leading-[18px] whitespace-pre-wrap text-text-primary"
      >
        {prompt}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy.run(prompt, flashPrompt)}>
          <Copy size={14} aria-hidden />
          {promptCopied ? 'Copied' : 'Copy setup prompt'}
        </button>
        <button type="button" className="btn btn-plain btn-sm" onClick={() => void copy.run(token, flashToken)}>
          {tokenCopied ? 'Copied' : 'Copy token'}
        </button>
        <span className="text-xs text-text-tertiary">Shown once. Revoke it here if it leaks.</span>
      </div>
      <ErrorText error={copy.error} />
    </div>
  );
}

function TokenList({ tokens }: { tokens: IntegrationTokenView[] }) {
  const revoke = useRevokeToken();
  if (!tokens.length) return null;
  return (
    <>
      <ul className="mt-2 flex flex-col" aria-label="AI connections">
        {tokens.map((t) => {
          const off = t.status !== 'active';
          return (
            <li
              key={t.id}
              className={clsx(
                'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 pt-2.5 text-[13px] md:grid-cols-[1fr_160px_160px_80px]',
                off && 'opacity-55',
              )}
            >
              <span className="text-text-primary">{t.name}</span>
              <span className="order-last text-text-secondary md:order-none">Created {shortDate(t.createdAt)}</span>
              <span className="order-last text-text-secondary md:order-none">
                {t.lastUsedAt ? \`Last used \${when(t.lastUsedAt)}\` : 'Not used yet'}
              </span>
              <span className="row-start-1 text-right md:row-auto">
                {off ? (
                  <span className="text-text-tertiary">{t.status === 'revoked' ? 'Revoked' : 'Expired'}</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-plain btn-sm"
                    onClick={() => revoke.mutate(t.id)}
                    disabled={revoke.isPending}
                    aria-label={\`Revoke \${t.name}\`}
                  >
                    Revoke
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <ErrorText error={revoke.error} className="mt-2" />
    </>
  );
}

const CHANNELS: Channel[] = ['X', 'LINKEDIN'];
const startUrl = (channel: Channel) => \`/api/connect/\${channel === 'X' ? 'x' : 'linkedin'}/start\`;

function WherePostsGo({ fake }: { fake: boolean }) {
  const connections = useConnections();
  const disconnect = useDisconnect();
  return (
    <section aria-label="Where posts go" className="flex flex-col gap-4">
      <SectionHeading title="Where posts go" note={fake ? 'Test mode: X and LinkedIn are fake' : undefined} />
      <div className="panel rows">
        {CHANNELS.map((channel) => (
          <ChannelRow
            key={channel}
            channel={channel}
            connection={connections.data?.find((c) => c.channel === channel)}
            loading={connections.isPending}
            onDisconnect={() => disconnect.mutate(channel)}
            disconnecting={disconnect.isPending && disconnect.variables === channel}
          />
        ))}
      </div>
      <ErrorText error={connections.error ?? disconnect.error} />
    </section>
  );
}

function ChannelRow({
  channel,
  connection,
  loading,
  onDisconnect,
  disconnecting,
}: {
  channel: Channel;
  connection?: ConnectionView;
  loading: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const name = channelName(channel);
  const days = connection?.expiresInDays;
  const expiring = channel === 'LINKEDIN' && days !== null && days !== undefined && days <= RECONNECT_WARNING_DAYS;
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-3 px-4 py-3 text-sm md:px-6">
      <span className="flex flex-wrap items-center gap-2">
        {connection && !expiring && <span aria-hidden className="inline-block size-[7px] rounded-full bg-ok" />}
        <span>
          {name} · {loading ? '…' : connection ? connection.accountName : 'Not connected'}
        </span>
        {expiring && (
          <span className="tag tag-yellow">
            {days === 0 ? 'Reconnect today' : \`Reconnect in \${days} day\${days === 1 ? '' : 's'}\`}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1">
        {connection ? (
          <>
            {expiring && (
              <a href={startUrl(channel)} className="btn btn-ghost btn-sm">
                Reconnect
              </a>
            )}
            <button
              type="button"
              className="btn btn-plain btn-sm"
              onClick={onDisconnect}
              disabled={disconnecting}
              aria-label={\`Disconnect \${name}\`}
            >
              Disconnect
            </button>
          </>
        ) : (
          !loading && (
            <a href={startUrl(channel)} className="btn btn-secondary btn-sm">
              Connect {name}
            </a>
          )
        )}
      </span>
    </div>
  );
}

function Alerts({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const supported = alertsSupported();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidPublicKey || !supported) return;
    let live = true;
    currentSubscription()
      .then((sub) => live && setOn(Boolean(sub)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [vapidPublicKey, supported]);

  async function change(next: boolean) {
    if (!vapidPublicKey || next === on) return;
    setBusy(true);
    setError(null);
    try {
      if (next) await turnAlertsOn(vapidPublicKey);
      else await turnAlertsOff();
      setOn(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const off = !vapidPublicKey || !supported;
  const note = !vapidPublicKey
    ? 'Alerts are not set up on the server yet.'
    : !supported
      ? 'This browser cannot show alerts. On iPhone, add this app to your Home Screen first.'
      : null;

  return (
    <section aria-label="Alerts" className="flex flex-col gap-4">
      <SectionHeading title="Alerts" />
      <div className="panel">
        <div className="flex min-h-[54px] items-center justify-between gap-3 px-4 py-3 text-sm md:px-6">
          <span className="flex items-center gap-2.5">
            <Bell size={16} className="shrink-0 text-text-secondary" aria-hidden />
            <span>
              Tell me when new drafts arrive
              {note && <span className="block text-xs text-text-tertiary">{note}</span>}
            </span>
          </span>
          <div role="radiogroup" aria-label="Alerts" className="seg">
            <button
              type="button"
              role="radio"
              aria-checked={on && !off}
              disabled={off || busy}
              onClick={() => void change(true)}
            >
              On
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!on || off}
              disabled={off || busy}
              onClick={() => void change(false)}
            >
              Off
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-1 text-[13px] text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}
