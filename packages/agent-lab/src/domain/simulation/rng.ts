/**
 * Deterministic primitives for the hermetic simulation environment
 * (organization-lab §3): seeded PRNG + pure string hashing. No IO, no timers,
 * no network — the virtual clock advances only through simulated events.
 */

/** FNV-1a 32-bit string hash (pure; used for seeds and replay fingerprints). */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Mulberry32 PRNG — deterministic stream from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(text: string): () => number {
  const hex = fnv1a32(text);
  return mulberry32(Number.parseInt(hex, 16));
}

/** Canonical JSON for hashing (stable key order, no whitespace). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** Replay fingerprint of a value (excludes undefined fields via canonicalJson). */
export function replayHash(value: unknown): string {
  return fnv1a32(canonicalJson(value));
}
