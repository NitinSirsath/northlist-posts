import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logEvent } from './log.js';

/** An error the user may see: a status, a stable code and a plain message. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Field names of a validation error, never the values. */
export const fieldsOf = (err: ZodError) => [...new Set(err.issues.map((issue) => issue.path.join('.') || '(root)'))];

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (err instanceof ZodError)
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Some fields are not valid.', fields: fieldsOf(err) },
    });
  const type = (err as { type?: unknown })?.type;
  if (type === 'entity.parse.failed' || type === 'entity.too.large')
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request.' } });
  logEvent('request_failed', { errorCategory: err instanceof Error ? err.name : 'UnknownError' });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } });
}
