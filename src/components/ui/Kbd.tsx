import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-steel px-1 font-mono text-2xs font-medium text-fg-secondary">
      {children}
    </kbd>
  );
}

/** Renders a key combination such as Ctrl + K as separate keys. */
export function KeyCombo({ keys }: { keys: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
