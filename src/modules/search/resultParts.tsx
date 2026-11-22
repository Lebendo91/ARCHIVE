import { formatShortDate, useI18n, type MessageKey } from '@/i18n';
import type { SearchHit } from '@/services/search';
import { cn } from '@/utils/cn';
import type { AppliedInterpretation } from './searchRequest';

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

/** Where a result is: its workspace and folder, and the page of the passage found. */
export function hitDetails(hit: SearchHit, t: Translate): string {
  const parts: string[] = [];
  if (hit.workspaceName) {
    parts.push(hit.folderName ? `${hit.workspaceName} › ${hit.folderName}` : hit.workspaceName);
  }
  if (hit.page !== null) {
    parts.push(t('search.page', { page: hit.page }));
  }
  return parts.join(' · ');
}

export function hasApplied(applied: AppliedInterpretation): boolean {
  return applied.kind !== undefined || applied.date !== undefined;
}

/**
 * What was recognized in the search and applied as a filter, said plainly (spec §9.5: nothing pretends to
 * understand more), with the way back to the text as typed.
 */
export function InterpretationLine({
  applied,
  literal,
  recognizable,
  onToggle,
  className,
}: {
  applied: AppliedInterpretation;
  /** The text is searched as typed. */
  literal: boolean;
  /** Something in the text would be recognized (to offer it again once searched as typed). */
  recognizable: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const parts: string[] = [];
  if (applied.kind) {
    parts.push(t('search.kindFilter', { kind: t(`search.groups.${applied.kind}`) }));
  }
  if (applied.date) {
    parts.push(
      t(`search.dateFilter.${applied.date.field}`, {
        phrase: applied.date.phrase,
        period: t('search.period', {
          from: formatShortDate(new Date(applied.date.from), locale),
          // The end is exclusive: the last day of the period is the day before.
          to: formatShortDate(new Date(applied.date.to - 1), locale),
        }),
      }),
    );
  }
  if (literal ? !recognizable : parts.length === 0) {
    return null;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      {parts.length > 0 ? (
        <span className="text-fg-secondary">
          {t('search.understood')} <span className="text-fg">{parts.join(' · ')}</span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        className="cursor-default rounded-sm text-blue underline-offset-2 hover:underline"
      >
        {literal ? t('search.interpret') : t('search.literal')}
      </button>
    </div>
  );
}
