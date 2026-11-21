import '@testing-library/jest-dom/vitest';
import { clearMocks } from '@tauri-apps/api/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { usePageTitleStore } from '@/app/router/pageTitle';
import { useToastStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import { useWorkspaceDialogs } from '@/stores/workspaceDialogs';

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
  // clearMocks empties the Tauri internals but leaves the object: remove it so that the next test starts
  // outside the desktop runtime unless it installs a runtime double.
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  localStorage.clear();
  useUiStore.setState({ sidebarCollapsed: false });
  useToastStore.setState({ toasts: [] });
  useWorkspaceDialogs.setState({ dialog: null, isOpen: false, returnFocus: null });
  usePageTitleStore.setState({ title: null });
});
