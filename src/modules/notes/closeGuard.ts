import { isNativeRuntime } from '@/services/tauri';

/** Longest wait for pending saves when the window closes: a save never keeps the window open for good. */
const CLOSE_TIMEOUT_MS = 3000;

const pending = new Map<string, () => Promise<void>>();
let unlisten: (() => void) | null = null;
let subscribing = false;

async function subscribe(): Promise<void> {
  if (subscribing || unlisten || !isNativeRuntime()) {
    return;
  }
  subscribing = true;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const stop = await getCurrentWindow().onCloseRequested(async () => {
      // The window closes once every pending save has finished, or after the timeout.
      await Promise.race([
        Promise.allSettled([...pending.values()].map((flush) => flush())),
        new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
      ]);
    });
    if (pending.size === 0) {
      stop();
    } else {
      unlisten = stop;
    }
  } catch {
    // Without the window API (tests, browser preview), there is no close to delay.
  } finally {
    subscribing = false;
  }
}

/**
 * Declares (or withdraws, with `null`) the unsaved changes of an editor. While any exist, closing the window
 * first saves them; otherwise the window closes as usual, without depending on the interface.
 */
export function setPendingSave(key: string, flush: (() => Promise<void>) | null): void {
  if (flush) {
    pending.set(key, flush);
    void subscribe();
  } else {
    pending.delete(key);
    if (pending.size === 0 && unlisten) {
      unlisten();
      unlisten = null;
    }
  }
}
