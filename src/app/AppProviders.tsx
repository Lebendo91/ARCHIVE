import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { TooltipProvider } from '@/components/ui';
import { I18nProvider } from '@/i18n';

/** Application-wide providers, shared by the real application and the tests. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          {children}
        </TooltipProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
}
