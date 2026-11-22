import { listen, TauriEvent } from '@tauri-apps/api/event';
import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clock,
  Copy,
  RotateCcw,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, IconButton, Spinner } from '@/components/ui';
import { formatList, useI18n, type Locale, type MessageKey, type PluralKey } from '@/i18n';
import { isNativeRuntime } from '@/services/tauri';
import { useImportStore, type ImportFileState, type ImportRun } from '@/stores/imports';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/utils/cn';
import { useStartImport } from './useStartImport';

const RETRYABLE = new Set(['unreadable', 'storage', 'database']);

function FileRow({ file, current }: { file: ImportFileState; current: boolean }) {
  const { t } = useI18n();
  const { outcome } = file;
  let Icon: LucideIcon = Clock;
  let tone = 'text-fg-secondary';
  let detail: ReactNode = t('library.import.waiting');
  if (current && !outcome) {
    detail = null;
  } else if (outcome?.status === 'imported') {
    // Imported, but its text could not be extracted (or only partly): the document page explains why.
    const issueKey: MessageKey | null =
      outcome.issue === null
        ? null
        : outcome.issue === 'truncated'
          ? 'library.import.importedTruncated'
          : 'library.import.importedNoText';
    Icon = issueKey ? CircleAlert : CircleCheck;
    tone = issueKey ? 'text-warning' : 'text-success';
    detail = (
      <Link to={`/library/${outcome.document.id}`} className="rounded-sm hover:text-fg">
        {t(issueKey ?? 'library.import.importedFile')}
      </Link>
    );
  } else if (outcome?.status === 'duplicate') {
    Icon = Copy;
    tone = 'text-blue';
    detail = (
      <Link
        to={`/library/${outcome.existing.id}`}
        title={t('library.import.openExisting')}
        className="rounded-sm hover:text-fg"
      >
        {t('library.import.duplicate', { title: outcome.existing.title })}
      </Link>
    );
  } else if (outcome?.status === 'failed') {
    Icon = CircleAlert;
    tone = 'text-danger';
    detail = t(`library.import.failures.${outcome.reason}`);
  } else if (outcome?.status === 'cancelled') {
    Icon = CircleMinus;
    detail = t('library.import.cancelledFile');
  }
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={cn('mt-0.5 flex shrink-0', tone)}>
        {current && !outcome ? <Spinner size={16} /> : <Icon size={16} aria-hidden="true" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg">{file.name}</span>
        {detail ? <span className="truncate text-xs text-fg-secondary">{detail}</span> : null}
      </span>
    </li>
  );
}

function summaryText(
  run: ImportRun,
  tCount: (key: PluralKey, count: number) => string,
  locale: Locale,
): string {
  const { summary } = run;
  if (!summary) {
    return '';
  }
  const parts: string[] = [];
  const add = (key: PluralKey, count: number) => {
    if (count > 0) {
      parts.push(tCount(key, count));
    }
  };
  add('library.import.imported', summary.imported);
  add('library.import.duplicates', summary.duplicates);
  add('library.import.failed', summary.failed);
  add('library.import.cancelled', summary.cancelled);
  return formatList(parts, locale);
}

/** Progress of the current import, then its outcome, file by file (spec §7.2: progress and error report). */
function ImportPanel({ onRetry }: { onRetry: () => void }) {
  const { t, tCount, locale } = useI18n();
  const titleId = useId();
  const run = useImportStore((state) => state.run);
  const running = useImportStore((state) => state.running);
  const cancel = useImportStore((state) => state.cancel);
  const dismiss = useImportStore((state) => state.dismiss);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  if (!run) {
    return null;
  }
  const done = run.files.filter((file) => file.outcome !== null).length;
  const currentIndex = running ? run.files.find((file) => file.outcome === null)?.index : undefined;
  const summary = summaryText(run, tCount, locale);
  const retryable = run.files.some(
    (file) => file.outcome?.status === 'failed' && RETRYABLE.has(file.outcome.reason),
  );
  const titleKey: MessageKey = running ? 'library.import.running' : 'library.import.finished';

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'fixed bottom-6 z-40 flex w-96 flex-col rounded-card border border-line bg-graphite shadow-popover',
        collapsed
          ? 'left-[calc(var(--sidebar-width-collapsed)+2rem)]'
          : 'left-[calc(var(--sidebar-width)+2rem)]',
      )}
    >
      <header className="flex items-center gap-3 border-b border-line-subtle px-4 py-3">
        <span className={cn('flex shrink-0', running ? 'text-blue' : 'text-success')}>
          {running ? <Spinner size={18} /> : <CircleCheck size={18} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-sm font-semibold text-fg">
            {t(titleKey, { done, total: run.files.length })}
          </h2>
          {summary ? <p className="truncate text-xs text-fg-secondary">{summary}</p> : null}
        </div>
        {running ? (
          <Button size="sm" disabled={run.cancelling} onClick={cancel}>
            {run.cancelling ? t('library.import.cancelling') : t('library.import.cancel')}
          </Button>
        ) : (
          <IconButton icon={X} label={t('common.close')} size="sm" onClick={dismiss} />
        )}
      </header>
      <ul className="max-h-64 overflow-y-auto px-4 py-1">
        {run.files.map((file) => (
          <FileRow key={file.index} file={file} current={file.index === currentIndex} />
        ))}
      </ul>
      {retryable && !running ? (
        <footer className="border-t border-line-subtle px-4 py-3">
          <Button size="sm" icon={RotateCcw} onClick={onRetry}>
            {t('library.import.retry')}
          </Button>
        </footer>
      ) : null}
      <p role="status" className="sr-only">
        {running ? '' : `${t('library.import.finished')}. ${summary}`}
      </p>
    </section>
  );
}

/** Shown while files are dragged over the window. Decorative: dropping is a pointer-only interaction. */
function DropOverlay() {
  const { t } = useI18n();
  const label = useImportStore((state) => state.context.label);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-obsidian/95 p-12"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-modal border-2 border-dashed border-amber bg-amber/5 text-center">
        <Upload size={40} className="text-amber" />
        <p className="font-display text-2xl font-semibold text-fg">
          {t('library.import.dropTitle')}
        </p>
        <p className="text-base text-fg-secondary">
          {label
            ? t('library.import.dropTarget', { name: label })
            : t('library.import.dropLibrary')}
        </p>
      </div>
    </div>
  );
}

/**
 * Imports anywhere in the application: native drag and drop onto the window (the core records the dropped
 * paths, the interface only learns that files were dropped), the progress panel and the retry.
 */
export function ImportController() {
  const startImport = useStartImport();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!isNativeRuntime()) {
      return undefined;
    }
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const subscribe = (event: TauriEvent, handler: () => void) => {
      listen(event, handler)
        .then((unlisten) => {
          if (disposed) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        })
        .catch(() => undefined);
    };
    subscribe(TauriEvent.DRAG_ENTER, () => {
      setDragging(true);
    });
    subscribe(TauriEvent.DRAG_OVER, () => {
      setDragging(true);
    });
    subscribe(TauriEvent.DRAG_LEAVE, () => {
      setDragging(false);
    });
    subscribe(TauriEvent.DRAG_DROP, () => {
      setDragging(false);
      void startImport('dropped');
    });
    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [startImport]);

  return (
    <>
      {dragging ? <DropOverlay /> : null}
      <ImportPanel
        onRetry={() => {
          const target = useImportStore.getState().run?.target;
          void startImport('retry', target);
        }}
      />
    </>
  );
}
