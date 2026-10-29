import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Browser APIs that jsdom lacks. Tests mock the API with fetch stubs only (test code, never the app).
class FakeEventSource {
  static readonly CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener(): void {}
  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal('EventSource', FakeEventSource);
vi.stubGlobal('ResizeObserver', FakeResizeObserver);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

afterEach(() => {
  cleanup();
});
