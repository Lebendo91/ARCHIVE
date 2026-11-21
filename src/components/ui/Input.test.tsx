import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { Input } from './Input';

describe('Input', () => {
  it('associates its label and hint', () => {
    renderWithProviders(<Input label="Nom" hint="Visible dans la barre latérale." />);
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAccessibleDescription('Visible dans la barre latérale.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('announces errors', () => {
    renderWithProviders(<Input label="Nom" error="Ce champ est obligatoire." />);
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Ce champ est obligatoire.');
  });

  it('keeps a visually hidden label accessible', () => {
    renderWithProviders(<Input label="Recherche" hideLabel />);
    expect(screen.getByLabelText('Recherche')).toBeInTheDocument();
    expect(screen.getByText('Recherche')).toHaveClass('sr-only');
  });
});
