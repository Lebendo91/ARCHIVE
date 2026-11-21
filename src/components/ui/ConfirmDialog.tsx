import { useRef } from 'react';
import { useI18n } from '@/i18n';
import { Button } from './Button';
import { Dialog, DialogContent } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for destructive operations: the dialog then opens with the focus on "Cancel". */
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
}

/** Explicit confirmation required before any destructive action (specification §17.1). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        onOpenAutoFocus={(event) => {
          if (tone === 'danger') {
            event.preventDefault();
            cancelRef.current?.focus();
          }
        }}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="secondary"
              disabled={loading}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {cancelLabel ?? t('common.cancel')}
            </Button>
            <Button variant={tone} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
