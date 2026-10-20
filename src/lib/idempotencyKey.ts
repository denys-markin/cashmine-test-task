/** A random Idempotency-Key. randomUUID needs a secure context (https, localhost); getRandomValues does not. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
