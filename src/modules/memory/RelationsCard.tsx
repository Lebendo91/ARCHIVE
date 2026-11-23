import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, MoreHorizontal, NotebookText, Plus, X } from 'lucide-react';
import { useId, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { ResourcePicker, type PickedResource } from '@/components/resources/ResourcePicker';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  SectionCard,
  Select,
  Skeleton,
} from '@/components/ui';
import { formatList, useI18n } from '@/i18n';
import {
  RELATION_TYPES,
  createRelation,
  decideRelation,
  isRelationType,
  listRelations,
  removeRelation,
  setRelationType,
  type RelationDecision,
  type RelationType,
  type RelationView,
} from '@/services/memory';
import type { LinkKind } from '@/services/notes';
import { queryKeys } from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { toast } from '@/stores/toasts';

interface Item {
  kind: LinkKind;
  id: string;
  title: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** The label of a relation seen from the item shown: « Explique » one way, « Expliqué par » the other. */
function useTypeLabel(): (relation: RelationView) => string {
  const { t } = useI18n();
  return (relation) => {
    if (!isRelationType(relation.relationType)) {
      return relation.relationType;
    }
    return relation.direction === 'outgoing'
      ? t(`memory.relations.types.${relation.relationType}`)
      : t(`memory.relations.inverse.${relation.relationType}`);
  };
}

function OtherItem({ relation }: { relation: RelationView }) {
  const { t } = useI18n();
  const { other } = relation;
  const Icon = other.kind === 'note' ? NotebookText : FileText;
  const title =
    other.kind === 'note' && other.title.trim() === '' ? t('notes.untitled') : other.title;
  const path = other.kind === 'note' ? `/notes/${other.id}` : `/library/${other.id}`;
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <Icon size={14} aria-hidden="true" className="shrink-0 text-fg-secondary" />
      {other.available ? (
        <Link to={path} className="min-w-0 truncate rounded-sm text-fg hover:text-blue">
          {title}
        </Link>
      ) : (
        <>
          <span className="min-w-0 truncate text-fg-secondary">{title}</span>
          <Badge>{t('memory.relations.inTrash')}</Badge>
        </>
      )}
    </span>
  );
}

/** Why the engine suggests a relation, and how sure it is. */
function Why({ relation }: { relation: RelationView }) {
  const { t, locale } = useI18n();
  const terms = strings(relation.provenance.terms);
  const tags = strings(relation.provenance.tags);
  const reasons = [
    terms.length > 0 ? t('memory.relations.terms', { terms: formatList(terms, locale) }) : '',
    tags.length > 0 ? t('memory.relations.tags', { tags: formatList(tags, locale) }) : '',
    relation.provenance.sameWorkspace === true ? t('memory.relations.sameWorkspace') : '',
    relation.confidence !== null
      ? t('memory.relations.confidence', { value: Math.round(relation.confidence * 100) })
      : '',
  ].filter((reason) => reason !== '');
  return <p className="text-xs text-fg-secondary">{reasons.join(' · ')}</p>;
}

function TypeSelect({
  value,
  onChange,
}: {
  value: RelationType;
  onChange: (value: RelationType) => void;
}) {
  const { t } = useI18n();
  return (
    <Select
      label={t('memory.relations.type')}
      value={value}
      onChange={(event) => {
        if (isRelationType(event.target.value)) {
          onChange(event.target.value);
        }
      }}
    >
      {RELATION_TYPES.map((type) => (
        <option key={type} value={type}>
          {t(`memory.relations.types.${type}`)}
        </option>
      ))}
    </Select>
  );
}

