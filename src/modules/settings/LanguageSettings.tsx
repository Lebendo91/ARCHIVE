import { Card } from '@/components/ui';
import { translateFor, useI18n, type Locale } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { useUpdateSettings } from '@/services/queries';
import { isNativeRuntime } from '@/services/tauri';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';

const LANGUAGES: readonly Locale[] = ['fr', 'en'];

/** Interface language, stored in the settings and applied immediately (specification §15.1). */
export function LanguageSettings() {
  const { t, locale } = useI18n();
  const update = useUpdateSettings();
  const available = isNativeRuntime();

  return (
    <Card>
      <fieldset className="flex flex-col gap-4" disabled={!available || update.isPending}>
        <legend className="contents">
          <span className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            {t('settings.general.languageTitle')}
          </span>
        </legend>
        <p className="text-sm text-fg-secondary">
          {available
            ? t('settings.general.languageDescription')
            : t('errors.codes.native_runtime_unavailable')}
        </p>
        <div className="grid max-w-md grid-cols-2 gap-3">
          {LANGUAGES.map((language) => {
            const checked = locale === language;
            return (
              <label
                key={language}
                className={cn(
                  'flex h-10 cursor-default items-center gap-3 rounded-control border px-4 text-sm transition-colors duration-150 ease-standard',
                  checked
                    ? 'border-blue bg-blue/10 text-fg'
                    : 'border-line text-fg-secondary hover:border-fg-disabled',
                  !available && 'opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="interface-language"
                  value={language}
                  checked={checked}
                  className="accent-blue"
                  onChange={() => {
                    update.mutate(
                      { language },
                      {
                        onSuccess: () => {
                          toast.success(translateFor(language, 'settings.general.languageSaved'));
                        },
                        onError: (error) => {
                          toast.error(t(errorMessageKey(error)));
                        },
                      },
                    );
                  }}
                />
                <span lang={language}>{t(`settings.general.languages.${language}`)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Card>
  );
}
