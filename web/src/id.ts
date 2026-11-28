let fallbackCounter = 0;

/**
 * Generate a unique ID, using `crypto.randomUUID` when available and falling
 * back to `crypto.getRandomValues` (RFC 4122 v4) or timestamp + random.
 */
export function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    try {
      return cryptoObj.randomUUID();
    } catch {
      // Fall back if randomUUID throws in restricted or mocked environments.
    }
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  fallbackCounter = (fallbackCounter + 1) % 36 ** 4;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${fallbackCounter.toString(36)}`;
}
