import { Link, type LinkProps } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';
import { BUTTON_ICON_SIZE, buttonClasses, type ButtonSize, type ButtonVariant } from './Button';

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}

/** Navigation link styled as a button (a link must not be nested inside a button, nor the reverse). */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses(variant, size), className)} {...props}>
      {Icon ? <Icon size={BUTTON_ICON_SIZE[size]} /> : null}
      {children}
    </Link>
  );
}
