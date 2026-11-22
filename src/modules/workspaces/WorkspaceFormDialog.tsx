import { Check } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Dialog, DialogContent, Input, Textarea } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { useCreateWorkspace, useUpdateWorkspace } from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import {
  WORKSPACE_DESCRIPTION_MAX,
  WORKSPACE_NAME_MAX,
  type TokenColor,
  type Workspace,
  type WorkspacePatch,
} from '@/services/workspaces';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';
import {
  COLOR_SWATCH_CLASSES,
  COLOR_TEXT_CLASSES,
  DEFAULT_WORKSPACE_COLOR,
  DEFAULT_WORKSPACE_ICON,
  isWorkspaceIconName,
  WORKSPACE_COLORS,
  WORKSPACE_ICON_NAMES,
  WORKSPACE_ICONS,
} from './appearance';

export interface WorkspaceFormDialogProps {
  open: boolean;
  /** Workspace to edit; without it, the dialog creates a new workspace. */
  workspace?: Workspace | undefined;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: TokenColor;
  onChange: (color: TokenColor) => void;
}) {
  const { t } = useI18n();
  const name = useId();
  // A colour that is no longer offered stays selectable for the workspace that uses it.
  const colors = WORKSPACE_COLORS.includes(value) ? WORKSPACE_COLORS : [...WORKSPACE_COLORS, value];
  return (
    <fieldset>
      <legend className="text-xs font-medium text-fg-secondary">
        {t('workspaces.form.color')}
        <span aria-hidden="true" className="text-fg">
          {' · '}
          {t(`workspaces.colors.${value}`)}
        </span>
      </legend>
      <div className="mt-3 flex gap-3">
        {colors.map((color) => (
          <label key={color} className="relative cursor-default">
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => {
                onChange(color);
              }}
              className="peer absolute inset-0 m-0 cursor-default appearance-none opacity-0"
            />
            <span className="sr-only">{t(`workspaces.colors.${color}`)}</span>
            <span
              aria-hidden="true"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-obsidian ring-offset-2 ring-offset-graphite transition-shadow duration-150',
                'peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-blue',
                COLOR_SWATCH_CLASSES[color],
              )}
            >
              {value === color ? <Check size={14} /> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: TokenColor;
  onChange: (icon: string) => void;
}) {
  const { t } = useI18n();
  const name = useId();
  return (
    <fieldset>
      <legend className="text-xs font-medium text-fg-secondary">
        {t('workspaces.form.icon')}
        {isWorkspaceIconName(value) ? (
          <span aria-hidden="true" className="text-fg">
            {' · '}
            {t(`workspaces.icons.${value}`)}
          </span>
        ) : null}
      </legend>
      <div className="mt-3 grid grid-cols-8 gap-2">
        {WORKSPACE_ICON_NAMES.map((icon) => {
          const Icon = WORKSPACE_ICONS[icon];
          const checked = value === icon;
          return (
            <label key={icon} className="relative cursor-default">
              <input
                type="radio"
                name={name}
                value={icon}
                checked={checked}
                onChange={() => {
                  onChange(icon);
                }}
                className="peer absolute inset-0 m-0 cursor-default appearance-none opacity-0"
              />
              <span className="sr-only">{t(`workspaces.icons.${icon}`)}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-control border transition-colors duration-150 ease-standard',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue',
                  checked
                    ? cn('border-fg bg-steel', COLOR_TEXT_CLASSES[color])
                    : 'border-line-subtle bg-obsidian text-fg-secondary hover:bg-steel hover:text-fg',
                )}
              >
                <Icon size={18} />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Creation and edition of a workspace (spec §12.1): name, description, accent colour and icon. A name already
 * used, even by an archived workspace, is reported on the field itself.
 */
export function WorkspaceFormDialog({
  open,
  workspace,
  onOpenChange,
  onCloseAutoFocus,
}: WorkspaceFormDialogProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(workspace?.name ?? '');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [color, setColor] = useState<TokenColor>(workspace?.color ?? DEFAULT_WORKSPACE_COLOR);
  const [icon, setIcon] = useState<string>(workspace?.icon ?? DEFAULT_WORKSPACE_ICON);
  const [nameError, setNameError] = useState<string>();
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace();
  const pending = create.isPending || update.isPending;

  function showNameError(message: string) {
    setNameError(message);
    nameRef.current?.focus();
  }

  function onError(error: unknown) {
    if (isCommandError(error) && error.code === 'name_taken') {
      showNameError(t('workspaces.form.nameTaken'));
      return;
    }
    toast.error(t(errorMessageKey(error)));
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (trimmedName === '') {
      showNameError(t('workspaces.form.nameRequired'));
      return;
    }
    if (!workspace) {
      create.mutate(
        { name: trimmedName, description: trimmedDescription, color, icon },
        {
          onSuccess: (created) => {
            toast.success(t('workspaces.toasts.created', { name: created.name }));
            onOpenChange(false);
            void navigate(`/workspaces/${created.id}`);
          },
          onError,
        },
      );
      return;
    }
    const patch: WorkspacePatch = {};
    if (trimmedName !== workspace.name) patch.name = trimmedName;
    if (trimmedDescription !== workspace.description) patch.description = trimmedDescription;
    if (color !== workspace.color) patch.color = color;
    if (icon !== workspace.icon) patch.icon = icon;
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    update.mutate(
      { id: workspace.id, patch },
      {
        onSuccess: () => {
          toast.success(t('workspaces.toasts.saved'));
          onOpenChange(false);
        },
        onError,
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A request in progress is short; closing meanwhile would hide its outcome.
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        title={workspace ? t('workspaces.form.editTitle') : t('workspaces.form.createTitle')}
        onOpenAutoFocus={(event) => {
          // The name is what people come to type: the focus starts there, not on « Close ».
          event.preventDefault();
          nameRef.current?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={pending}>
              {workspace ? t('workspaces.form.submitSave') : t('workspaces.form.submitCreate')}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
          <Input
            ref={nameRef}
            label={t('workspaces.form.name')}
            placeholder={t('workspaces.form.namePlaceholder')}
            value={name}
            maxLength={WORKSPACE_NAME_MAX}
            autoComplete="off"
            spellCheck={false}
            required
            error={nameError}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
          />
          <Textarea
            label={t('workspaces.form.description')}
            placeholder={t('workspaces.form.descriptionPlaceholder')}
            hint={t('workspaces.form.descriptionHint')}
            value={description}
            maxLength={WORKSPACE_DESCRIPTION_MAX}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
          <ColorPicker value={color} onChange={setColor} />
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
