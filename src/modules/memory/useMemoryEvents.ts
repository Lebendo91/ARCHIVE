import { listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { MEMORY_CHANGED_EVENT } from '@/services/memory';
import { queryKeys } from '@/services/queries';
import { isNativeRuntime } from '@/services/tauri';

/** Changes of a long queue arrive one by one: the views are refreshed at most this often. */
const REFRESH_MS = 400;

/**
 * Refreshes what the interface shows of the memory engine (processing, analysis, relations) when the core's
 * worker reports a change, grouping the changes of a long queue.
 */
export function useMemoryEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!isNativeRuntime()) {
      return undefined;
    }
    let disposed = false;
    let stop: (() => void) | undefined;
    let timer: number | undefined;
    listen(MEMORY_CHANGED_EVENT, () => {
      timer ??= window.setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({ queryKey: queryKeys.memory });
      }, REFRESH_MS);
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stop = unlisten;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      stop?.();
      window.clearTimeout(timer);
    };
  }, [client]);
}
