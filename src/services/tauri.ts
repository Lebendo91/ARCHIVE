import { invoke, type InvokeArgs } from '@tauri-apps/api/core';

/** Commands exposed by the native core (src-tauri/src/commands). */
export type CommandName = 'app_info' | 'log_frontend_event';

/** Error raised when a native command fails or when the native runtime is not available. */
export class CommandError extends Error {
  readonly command: CommandName;
  readonly code: string;

  constructor(command: CommandName, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CommandError';
    this.command = command;
    this.code = code;
  }
}

/** True when the interface runs inside the ARCHIVE desktop application (or a test double of it). */
export function isNativeRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    if (typeof code === 'string') {
      return code;
    }
  }
  return 'unknown';
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Unknown error';
}

/** Calls a native command. Every data access of the interface goes through this function. */
export async function callCommand<T>(command: CommandName, args?: InvokeArgs): Promise<T> {
  if (!isNativeRuntime()) {
    throw new CommandError(
      command,
      'native_runtime_unavailable',
      `The "${command}" command requires the ARCHIVE desktop runtime.`,
    );
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new CommandError(command, readErrorCode(error), readErrorMessage(error), {
      cause: error,
    });
  }
}
