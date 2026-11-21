import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { useI18n } from '@/i18n';
import { useToastStore, type ToastTone } from '@/stores/toasts';
import { cn } from '@/utils/cn';
import { IconButton } from './IconButton';

const TONE_ICONS: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleX, className: 'text-danger' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  info: { icon: Info, className: 'text-blue' },
};

/** Renders the notifications pushed with `toast.success()`, `toast.error()`… */
export function Toaster() {
  const { t } = useI18n();
  const toasts = useToastStore((state) => state.toasts);
  const close = useToastStore((state) => state.close);

  return (
    <ToastPrimitive.Provider swipeDirection="right" label={t('toasts.region')}>
      {toasts.map((item) => {
        const { icon: Icon, className } = TONE_ICONS[item.tone];
        return (
          <ToastPrimitive.Root
            key={item.id}
            open={item.open}
            duration={item.duration}
            type={item.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) {
                close(item.id);
              }
            }}
            className="flex w-full items-start gap-3 rounded-card border border-line bg-steel p-4 shadow-popover data-[state=closed]:animate-toast-out data-[state=open]:animate-toast-in data-[swipe=cancel]:translate-x-0 data-[swipe=end]:animate-toast-out data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
          >
            <Icon size={20} className={cn('mt-px shrink-0', className)} />
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-medium text-fg">
                {item.title}
              </ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="mt-1 text-xs text-fg-secondary">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close asChild>
              <IconButton icon={X} label={t('toasts.dismiss')} size="sm" tooltip={false} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[60] flex w-96 max-w-full flex-col gap-2 p-6 outline-none" />
    </ToastPrimitive.Provider>
  );
}
