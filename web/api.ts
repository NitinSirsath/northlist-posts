/** Thin fetch helper for the app's JSON API (cookie session, same origin). */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: string[] };
}

/** Every change sends JSON (the server refuses anything else), so `body` defaults to `{}`. */
export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (method !== 'GET') {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the app. Check your connection and try again.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_' + res.status,
      err?.message ?? 'Something went wrong. Try again.',
      err?.fields,
    );
  }
  return data as T;
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

export const errorMessage = (err: unknown) =>
  isApiError(err) ? err.message : err instanceof Error ? err.message : 'Something went wrong. Try again.';
