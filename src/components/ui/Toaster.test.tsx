import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MAX_VISIBLE_TOASTS, toast, useToastStore } from '@/stores/toasts';
import { renderWithProviders } from '@/test/render';
import { Toaster } from './Toaster';

describe('Toaster', () => {
  it('shows a notification with its description and dismisses it on request', async () => {
    const { user } = renderWithProviders(<Toaster />);
    act(() => {
      toast.success('Document importé', { description: 'cours-ne555.pdf' });
    });
    expect(await screen.findByText('Document importé')).toBeInTheDocument();
    expect(screen.getByText('cours-ne555.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  it('keeps errors on screen longer than successes', () => {
    act(() => {
      toast.success('Ok');
      toast.error('Échec');
    });
    const [success, error] = useToastStore.getState().toasts;
    expect(error?.duration).toBeGreaterThan(success?.duration ?? Infinity);
  });

  it('never stacks more than the maximum number of notifications', () => {
    act(() => {
      for (let index = 0; index < MAX_VISIBLE_TOASTS + 3; index += 1) {
        toast.info(`Message ${String(index)}`);
      }
    });
    expect(useToastStore.getState().toasts).toHaveLength(MAX_VISIBLE_TOASTS);
  });
});
