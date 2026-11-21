import { formatCombination, SHORTCUTS } from '@/app/shortcuts/shortcuts';
import { Badge, KeyCombo } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Keyboard shortcut reference (specification §17.3), with the availability of each shortcut. */
export function ShortcutsTable() {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-card border border-line-subtle">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('shortcuts.tableCaption')}</caption>
        <thead className="bg-graphite text-2xs tracking-label text-fg-secondary uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t('shortcuts.action')}
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t('shortcuts.keys')}
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t('shortcuts.status')}
            </th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((shortcut) => (
            <tr key={shortcut.id} className="border-t border-line-subtle">
              <td className="px-4 py-3 text-fg">{t(shortcut.labelKey)}</td>
              <td className="px-4 py-3">
                <KeyCombo keys={formatCombination(shortcut.combination, t)} />
              </td>
              <td className="px-4 py-3">
                {shortcut.available ? (
                  <Badge tone="success">{t('common.available')}</Badge>
                ) : (
                  <Badge>{t('common.comingSoon')}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
