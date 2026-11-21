import type { LucideIcon } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/utils/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE_CLASSES =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors duration-150 ease-standard disabled:cursor-not-allowed';

/** Accent backgrounds always carry Obsidian text: light text on them fails WCAG AA (ARCHITECTURE §4.4). */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-amber text-obsidian enabled:hover:bg-amber/90 enabled:active:bg-amber/80 disabled:bg-graphite disabled:text-fg-disabled',
  secondary:
    'border border-line bg-graphite text-fg enabled:hover:bg-steel enabled:active:bg-steel/70 disabled:border-line-subtle disabled:text-fg-disabled',
  ghost:
    'text-fg-secondary enabled:hover:bg-graphite enabled:hover:text-fg enabled:active:bg-steel disabled:text-fg-disabled',
  danger:
    'bg-danger text-obsidian enabled:hover:bg-danger/90 enabled:active:bg-danger/80 disabled:bg-graphite disabled:text-fg-disabled',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-sm',
};

/** Icon sizes follow the specification: 14 px compact, 16 px standard controls, 20 px primary actions. */
export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 20 };

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
): string {
  return cn(BASE_CLASSES, SIZE_CLASSES[size], VARIANT_CLASSES[variant]);
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  /** Shows a spinner, disables the button and marks it busy. The label stays to avoid layout shifts. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconPosition = 'start',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  const iconSize = BUTTON_ICON_SIZE[size];
  const startIcon = loading ? (
    <Spinner size={iconSize} />
  ) : Icon && iconPosition === 'start' ? (
    <Icon size={iconSize} />
  ) : null;
  const endIcon = !loading && Icon && iconPosition === 'end' ? <Icon size={iconSize} /> : null;

  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