function AddRelationDialog({
  item,
  open,
  onClose,
  onCreated,
}: {
  item: Item;
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<RelationType>('related_to');
  const [error, setError] = useState<string>();
  const pick = (target: PickedResource) => {
    createRelation({
      source: { kind: item.kind, id: item.id },
      target: { kind: target.kind, id: target.id },
      relationType: type,
    })
      .then(onCreated)
      .then(() => {
        toast.success(t('memory.relations.created'));
        onClose();
      })
      .catch((reason: unknown) => {
        if (isCommandError(reason) && reason.code === 'name_taken') {
          setError(t('memory.relations.exists'));
        } else {
          setError(t('memory.relations.failed'));
        }
        searchRef.current?.focus();
      });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('memory.relations.addTitle')}
        size="md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="flex flex-col gap-4">
          <TypeSelect
            value={type}
            onChange={(value) => {
              setType(value);
              setError(undefined);
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <ResourcePicker
            inputRef={searchRef}
            exclude={{ kind: item.kind, id: item.id }}
            hint={t('memory.relations.addHint', { title: item.title })}
            onPick={pick}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TypeDialog({
  item,
  relation,
  onClose,
  onChanged,
  returnFocus,
}: {
  item: Item;
  relation: RelationView | null;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [type, setType] = useState<RelationType>(
    relation && isRelationType(relation.relationType) ? relation.relationType : 'related_to',
  );
  const [error, setError] = useState<string>();
  if (!relation) {
    return null;
  }
  const [source, target] =
    relation.direction === 'outgoing'
      ? [item.title, relation.other.title]
      : [relation.other.title, item.title];
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('memory.relations.typeTitle')}
        description={t('memory.relations.typeHint', { source, target })}
        size="sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
        footer={
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" form={formId} variant="primary">
              {t('memory.relations.save')}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setRelationType(relation.id, type)
              .then(onChanged)
              .then(() => {
                toast.success(t('memory.relations.changed'));
                onClose();
              })
              .catch((reason: unknown) => {
                setError(
                  isCommandError(reason) && reason.code === 'name_taken'
                    ? t('memory.relations.exists')
                    : t('memory.relations.failed'),
                );
              });
          }}
          className="flex flex-col gap-3"
        >
          <TypeSelect value={type} onChange={setType} />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Relations of a document or a note (specification §10.4–10.5): those decided, the engine's suggestions with
 * why and how sure, which the user accepts or rejects, and the rejected ones, which can be restored. The user
 * can add a relation, change its type, or remove it. The links written in notes are listed with the notes.
 */
export function RelationsCard({ item, editable }: { item: Item; editable: boolean }) {
  const { t, tCount } = useI18n();
  const client = useQueryClient();
  const typeLabel = useTypeLabel();
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RelationView | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const relations = useQuery({
    queryKey: queryKeys.relations(item.kind, item.id),
    queryFn: () => listRelations(item.kind, item.id),
  });
  const all = relations.data ?? [];
  const decided = all.filter((relation) => relation.status === 'accepted');
  const suggested = all.filter((relation) => relation.status === 'suggested');
  const rejected = all.filter((relation) => relation.status === 'rejected');

  // An acceptance adds an event to the timeline: the overview shows it.
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.memory }),
      client.invalidateQueries({ queryKey: queryKeys.dashboard }),
    ]);

  /** After a row leaves the list, the focus goes to the next decision to make, or to « Ajouter ». */
  const focusNext = (index: number) => {
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-decision]');
      const target = buttons?.[Math.min(index, buttons.length - 1)] ?? addRef.current;
      target?.focus();
    });
  };

  const decide = (relation: RelationView, decision: RelationDecision, index: number) => {
    const message =
      decision === 'accept'
        ? 'memory.relations.accepted'
        : decision === 'reject'
          ? 'memory.relations.rejected'
          : 'memory.relations.restored';
    decideRelation(relation.id, decision)
      .then(refresh)
      .then(() => {
        toast.success(t(message));
        focusNext(index);
      })
      .catch(() => {
        toast.error(t('memory.relations.failed'));
      });
  };

  const remove = (relation: RelationView) => {
    removeRelation(relation.id)
      .then(refresh)
      .then(() => {
        toast.success(t('memory.relations.removed'));
        focusNext(0);
      })
      .catch(() => {
        toast.error(t('memory.relations.failed'));
      });
  };

  let content;
  if (relations.isPending) {
    content = <Skeleton className="h-16 rounded-control" />;
  } else if (relations.isError) {
    content = <p className="text-sm text-fg-secondary">{t('memory.relations.failed')}</p>;
  } else {
    content = (
      <div ref={listRef} className="flex flex-col gap-5">
        {decided.length === 0 && suggested.length === 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-fg-secondary">{t('memory.relations.empty')}</p>
            <p className="text-xs text-fg-secondary">{t('memory.relations.emptyHint')}</p>
          </div>
        ) : null}
        {decided.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {decided.map((relation) => (
              <li key={relation.id} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs text-fg-secondary">{typeLabel(relation)}</span>
                  <OtherItem relation={relation} />
                  <span className="text-2xs text-fg-secondary">
                    {t(`memory.relations.origin.${relation.origin}`)}
                  </span>
                </div>
                {editable ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        icon={MoreHorizontal}
                        size="sm"
                        label={t('memory.relations.actionsLabel', {
                          title: relation.other.title,
                        })}
                        onFocus={(event) => {
                          menuRef.current = event.currentTarget;
                        }}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(relation);
                        }}
                      >
                        {t('memory.relations.changeType')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          remove(relation);
                        }}
                      >
                        {t('memory.relations.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {suggested.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-fg-secondary">
              {t('memory.relations.suggestions')}
            </h4>
            <p className="text-xs text-fg-secondary">{t('memory.relations.suggestionsHint')}</p>
            <ul className="flex flex-col gap-2">
              {suggested.map((relation, index) => (
                <li
                  key={relation.id}
                  className="flex flex-col gap-2 rounded-control border border-line-subtle bg-obsidian/40 p-3"
                >
                  <span className="text-xs text-fg-secondary">{typeLabel(relation)}</span>
                  <OtherItem relation={relation} />
                  <Why relation={relation} />
                  {editable ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon={Check}
                        data-decision=""
                        aria-label={t('memory.relations.acceptLabel', {
                          title: relation.other.title,
                        })}
                        onClick={() => {
                          decide(relation, 'accept', index);
                        }}
                      >
                        {t('memory.relations.accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={X}
                        aria-label={t('memory.relations.rejectLabel', {
                          title: relation.other.title,
                        })}
                        onClick={() => {
                          decide(relation, 'reject', index);
                        }}
                      >
                        {t('memory.relations.reject')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {rejected.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              aria-expanded={showRejected}
              onClick={() => {
                setShowRejected((current) => !current);
              }}
            >
              {showRejected
                ? t('memory.relations.hideRejected')
                : tCount('memory.relations.showRejected', rejected.length)}
            </Button>
            {showRejected ? (
              <ul className="flex flex-col gap-2">
                {rejected.map((relation) => (
                  <li key={relation.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <OtherItem relation={relation} />
                    </span>
                    {editable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('memory.relations.restoreLabel', {
                          title: relation.other.title,
                        })}
                        onClick={() => {
                          decide(relation, 'restore', 0);
                        }}
                      >
                        {t('memory.relations.restore')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard
      title={t('memory.relations.title')}
      actions={
        editable ? (
          <Button
            ref={addRef}
            size="sm"
            icon={Plus}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('memory.relations.add')}
          </Button>
        ) : undefined
      }
    >
      {content}
      {adding ? (
        <AddRelationDialog
          item={item}
          open={adding}
          onClose={() => {
            setAdding(false);
          }}
          onCreated={refresh}
        />
      ) : null}
      <TypeDialog
        key={editing?.id ?? 'none'}
        item={item}
        relation={editing}
        returnFocus={menuRef}
        onClose={() => {
          setEditing(null);
        }}
        onChanged={refresh}
      />
    </SectionCard>
  );
}
