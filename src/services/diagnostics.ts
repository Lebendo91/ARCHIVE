import { callCommand, isNativeRuntime } from './tauri';

export type DiagnosticLevel = 'error' | 'warn' | 'info';

/** Longest message sent to the native log (the native side truncates as well). */
const MAX_MESSAGE_LENGTH = 2_000;

function describe(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }
  if (typeof reason === 'string') {
    return reason;
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * Reports a technical event of the interface to the native log. Never pass document content or secrets:
 * only messages produced by the application itself.
 */
export function reportDiagnostic(level: DiagnosticLevel, message: string): void {
  const trimmed = message.slice(0, MAX_MESSAGE_LENGTH);
  if (!isNativeRuntime()) {
    if (import.meta.env.DEV) {
      console.warn(`[diagnostic:${level}] ${trimmed}`);
    }
    return;
  }
  callCommand('log_frontend_event', { level, message: trimmed }).catch((error: unknown) => {
    // The log itself is unreachable: the console is the last place left to surface the problem.
    console.error('[diagnostic] Unable to reach the native log', error);
  });
}

export function reportError(context: string, error: unknown): void {
  reportDiagnostic('error', `${context}: ${describe(error)}`);
}

let installed = false;

/** Reports uncaught errors, unhandled promise rejections and Content Security Policy violations. */
export function installGlobalErrorReporting(): void {
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener('error', (event) => {
    reportDiagnostic(
      'error',
      `Uncaught error: ${event.message} (${event.filename}:${event.lineno})`,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnostic('error', `Unhandled rejection: ${describe(event.reason)}`);
  });
  document.addEventListener('securitypolicyviolation', (event) => {
    reportDiagnostic(
      'warn',
      `CSP violation: ${event.effectiveDirective} blocked ${event.blockedURI || 'inline content'}`,
    );
  });
}
