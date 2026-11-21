import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDesktopBehavior } from './useDesktopBehavior';

function Harness({ enabled }: { enabled: boolean }) {
  useDesktopBehavior(enabled);
  return (
    <div>
      <p>Texte</p>
      <input aria-label="Champ" />
    </div>
  );
}

function dispatch(target: EventTarget, event: Event): boolean {
  return target.dispatchEvent(event);
}

describe('useDesktopBehavior', () => {
  it('blocks reload and print shortcuts', () => {
    render(<Harness enabled />);
    const reload = new KeyboardEvent('keydown', {
      key: 'r',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    expect(dispatch(window, reload)).toBe(false);
    const print = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    expect(dispatch(window, print)).toBe(false);
    const allowed = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    expect(dispatch(window, allowed)).toBe(true);
  });

  it('keeps the context menu in editable fields only', () => {
    render(<Harness enabled />);
    const onText = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    expect(dispatch(screen.getByText('Texte'), onText)).toBe(false);
    const onField = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    expect(dispatch(screen.getByRole('textbox', { name: 'Champ' }), onField)).toBe(true);
  });

  it('does nothing when disabled (development)', () => {
    render(<Harness enabled={false} />);
    const reload = new KeyboardEvent('keydown', {
      key: 'r',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    expect(dispatch(window, reload)).toBe(true);
  });
});
