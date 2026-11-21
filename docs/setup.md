# Going live

What the owner sets up once, in this order. Nothing here is needed for local runs.

## 1. Database (Supabase, free)

1. New project, region near the Render service.
2. Copy the **session pooler** connection string (port 5432) into Render as `DATABASE_URL`.

## 2. Render web service

- Repo: `northlist-posts`, branch `main`, runtime Node.
- Build command: `npm ci --include=dev && npm run build` (with `NODE_ENV=production`, plain `npm ci` would skip the build tools)
- Start command: `npx prisma migrate deploy && npm start`
- Health check path: `/health`
- Custom domain: `posts.northlist.site` (Namecheap: a CNAME `posts` → the Render address).

Settings (Environment):

| Name                                                     | Value                                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                               | `production`                                                                                                            |
| `PUBLIC_URL`                                             | `https://posts.northlist.site`                                                                                          |
| `DATABASE_URL`                                           | from Supabase                                                                                                           |
| `OWNER_EMAIL`                                            | your Google email                                                                                                       |
| `ENCRYPTION_KEY`                                         | 32 random bytes, base64 (`openssl rand -base64 32`). Never change it later: connected accounts would need reconnecting. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`               | step 3                                                                                                                  |
| `X_CLIENT_ID`, `X_CLIENT_SECRET`                         | step 4                                                                                                                  |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`           | step 5                                                                                                                  |
| `LINKEDIN_API_VERSION`                                   | `202611` (supported until Nov 2027; LinkedIn retires each version after about a year, then move it forward)             |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`; subject `mailto:` your email. Optional: without them alerts are off.                |
| `KIT_URL`                                                | `https://github.com/NitinSirsath/northlist-posts-kit`                                                                   |

Never set `DEV_LOGIN` or `FAKE_SOCIAL` on Render: the app refuses to start with them in production.

## 3. Google sign-in

Google Cloud console › APIs & Services › Credentials › OAuth client ID (Web application).

- Authorized redirect URI: `https://posts.northlist.site/api/auth/google/callback`
- Scopes used: `openid`, `email`, `profile` only (no Gmail), so no Google verification is needed.

## 4. X

developer.x.com › a Project and App › User authentication settings:

- App permissions: Read and write. Type: Web App (confidential client).
- Callback URI: `https://posts.northlist.site/api/connect/x/callback`
- Website: `https://posts.northlist.site`
- Copy the OAuth 2.0 Client ID and Client Secret.
- Add credit for posting (X's pay-per-use API). Check X's current price per post first.

## 5. LinkedIn

linkedin.com/developers › Create app (it needs a LinkedIn company page; NorthList's is fine).

- Products: **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
- Auth › Redirect URL: `https://posts.northlist.site/api/connect/linkedin/callback`
- Copy the Client ID and Client Secret.
- LinkedIn sign-ins last about 60 days; the app warns 14 days ahead and you tap Reconnect.

## 6. First run

1. Open `https://posts.northlist.site`, sign in with Google.
2. Connect: connect X and LinkedIn, then create a setup prompt.
3. Get the kit, open it in your AI app, paste the setup prompt. Answer the setup questions.
4. Type `daily`. Post from Today.
