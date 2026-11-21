import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './secrets.js';

describe('secrets', () => {
  const key = Buffer.alloc(32, 1);
  it('round-trips and refuses tampered or wrong-key data', () => {
    const stored = encrypt('token-123', key);
    expect(stored).not.toContain('token-123');
    expect(decrypt(stored, key)).toBe('token-123');
    const parts = stored.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => decrypt(parts.join('.'), key)).toThrow();
    expect(() => decrypt(stored, Buffer.alloc(32, 2))).toThrow();
  });
});
