import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";

if (!URL.createObjectURL) {
  Object.defineProperty(URL, "createObjectURL", {
    value: () => `blob:test-${Math.random().toString(36).slice(2)}`,
    writable: true,
  });
}

if (!URL.revokeObjectURL) {
  Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, writable: true });
}

Object.defineProperty(navigator, "storage", {
  configurable: true,
  value: {
    estimate: async () => ({ usage: 0, quota: 1024 ** 3 }),
    persist: async () => true,
  },
});

afterEach(() => {
  document.body.innerHTML = "";
});
