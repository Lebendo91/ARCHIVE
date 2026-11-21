import type { LucideIcon } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/utils/cn';
import { Tooltip, type TooltipProps } from './Tooltip';

export type IconButtonSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const ICON_SIZE: Record<IconButtonSize, number> = { sm: 16, md: 16, lg: 20 };

const VARIANT_CLASSES = {
  ghost:
    'text-fg-secondary enabled:hover:bg-graphite enabled:hover:text-fg enabled:active:bg-steel disabled:text-fg-disabled',
  secondary:
    'border border-line bg-graphite text-fg-secondary enabled:hover:bg-steel enabled:hover:text-fg disabled:text-fg-disabled',
} as const;

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'aria-label'
> {
  icon: LucideIcon;
  /** Accessible name, also shown as a tooltip unless `tooltip` is false. */
  label: string;
  size?: IconButtonSize;
  variant?: keyof typeof VARIANT_CLASSES;
  tooltip?: boolean;
  tooltipSide?: TooltipProps['side'];
  shortcut?: readonly string[];
}

export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  variant = 'ghost',
  tooltip = true,
  tooltipSide = 'bottom',
  shortcut,
  type = 'button',
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control transition-colors duration-150 ease-standard disabled:cursor-not-allowed',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      <Icon size={ICON_SIZE[size]} />
    </button>
  );

  if (!tooltip) {
    return button;
  }
  return (
    <Tooltip content={label} side={tooltipSide} {...(shortcut ? { shortcut } : {})}>
      {button}
    </Tooltip>
  );
}
