import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response, Router } from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import type { MeView } from '../shared/contracts.js';
import { devLogin, googleCallback, googleStart, requireUser, signOut, userOf } from './auth.js';
import { config } from './config.js';
import { connectCallback, connectStart, listConnections, removeConnection } from './connections.js';
import { AppError, errorHandler } from './errors.js';
import { editIdea, listToday, markCopied, skipIdea } from './ideas.js';
import { createMcpRouter } from './mcp/router.js';
import { followShortLink, postedSummary } from './posted.js';
import { requestPost, undoPost } from './posting.js';
import { getProfile, saveProfile } from './profile.js';
import { subscribe, unsubscribe } from './push.js';
import { API_PER_MINUTE, LINK_PER_MINUTE, SIGN_IN_PER_MINUTE, limiter } from './rateLimits.js';
import { createToken, listTokens, revokeToken } from './tokens.js';

type Handler = (req: Request, res: Response) => Promise<unknown>;
/** Express 5 passes rejected promises to the error handler; this also sends the JSON result. */
const json =
  (fn: (req: Request, res: Response) => Promise<unknown>): Handler =>
  async (req, res) => {
    res.json(await fn(req, res));
  };
const id = (req: Request) => String(req.params.id);

/** Cookies are SameSite=Lax; changes also need a JSON body, which a form on another site cannot send. */
function jsonOnlyForChanges(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (!req.is('application/json')) return next(new AppError(415, 'JSON_ONLY', 'Send JSON.'));
  next();
}

function apiRouter() {
  const api = Router();
  const signInLimit = limiter({ limit: SIGN_IN_PER_MINUTE });

  api.get('/auth/google', signInLimit, googleStart);
  api.get('/auth/google/callback', signInLimit, googleCallback);

  api.use(express.json({ limit: '64kb' }));
  api.use(jsonOnlyForChanges);
  api.post('/auth/dev-login', signInLimit, devLogin);
  api.post('/auth/sign-out', signOut);

  api.use(requireUser);
  api.use(limiter({ limit: API_PER_MINUTE, keyGenerator: (_req, res) => `user:${userOf(res).id}` }));

  api.get(
    '/me',
    json(async (_req, res) => {
      const c = config();
      const me: MeView = {
        ...userOf(res),
        mcpUrl: `${c.publicUrl}/mcp`,
        kitUrl: c.kitUrl,
        vapidPublicKey: c.vapid?.publicKey ?? null,
        fakeSocial: c.fakeSocial,
      };
      return me;
    }),
  );

  api.get(
    '/ideas/today',
    json((_req, res) => listToday(userOf(res).id)),
  );
  api.patch(
    '/ideas/:id',
    json((req, res) => editIdea(userOf(res).id, id(req), req.body)),
  );
  api.post(
    '/ideas/:id/skip',
    json((req, res) => skipIdea(userOf(res).id, id(req))),
  );
  api.post(
    '/ideas/:id/copied',
    json((req, res) => markCopied(userOf(res).id, id(req))),
  );
  api.post(
    '/ideas/:id/post',
    json((req, res) => requestPost(userOf(res).id, id(req), req.body)),
  );
  api.post(
    '/posts/:id/undo',
    json((req, res) => undoPost(userOf(res).id, id(req))),
  );
  api.get(
    '/posted',
    json((_req, res) => postedSummary(userOf(res).id)),
  );

  api.get(
    '/profile',
    json((_req, res) => getProfile(userOf(res).id)),
  );
  api.put(
    '/profile',
    json((req, res) => saveProfile(userOf(res).id, req.body, 'you')),
  );

  api.get(
    '/connections',
    json((_req, res) => listConnections(userOf(res).id)),
  );
  api.get('/connect/:channel/start', connectStart);
  api.get('/connect/:channel/callback', connectCallback);
  api.delete(
    '/connections/:channel',
    json((req, res) => removeConnection(userOf(res).id, req.params.channel)),
  );

  api.get(
    '/tokens',
    json((_req, res) => listTokens(userOf(res).id)),
  );
  api.post(
    '/tokens',
    json((req, res) => createToken(userOf(res).id, req.body)),
  );
  api.post(
    '/tokens/:id/revoke',
    json((req, res) => revokeToken(userOf(res).id, id(req))),
  );

  api.post(
    '/alerts/subscribe',
    json((req, res) => subscribe(userOf(res).id, req.body)),
  );
  api.post(
    '/alerts/unsubscribe',
    json((req, res) => unsubscribe(userOf(res).id, req.body)),
  );

  api.use(() => {
    throw new AppError(404, 'NOT_FOUND', 'Not found.');
  });
  return api;
}

export function createApp(webDir = path.resolve('dist/web')) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Before every other middleware: /mcp has its own body limit, auth and errors.
  app.use('/mcp', createMcpRouter());

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
    }),
  );
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/r/:code', limiter({ limit: LINK_PER_MINUTE }), async (req, res) => {
    const target = await followShortLink(String(req.params.code));
    res.set('Cache-Control', 'no-store');
    res.redirect(302, target ?? '/');
  });

  app.use('/api', apiRouter());

  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir, { index: false, maxAge: '1h' }));
    // Every other path is a page of the web app.
    app.get(/^(?!\/(api|mcp|r)\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
