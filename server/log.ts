/** One JSON line per event. Never pass tokens, post text or email addresses here. */
export function logEvent(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}
