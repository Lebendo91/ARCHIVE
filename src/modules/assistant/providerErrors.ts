import type { MessageKey, MessageParams } from '@/i18n';
import type { ProviderError } from '@/services/ai';

type Translate = (key: MessageKey, params?: MessageParams) => string;

/** What to tell the user when a provider could not answer: a stable message, and the cleaned detail. */
export function providerErrorText(error: ProviderError, t: Translate): string {
  switch (error.kind) {
    case 'rate_limited':
      return error.retry_after_seconds === null
        ? t('ai.errors.rate_limited')
        : t('ai.errors.rate_limited_after', { seconds: error.retry_after_seconds });
    case 'server':
      return t('ai.errors.server', { status: error.status });
    case 'invalid_request':
      return error.detail === null
        ? t('ai.errors.invalid_request')
        : `${t('ai.errors.invalid_request')} ${t('ai.errors.detail', { detail: error.detail })}`;
    default:
      return t(`ai.errors.${error.kind}`);
  }
}
