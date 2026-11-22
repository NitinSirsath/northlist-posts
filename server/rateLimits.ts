/**
 * Request limits, counted in this server's memory (one server). Over a limit the answer is 429.
 * `RATE_LIMITS=off` turns them off (tests).
 */
import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';

const MINUTE_MS = 60_000;
export const SIGN_IN_PER_MINUTE = 20;
export const API_PER_MINUTE = 600;
export const LINK_PER_MINUTE = 120;
/** Pasted links we fetch to read their title (each one is a request to another site). */
export const LINK_READS_PER_MINUTE = 20;
export const MCP_ADDRESS_PER_MINUTE = 120;
export const MCP_TOKEN_PER_MINUTE = 60;

export const addressKey = (req: Request) => `address:${ipKeyGenerator(req.ip ?? '')}`;

const tooMany = (_req: Request, res: Response) =>
  res
    .status(429)
    .json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Wait a minute and try again.' } });

export function limiter(
  options: Pick<Options, 'limit'> & {
    keyGenerator?: Options['keyGenerator'];
    refuse?: (req: Request, res: Response) => void;
  },
) {
  return rateLimit({
    windowMs: MINUTE_MS,
    limit: options.limit,
    keyGenerator: options.keyGenerator ?? addressKey,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => process.env.RATE_LIMITS === 'off',
    handler: (req, res) => (options.refuse ?? tooMany)(req, res),
  });
}
