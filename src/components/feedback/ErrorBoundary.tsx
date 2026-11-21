import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/services/diagnostics';
import { ErrorPanel } from './ErrorPanel';

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

/** Last line of defence: a rendering error outside the router shows a recovery screen, never a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError(
      `Render error${info.componentStack ? ` in ${info.componentStack.trim().split('\n')[0] ?? ''}` : ''}`,
      error,
    );
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center bg-obsidian p-8">
          <ErrorPanel error={this.state.error} />
        </div>
      );
    }
    return this.props.children;
  }
}
