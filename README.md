# NorthList Posts

Your AI writes the posts. You pick, edit and post them to X and LinkedIn.

The user's own AI app (Claude Code, Codex, Antigravity) runs the [NorthList Posts kit](https://github.com/NitinSirsath/northlist-posts-kit). It reads the user's profile from this app over MCP, finds what they shipped and fresh news, writes the day's drafts and sends them here. This app shows them on **Today**; the user edits, adds one line of their own view, and taps **Post**. Each post waits 10 seconds with **Undo**, then goes out. Reply drafts are copied and posted by the user on X.

Private for now: only the emails in `OWNER_EMAIL` can sign in.

## Parts

- `server/`: Express 5 + Prisma (PostgreSQL). Google sign-in, profile, drafts, posting worker, short links, web push, and the MCP endpoint `/mcp` (tools `get_profile`, `get_recent_posts`, `save_profile`, `submit_drafts`).
- `web/`: React + Vite + Tailwind. Pages Today, Posted, Profile, Connect; phone layout under 768 px.
- `shared/contracts.ts`: shapes and limits used by both, and by the MCP tools.
- `prisma/`: schema and migrations.

## Run locally

Needs Node 22.22+ or 24.15+ and PostgreSQL.

```
cp .env.example .env        # set DATABASE_URL and OWNER_EMAIL
npm ci
npx prisma migrate dev
npm run dev                 # server on PORT (3590), web on WEB_PORT (5590)
```

With `DEV_LOGIN=1` the sign-in page has a dev sign-in for an `OWNER_EMAIL` address, and with `FAKE_SOCIAL=1` X and LinkedIn are fake (nothing is posted; a text with `[fail]` fails on purpose). Both are refused when `NODE_ENV=production`.

Tests: `npm test` (server tests need a database whose name ends in `_test`; set `TEST_DATABASE_URL`; the default is `postgres:postgres@localhost:5432/northlist_posts_test`, as in CI). Also `npm run typecheck` and `npm run build`.

## Deploy

See [docs/setup.md](docs/setup.md): Render web service, Supabase database, Google, X and LinkedIn apps, and the settings list.

## Safety

- X and LinkedIn tokens are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`) and never sent to the browser or the AI.
- MCP tokens are stored as SHA-256 only, shown once, revocable, one year by default.
- Nothing posts without a Post request from the signed-in owner; every post waits 10 seconds for Undo.
- `/mcp` checks the Host header, refuses browser origins and has its own request limits; state changes in `/api` need JSON (CSRF guard) and a session cookie (`SameSite=Lax`, `HttpOnly`).
