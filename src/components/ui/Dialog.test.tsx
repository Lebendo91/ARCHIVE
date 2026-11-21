import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog, DialogContent, DialogTrigger } from './Dialog';

describe('Dialog', () => {
  it('opens from its trigger, closes with Escape and returns the focus', async () => {
    const { user } = renderWithProviders(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Renommer</Button>
        </DialogTrigger>
        <DialogContent title="Renommer le document" description="Le nom d’origine est conservé.">
          <p>Contenu</p>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Renommer' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Renommer le document' });
    expect(dialog).toHaveAccessibleDescription('Le nom d’origine est conservé.');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('closes with its close button', async () => {
    const { user } = renderWithProviders(
      <Dialog defaultOpen>
        <DialogContent title="Informations" />
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Supprimer ce document ?"
        description="Le fichier d’origine n’est pas touché."
        confirmLabel="Supprimer"
        onConfirm={onConfirm}
      />
    );
  }

  it('focuses "Cancel" first for destructive actions', async () => {
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
  });

  it('confirms only on explicit action', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('closes without confirming on "Cancel"', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
