import { screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { Button } from './Button';
import { IconButton } from './IconButton';

describe('Button', () => {
  it('is a non-submitting button that reports clicks', async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(
      <Button icon={Plus} onClick={onClick}>
        Nouvelle note
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Nouvelle note' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading, and ignores clicks', async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(
      <Button loading onClick={onClick}>
        Enregistrer
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Enregistrer' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses Obsidian text on the amber primary variant (contrast rule)', () => {
    renderWithProviders(<Button variant="primary">Importer</Button>);
    expect(screen.getByRole('button', { name: 'Importer' })).toHaveClass(
      'bg-amber',
      'text-obsidian',
    );
  });
});

describe('IconButton', () => {
  it('exposes its label as accessible name and shows it as a tooltip on focus', async () => {
    const { user } = renderWithProviders(<IconButton icon={Plus} label="Ajouter" />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Ajouter');
  });
});
