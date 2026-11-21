import { describe, expect, it } from 'vitest';
import { SubmitIdeaSchema, finalText, xLength } from './contracts.js';

describe('contracts', () => {
  it('counts links as 23 characters on X', () => {
    expect(xLength('hi https://example.com/a/very/long/path?x=1')).toBe(3 + 23);
    expect(xLength('😀')).toBe(1);
  });

  it('puts your take first', () => {
    expect(finalText('  My take ', 'Draft')).toBe('My take\n\nDraft');
    expect(finalText('', 'Draft')).toBe('Draft');
  });

  it('needs at least one text', () => {
    expect(SubmitIdeaSchema.safeParse({ kind: 'OWN', title: 't' }).success).toBe(false);
    expect(SubmitIdeaSchema.safeParse({ kind: 'OWN', title: 't', linkedin: 'x' }).success).toBe(true);
  });
});
