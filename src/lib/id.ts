let fallbackCounter = 0;

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackCounter += 1;
  return `local-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}
