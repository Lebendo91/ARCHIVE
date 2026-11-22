import '@testing-library/jest-dom/vitest';
import { clearMocks } from '@tauri-apps/api/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { usePageTitleStore } from '@/app/router/pageTitle';
import { useResourceDialogs } from '@/stores/resourceDialogs';
import { useImportStore } from '@/stores/imports';
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

// The note editor (ProseMirror) measures the selection to keep it in view; jsdom has no layout, so the
// measures are empty.
const EMPTY_RECT = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
} as DOMRect;
if (!('getClientRects' in Range.prototype)) {
  Object.defineProperties(Range.prototype, {
    getClientRects: { value: () => [] as unknown as DOMRectList, configurable: true },
    getBoundingClientRect: { value: () => EMPTY_RECT, configurable: true },
  });
}
if (!('elementFromPoint' in document)) {
  Object.defineProperty(document, 'elementFromPoint', { value: () => null, configurable: true });
}

afterEach(() => {
  cleanup();
  clearMocks();
  // clearMocks empties the Tauri internals but leaves the object: remove it so that the next test starts
  // outside the desktop runtime unless it installs a runtime double.
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  localStorage.clear();
  useUiStore.setState({ sidebarCollapsed: false, libraryView: 'list' });
  useToastStore.setState({ toasts: [] });
  useWorkspaceDialogs.setState({ dialog: null, isOpen: false, returnFocus: null });
  usePageTitleStore.setState({ title: null });
  useResourceDialogs.setState({ dialog: null, isOpen: false, returnFocus: null });
  useImportStore.setState({
    run: null,
    running: false,
    completed: 0,
    context: { target: {}, label: null },
  });
});
