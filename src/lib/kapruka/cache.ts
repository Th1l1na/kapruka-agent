/**
 * Tiny in-memory TTL cache for Kapruka read tools.
 *
 * Rationale (notes/data-shapes.md "Cross-cutting production constraints"):
 * the MCP rate limit (60 req/min) is shared across ALL users on our single
 * backend IP, and Kapruka caches reads up to 30 min server-side anyway. A
 * process-local cache in front collapses repeat queries to near-zero real
 * calls. Deliberately simple for Sprint 1 — a Map, no eviction beyond TTL.
 */
type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const value = await fn();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

export function clearCache(): void {
  store.clear();
}
