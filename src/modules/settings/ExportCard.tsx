import { useState } from 'react';
import { FolderOpen, FolderOutput } from 'lucide-react';
import { Button, Card, Select } from '@/components/ui';
import { formatNumber, useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { revealExport, type ExportScope, type ExportSummary } from '@/services/exports';
import { useWorkspaces } from '@/services/queries';
import { isNativeRuntime } from '@/services/tauri';
import { toast } from '@/stores/toasts';
import { useExportData, type ExportStep } from './useExportData';

const ALL = 'all';

/** What an export holds, for example « 12 documents · 3 notes · 1 espace · 4 relations ». */
function useSummaryText() {
  const { tCount } = useI18n();
  return (summary: ExportSummary) =>
    [
      tCount('settings.storage.backup.counts.documents', summary.documents),
      tCount('settings.storage.backup.counts.notes', summary.notes),
      tCount('settings.storage.backup.counts.workspaces', summary.workspaces),
      tCount('settings.storage.backup.counts.relations', summary.relations),
    ].join(' · ');
}

/**
 * Export (specification §16.2 and §16.4): the knowledge base or one workspace, in open formats, in a folder the
 * user chooses. Nothing here moves or changes the data of ARCHIVE.
 */
export function ExportCard() {
  const { t, tCount, locale } = useI18n();
  const available = isNativeRuntime();
  const workspaces = useWorkspaces();
  const [choice, setChoice] = useState(ALL);
  const [step, setStep] = useState<ExportStep | null>(null);
  const [result, setResult] = useState<ExportSummary | null>(null);
  const run = useExportData(setStep);
  const summaryText = useSummaryText();

  const scope: ExportScope = choice === ALL ? { kind: 'all' } : { kind: 'workspace', id: choice };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('settings.storage.export.title')}
        </h3>
        <p className="max-w-2xl text-sm text-fg-secondary">
          {t('settings.storage.export.description')}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t('settings.storage.export.scope')}
          value={choice}
          disabled={run.isPending}
          onChange={(event) => {
            setChoice(event.target.value);
          }}
          className="w-72 max-w-full"
        >
          <option value={ALL}>{t('settings.storage.export.scopeAll')}</option>
          {workspaces.data?.map(({ workspace }) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.isArchived
                ? t('settings.storage.export.scopeArchived', { name: workspace.name })
                : workspace.name}
            </option>
          ))}
        </Select>
        <Button
          icon={FolderOutput}
          disabled={!available}
          loading={run.isPending}
          onClick={() => {
            setStep(null);
            run.mutate(scope, {
              onSuccess: (summary) => {
                setStep(null);
                if (!summary) {
                  return;
                }
                setResult(summary);
                if (summary.missingFiles.length > 0) {
                  toast.warning(t('settings.storage.export.doneWithMissing'));
                } else {
                  toast.success(t('settings.storage.export.done'));
                }
              },
              onError: (error) => {
                setStep(null);
                toast.error(t(errorMessageKey(error)));
              },
            });
          }}
        >
          {t('settings.storage.export.start')}
        </Button>
      </div>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm text-fg-secondary">
        {step && run.isPending && (
          <p>
            {t(
              step.phase === 'converting'
                ? 'settings.storage.export.converting'
                : 'settings.storage.export.progress',
              {
                done: formatNumber(step.done, locale),
                total: formatNumber(step.total, locale),
              },
            )}
          </p>
        )}
        {result && (
          <>
            <p className="break-all">
              {t('settings.storage.export.last', { folder: result.folder })}
            </p>
            <p>{summaryText(result)}</p>
          </>
        )}
      </div>
      {result && result.missingFiles.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-control border border-warning/30 bg-warning/10 p-3"
        >
          <p className="text-sm font-medium text-fg">
            {tCount('settings.storage.export.missingTitle', result.missingFiles.length)}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-secondary">
            {result.missingFiles.map((title, index) => (
              <li key={index}>{title}</li>
            ))}
          </ul>
          <p className="text-sm text-fg-secondary">{t('settings.storage.export.missingHint')}</p>
        </div>
      )}
      {result && (
        <Button
          variant="ghost"
          size="sm"
          icon={FolderOpen}
          className="self-start"
          onClick={() => {
            revealExport().catch((error: unknown) => {
              toast.error(t(errorMessageKey(error)));
            });
          }}
        >
          {t('settings.storage.export.reveal')}
        </Button>
      )}
    </Card>
  );
}
