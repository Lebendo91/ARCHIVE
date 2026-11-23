import { SlidersHorizontal } from 'lucide-react';
import { useId } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger, Select } from '@/components/ui';
import { useI18n } from '@/i18n';
import { GRAPH_NODE_KINDS, LINK_TYPE, type GraphNodeKind } from '@/services/graph';
import { RELATION_TYPES } from '@/services/memory';
import { useWorkspaces } from '@/services/queries';
import {
  ITEM_KINDS,
  kindsParam,
  RESET_FILTERS,
  typesParam,
  type GraphFilters,
} from './graphParams';

function Check({
  label,
  checked,
  disabled = false,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm text-fg">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-xs text-fg-secondary">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export interface GraphFiltersProps {
  filters: GraphFilters;
  /** Number of filters that differ from the defaults. */
  active: number;
  onChange: (changes: Record<string, string | null>) => void;
}

/** Filters applied by the core before anything is drawn (spec §11.3): kinds of node and of connection. */
export function GraphFiltersPopover({ filters, active, onChange }: GraphFiltersProps) {
  const { t, tCount } = useI18n();
  const workspaces = useWorkspaces();
  const toggleKind = (kind: GraphNodeKind, checked: boolean) => {
    const kinds = checked
      ? [...filters.kinds, kind]
      : filters.kinds.filter((candidate) => candidate !== kind);
    onChange({ kinds: kindsParam(kinds) });
  };
  const toggleType = (type: string, checked: boolean) => {
    const types = checked
      ? [...filters.types, type]
      : filters.types.filter((candidate) => candidate !== type);
    onChange({ types: typesParam(types) });
  };
  // At least one kind of item stays: workspaces and tags alone connect nothing.
  const lastItem = (kind: GraphNodeKind) =>
    ITEM_KINDS.includes(kind) &&
    filters.kinds.filter((candidate) => ITEM_KINDS.includes(candidate)).length === 1 &&
    filters.kinds.includes(kind);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon={SlidersHorizontal}>
          {t('graph.filters.label')}
          {active > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-2xs font-semibold text-obsidian"
              >
                {active}
              </span>{' '}
              <span className="sr-only">{tCount('library.filters.activeCount', active)}</span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent label={t('graph.filters.label')} className="w-80">
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-2xs font-semibold tracking-label text-fg-secondary uppercase">
              {t('graph.filters.items')}
            </legend>
            {GRAPH_NODE_KINDS.map((kind) => (
              <Check
                key={kind}
                label={t(`graph.kindsPlural.${kind}`)}
                checked={filters.kinds.includes(kind)}
                disabled={lastItem(kind)}
                onChange={(checked) => {
                  toggleKind(kind, checked);
                }}
              />
            ))}
            <p className="text-xs text-fg-secondary">{t('graph.filters.itemsHint')}</p>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-2xs font-semibold tracking-label text-fg-secondary uppercase">
              {t('graph.filters.links')}
            </legend>
            <Check
              label={t('graph.filters.noteLinks')}
              checked={filters.types.includes(LINK_TYPE)}
              onChange={(checked) => {
                toggleType(LINK_TYPE, checked);
              }}
            />
            {RELATION_TYPES.map((type) => (
              <Check
                key={type}
                label={t(`memory.relations.types.${type}`)}
                checked={filters.types.includes(type)}
                onChange={(checked) => {
                  toggleType(type, checked);
                }}
              />
            ))}
            <Check
              label={t('graph.filters.suggestions')}
              hint={t('graph.filters.suggestionsHint')}
              checked={filters.suggestions}
              onChange={(checked) => {
                onChange({ suggestions: checked ? '1' : null });
              }}
            />
          </fieldset>
          <Select
            label={t('graph.filters.workspace')}
            value={filters.workspaceId ?? ''}
            onChange={(event) => {
              onChange({ workspace: event.target.value });
            }}
          >
            <option value="">{t('graph.filters.allWorkspaces')}</option>
            {(workspaces.data ?? []).map(({ workspace }) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
          {active > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                onChange(RESET_FILTERS);
              }}
            >
              {t('graph.filters.reset')}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
