import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';
import { IconButton } from './IconButton';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZE_CLASSES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' } as const;

export interface DialogContentProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE_CLASSES;
  /** Lets a dialog choose which element receives focus first (for example "Cancel" in a destructive dialog). */
  onOpenAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>['onOpenAutoFocus'];
  /** Lets a dialog opened without a trigger (from a menu or a shortcut) choose where the focus returns. */
  onCloseAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>['onCloseAutoFocus'];
}

/**
 * Modal dialog: focus is trapped inside, Escape and the close button dismiss it, focus returns to the
 * trigger on close (specification §17.2: dialogs for important or destructive operations).
 */
export function DialogContent({
  title,
  description,
  children,
  footer,
  size = 'md',
  onOpenAutoFocus,
  onCloseAutoFocus,
}: DialogContentProps) {
  const { t } = useI18n();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-obsidian/75 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-0 z-50 m-auto flex h-fit max-h-[85vh] w-[calc(100%-64px)] flex-col rounded-modal border border-line bg-graphite shadow-modal outline-none data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in',
          SIZE_CLASSES[size],
        )}
        {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <div className={cn('flex items-start gap-4 px-6 pt-6', !children && !footer && 'pb-6')}>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="font-display text-lg font-semibold text-fg">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-2 text-sm text-fg-secondary">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton icon={X} label={t('common.close')} size="sm" tooltip={false} />
          </DialogPrimitive.Close>
        </div>
        {children ? (
          <div className={cn('min-h-0 overflow-y-auto px-6 pt-5', !footer && 'pb-6')}>
            {children}
          </div>
        ) : null}
        {footer ? <div className="flex justify-end gap-3 px-6 pt-5 pb-6">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
