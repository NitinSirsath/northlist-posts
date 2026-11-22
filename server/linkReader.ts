/**
 * Reads a pasted link once, when it is added to a space: its title and one line about it, so the user
 * never types them. GitHub links are read through GitHub's public API; a repo GitHub does not show is
 * private (or gone): the user's own AI reads it with its own GitHub access, so it is kept, marked private.
 *
 * Other pages are fetched with care: http(s) only, no private or local addresses (checked again on every
 * redirect), at most 3 redirects, 6 seconds and 512 KB. Nothing from the page is ever run.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import type { LinkKind } from '../shared/contracts.js';

export interface ReadLink {
  url: string;
  kind: LinkKind;
  title: string;
  description: string;
  isPrivate: boolean;
  readOk: boolean;
}

export interface ReaderDeps {
  fetch: typeof fetch;
  lookup: (host: string) => Promise<string[]>;
}

const defaultDeps: ReaderDeps = {
  fetch: (...args) => fetch(...args),
  lookup: async (host) => (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address),
};

let override: ReaderDeps | undefined;
/** Tests only: a fake web. */
export function setReaderDeps(deps: ReaderDeps | undefined) {
  override = deps;
}

const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TITLE_MAX = 160;
const LINE_MAX = 300;
const HEADERS = { 'User-Agent': 'NorthListPosts/1.0 (link preview)', Accept: 'text/html,application/xhtml+xml' };

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const v = address.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

async function isPublicHost(host: string, deps: ReaderDeps) {
  const bare = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) return !isPrivateAddress(bare);
  if (bare === 'localhost' || bare.endsWith('.localhost') || bare.endsWith('.local') || bare.endsWith('.internal'))
    return false;
  try {
    const addresses = await deps.lookup(bare);
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (text: string) =>
  text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (all, name: string) => {
      if (name[0] === '#') {
        const code = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
      }
      return ENTITIES[name.toLowerCase()] ?? all;
    })
    .replace(/\s+/g, ' ')
    .trim();

const clip = (text: string, max: number) => (text.length > max ? \`${text.slice(0, max - 1).trimEnd()}…\` : text);

function metaContent(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (content) return decode(content);
  }
  return '';
}

/** Title and one line from a page's HTML. */
export function pageFacts(html: string) {
  const title = metaContent(html, 'og:title') || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  return { title: clip(title, TITLE_MAX), description: clip(description, LINE_MAX) };
}

async function readBody(res: Response) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

async function fetchPage(url: string, deps: ReaderDeps) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!(await isPublicHost(parsed.hostname, deps))) return null;
    const res = await deps.fetch(current, {
      headers: HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return null;
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').includes('html')) return { title: '', description: '' };
    return pageFacts(await readBody(res));
  }
  return null;
}

/** GitHub: github.com/owner is a profile, github.com/owner/repo/... is a repo. */
export function githubParts(url: URL) {
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !/^[A-Za-z0-9-]{1,39}$/.test(owner)) return null;
  if (repo && /^[A-Za-z0-9._-]{1,100}$/.test(repo)) return { owner, repo: repo.replace(/\.git$/, '') };
  return repo ? null : { owner, repo: null };
}

async function readGitHub(owner: string, repo: string | null, deps: ReaderDeps): Promise<ReadLink> {
  const url = repo ? \`https://github.com/${owner}/${repo}\` : \`https://github.com/${owner}\`;
  const kind: LinkKind = repo ? 'GITHUB_REPO' : 'GITHUB_PROFILE';
  const api = repo ? \`https://api.github.com/repos/${owner}/${repo}\` : \`https://api.github.com/users/${owner}\`;
  try {
    const res = await deps.fetch(api, {
      headers: { 'User-Agent': HEADERS['User-Agent'], Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404 && repo) return { url, kind, title: repo, description: '', isPrivate: true, readOk: true };
    if (!res.ok) return { url, kind, title: repo ?? owner, description: '', isPrivate: false, readOk: false };
    const data = (await res.json()) as { name?: string; description?: string | null; bio?: string | null };
    return {
      url,
      kind,
      title: clip(repo ? (data.name ?? repo) : (data.name ?? owner), TITLE_MAX),
      description: clip((repo ? data.description : data.bio) ?? '', LINE_MAX),
      isPrivate: false,
      readOk: true,
    };
  } catch {
    return { url, kind, title: repo ?? owner, description: '', isPrivate: false, readOk: false };
  }
}

/** Reads one normalized http(s) link. Never throws: a page that cannot be read is kept with readOk false. */
export async function readLink(link: string, given?: ReaderDeps): Promise<ReadLink> {
  const deps = given ?? override ?? defaultDeps;
  const url = new URL(link);
  const gh = githubParts(url);
  if (gh) return readGitHub(gh.owner, gh.repo, deps);
  const kind: LinkKind = url.pathname === '/' || url.pathname === '' ? 'WEBSITE' : 'PAGE';
  const fallback = url.hostname.replace(/^www\./, '') + (kind === 'PAGE' ? url.pathname : '');
  try {
    const facts = await fetchPage(link, deps);
    if (!facts)
      return { url: link, kind, title: clip(fallback, TITLE_MAX), description: '', isPrivate: false, readOk: false };
    return {
      url: link,
      kind,
      title: facts.title || clip(fallback, TITLE_MAX),
      description: facts.description,
      isPrivate: false,
      readOk: true,
    };
  } catch {
    return { url: link, kind, title: clip(fallback, TITLE_MAX), description: '', isPrivate: false, readOk: false };
  }
}
