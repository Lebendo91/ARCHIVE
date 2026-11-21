import { useCallback, useEffect, useState } from 'react';
import { getAppInfo, type AppInfo } from '@/services/app';

export type AppInfoState =
  | { status: 'loading' }
  | { status: 'success'; data: AppInfo }
  | { status: 'error'; error: unknown };

/** Loads the version and build information of the running application. */
export function useAppInfo(): AppInfoState & { retry: () => void } {
  const [state, setState] = useState<AppInfoState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAppInfo().then(
      (data) => {
        if (!cancelled) {
          setState({ status: 'success', data });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}
