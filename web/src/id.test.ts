import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fillRandomBytes(target: ArrayBufferView) {
  const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return target;
}

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID with crypto bound as this when available', () => {
    const expected = '12345678-1234-4123-8123-123456789abc';
    const mockCrypto = {
      randomUUID(this: unknown) {
        expect(this).toBe(mockCrypto);
        return expected;
      },
      getRandomValues: vi.fn(),
    };
    vi.stubGlobal('crypto', mockCrypto);

    expect(createId()).toBe(expected);
    expect(mockCrypto.getRandomValues).not.toHaveBeenCalled();
  });

  it('falls back to RFC 4122 v4 via getRandomValues when randomUUID is missing', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: fillRandomBytes,
    });

    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const id = createId();
      expect(id).toMatch(UUID_V4_RE);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  it('falls back to timestamp + random when neither randomUUID nor getRandomValues exists', () => {
    vi.stubGlobal('crypto', undefined);

    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const id = createId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  it('falls back to RFC 4122 v4 when randomUUID throws', () => {
    vi.stubGlobal('crypto', {
      randomUUID() {
        throw new Error('randomUUID blocked');
      },
      getRandomValues: fillRandomBytes,
    });

    const id = createId();
    expect(id).toMatch(UUID_V4_RE);
  });
});
