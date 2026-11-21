import type { MessageKey } from '@/i18n';
import { isCommandError, type CommandErrorCode } from './tauri';

/** Translated message for each error code: a new native code without a message fails to compile. */
const ERROR_MESSAGES: Record<CommandErrorCode, MessageKey> = {
  invalid_input: 'errors.codes.invalid_input',
  not_found: 'errors.codes.not_found',
  name_taken: 'errors.codes.name_taken',
  in_use: 'errors.codes.in_use',
  stale_revision: 'errors.codes.stale_revision',
  duplicate_content: 'errors.codes.duplicate_content',
  database_unavailable: 'errors.codes.database_unavailable',
  database_too_new: 'errors.codes.database_too_new',
  migration_failed: 'errors.codes.migration_failed',
  storage: 'errors.codes.storage',
  database: 'errors.codes.database',
  io: 'errors.codes.io',
  internal: 'errors.codes.internal',
  native_runtime_unavailable: 'errors.codes.native_runtime_unavailable',
  unknown: 'errors.codes.unknown',
};

export function errorMessageKey(error: unknown): MessageKey {
  return isCommandError(error) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES.unknown;
}

/** Technical detail of an error, shown under « Technical details ». */
export function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
}
