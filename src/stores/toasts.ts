import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Display time in milliseconds. */
  duration: number;
  /** False while the exit animation plays, just before the toast is removed. */
  open: boolean;
}

export interface ToastOptions {
  description?: string;
  duration?: number;
}

/** Errors stay longer on screen so that they can be read and acted upon. */
export const DEFAULT_TOAST_DURATION: Record<ToastTone, number> = {
  success: 5_000,
  info: 5_000,
  warning: 8_000,
  error: 10_000,
};

export const MAX_VISIBLE_TOASTS = 4;
const EXIT_ANIMATION_MS = 200;

interface ToastState {
  toasts: ToastItem[];
  push: (tone: ToastTone, title: string, options?: ToastOptions) => string;
  close: (id: string) => void;
}

let sequence = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (tone, title, options = {}) => {
    sequence += 1;
    const id = `toast-${sequence}`;
    const item: ToastItem = {
      id,
      tone,
      title,
      duration: options.duration ?? DEFAULT_TOAST_DURATION[tone],
      open: true,
      ...(options.description === undefined ? {} : { description: options.description }),
    };
    set((state) => ({ toasts: [...state.toasts, item].slice(-MAX_VISIBLE_TOASTS) }));
    return id;
  },
  close: (id) => {
    set((state) => ({
      toasts: state.toasts.map((toast) => (toast.id === id ? { ...toast, open: false } : toast)),
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, EXIT_ANIMATION_MS);
  },
}));

/** Shows a notification. Use it for the outcome of user actions (spec §17.2). */
export const toast = {
  success: (title: string, options?: ToastOptions) =>
    useToastStore.getState().push('success', title, options),
  error: (title: string, options?: ToastOptions) =>
    useToastStore.getState().push('error', title, options),
  warning: (title: string, options?: ToastOptions) =>
    useToastStore.getState().push('warning', title, options),
  info: (title: string, options?: ToastOptions) =>
    useToastStore.getState().push('info', title, options),
};
