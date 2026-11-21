import { useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, Dialog, DialogContent, Select, Spinner } from '@/components/ui';
import { formatList, useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { useDeleteWorkspace, useWorkspaces } from '@/services/queries';
import {
  totalResources,
  type ResourceCounts,
  type Workspace,
  type WorkspaceDeletion,
} from '@/services/workspaces';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';

export interface DeleteWorkspaceDialogProps {
  open: boolean;
  workspace: Workspace;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

type Strategy = 'move' | 'unassign';

function StrategyOption({
  name,
  value,
  checked,
  disabled = false,
  label,
  hint,
  onSelect,
  children,
}: {
  name: string;
  value: Strategy;
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onSelect: (value: Strategy) => void;
  children?: ReactNode;
}) {
  const hintId = useId();
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4 transition-colors duration-150 ease-standard',
        checked ? 'border-blue bg-steel' : 'border-line-subtle',
      )}
    >
      <label className="flex cursor-default items-start gap-3">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={() => {
            onSelect(value);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue"
        />
        <span className="flex flex-col gap-1">
          <span className={cn('text-sm font-medium', disabled ? 'text-fg-disabled' : 'text-fg')}>
            {label}
          </span>
          <span id={hintId} className="text-xs text-fg-secondary">
            {hint}
          </span>
        </span>
      </label>
      {children ? <div className="pl-7">{children}</div> : null}
    </div>
  );
}

/**
 * Protected deletion of a workspace (spec §12.3): it explains what will happen, offers to move the content to
 * another workspace or to keep it without workspace, and requires an explicit confirmation. Nothing the
 * workspace holds is ever deleted.
 */
export function DeleteWorkspaceDialog({
  open,
  workspace,
  onOpenChange,
  onCloseAutoFocus,
}: DeleteWorkspaceDialogProps) {
  const { t, tCount, locale } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const strategyName = useId();
  const workspaces = useWorkspaces();
  const remove = useDeleteWorkspace();

  const summary = workspaces.data?.find((item) => item.workspace.id === workspace.id);
  const counts: ResourceCounts | undefined = summary?.counts;
  const targets = (workspaces.data ?? [])
    .map((item) => item.workspace)
    .filter((item) => item.id !== workspace.id && !item.isArchived);
  const [strategy, setStrategy] = useState<Strategy>();
  const [targetId, setTargetId] = useState<string>();
  const effectiveStrategy: Strategy = strategy ?? (targets.length > 0 ? 'move' : 'unassign');
  const effectiveTarget = targets.find((item) => item.id === targetId) ?? targets[0];
  const isEmpty = counts !== undefined && totalResources(counts) === 0;

  function contentSummary(value: ResourceCounts): string {
    const parts: string[] = [];
    if (value.documents > 0) parts.push(tCount('workspaces.counts.documents', value.documents));
    if (value.notes > 0) parts.push(tCount('workspaces.counts.notes', value.notes));
    if (value.folders > 0) parts.push(tCount('workspaces.counts.folders', value.folders));
    return formatList(parts, locale);
  }

  function confirm() {
    if (counts === undefined || remove.isPending) {
      return;
    }
    let deletion: WorkspaceDeletion;
    if (isEmpty) {
      deletion = { kind: 'empty' };
    } else if (effectiveStrategy === 'move' && effectiveTarget) {
      deletion = { kind: 'move_to', target: effectiveTarget.id };
    } else {
      deletion = { kind: 'unassign' };
    }
    const targetName = effectiveTarget?.name ?? '';
    remove.mutate(
      { id: workspace.id, deletion },
      {
        onSuccess: (report) => {
          const description = report.containerFolder
            ? t('workspaces.toasts.moved', {
                target: targetName,
                folder: report.containerFolder.name,
              })
            : deletion.kind === 'unassign'
              ? t('workspaces.toasts.unassigned')
              : undefined;
          toast.success(
            t('workspaces.toasts.deleted', { name: workspace.name }),
            description ? { description } : undefined,
          );
          onOpenChange(false);
          if (pathname === `/workspaces/${workspace.id}`) {
            void navigate('/workspaces');
          }
        },
        onError: (error) => {
          toast.error(t(errorMessageKey(error)));
        },
      },
    );
  }

  let description: string | undefined;
  if (counts !== undefined) {
    description = isEmpty
      ? t('workspaces.delete.emptyDescription')
      : t('workspaces.delete.contentDescription', { content: contentSummary(counts) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!remove.isPending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        title={t('workspaces.delete.title', { name: workspace.name })}
        description={description}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="secondary"
              disabled={remove.isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              disabled={counts === undefined}
              onClick={confirm}
            >
              {t('workspaces.delete.confirm')}
            </Button>
          </>
        }
      >
        {counts === undefined ? (
          workspaces.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t(errorMessageKey(workspaces.error))}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-fg-secondary">
              <Spinner size={16} />
              {t('common.loading')}
            </p>
          )
        ) : isEmpty ? null : (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-xs font-medium text-fg-secondary">
              {t('workspaces.delete.strategy')}
            </legend>
            <StrategyOption
              name={strategyName}
              value="move"
              checked={effectiveStrategy === 'move'}
              disabled={targets.length === 0}
              label={t('workspaces.delete.moveOption')}
              hint={
                targets.length === 0
                  ? t('workspaces.delete.noTarget')
                  : t('workspaces.delete.moveHint', { name: workspace.name })
              }
              onSelect={setStrategy}
            >
              {effectiveStrategy === 'move' && effectiveTarget ? (
                <Select
                  label={t('workspaces.delete.target')}
                  value={effectiveTarget.id}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                  }}
                >
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </StrategyOption>
            <StrategyOption
              name={strategyName}
              value="unassign"
              checked={effectiveStrategy === 'unassign'}
              label={t('workspaces.delete.unassignOption')}
              hint={t('workspaces.delete.unassignHint')}
              onSelect={setStrategy}
            />
          </fieldset>
        )}
      </DialogContent>
    </Dialog>
  );
}
