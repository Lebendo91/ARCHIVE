import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { TooltipProvider } from '@/components/ui';
import { I18nProvider } from '@/i18n';
import { createQueryClient, useSettings } from '@/services/queries';

/** Applies the interface language stored in the settings (French until they are loaded). */
function SettingsLocale({ children }: { children: ReactNode }) {
  const settings = useSettings();
  return <I18nProvider locale={settings.data?.language ?? 'fr'}>{children}</I18nProvider>;
}

/** Application-wide providers, shared by the real application and the tests. */
export function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <SettingsLocale>
        <ErrorBoundary>
          <TooltipProvider delayDuration={400} skipDelayDuration={200}>
            {children}
          </TooltipProvider>
        </ErrorBoundary>
      </SettingsLocale>
    </QueryClientProvider>
  );
}
