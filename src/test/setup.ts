import '@testing-library/jest-dom/vitest';
import { clearMocks } from '@tauri-apps/api/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useToastStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';

// Browser APIs that jsdom does not implement but Radix primitives rely on. The stubs do nothing on purpose.
const doNothing = (): void => undefined;

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe = doNothing;
    unobserve = doNothing;
    disconnect = doNothing;
  };
}

for (const method of ['scrollIntoView', 'hasPointerCapture', 'releasePointerCapture'] as const) {
  if (!(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, {
      value: method === 'hasPointerCapture' ? () => false : doNothing,
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  cleanup();
  clearMocks();
  localStorage.clear();
  useUiStore.setState({ sidebarCollapsed: false });
  useToastStore.setState({ toasts: [] });
});
