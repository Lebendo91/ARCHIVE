import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useI18n } from '@/i18n';

/** A removable chip showing one active filter; the whole chip is the button that removes it. */
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t('library.filters.remove', { label })}
      onClick={onRemove}
      className="inline-flex h-7 max-w-full cursor-default items-center gap-1.5 rounded-full border border-line bg-graphite pr-2 pl-3 text-xs text-fg transition-colors duration-150 ease-standard hover:border-fg-disabled hover:bg-steel"
    >
      <span className="truncate">{label}</span>
      <X size={14} aria-hidden="true" className="shrink-0 text-fg-secondary" />
    </button>
  );
}

/** Filters, sorting and search are kept in the address: links can open a pre-filtered list. */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  // The address changes when the router renders it: two quick changes (one filter, then another) must build
  // on each other instead of both starting from the address shown, which would lose the first one.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  });
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(pending.current ?? params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    pending.current = next;
    setParams(next, { replace: true });
  };
  return { params, update };
}
