import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUiStore } from '@/stores/ui';
import { mockNativeRuntime, renderApp } from '@/test/render';

function pageTitle() {
  return screen.getByRole('heading', { level: 1 });
}

function mainNavigation() {
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

describe('application shell', () => {
  it('opens on the overview with a contextual greeting and no invented statistics', () => {
    renderApp('/');
    expect(pageTitle()).toHaveTextContent('Vue d’ensemble');
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /^(Bonjour|Bon après-midi|Bonsoir)\. Bienvenue dans ARCHIVE\.$/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vos connaissances, organisées en un seul endroit.'),
    ).toBeInTheDocument();
    expect(document.title).toBe('Vue d’ensemble — ARCHIVE');
  });

  it.each([
    ['Bibliothèque', 'Aucun document pour l’instant'],
    ['Notes', 'Aucune note pour l’instant'],
    ['Graphe de connaissances', 'Aucune relation pour l’instant'],
    ['Chronologie', 'Aucune activité pour l’instant'],
    ['Assistant IA', 'Aucun fournisseur IA configuré'],
    ['Tous les espaces', 'Aucun espace de travail pour l’instant'],
    ['Favoris', 'Aucun favori'],
    ['Récemment ouverts', 'Rien d’ouvert récemment'],
    ['Archives', 'Aucun élément archivé'],
  ])('navigates to "%s" and shows its honest empty state', async (label, emptyTitle) => {
    const { user } = renderApp('/');
    const link = within(mainNavigation()).getByRole('link', { name: label });
    await user.click(link);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 2, name: emptyTitle })).toBeInTheDocument();
    expect(screen.getAllByText('Bientôt disponible').length).toBeGreaterThan(0);
  });

  it('collapses the sidebar to icons with accessible names, and remembers it', async () => {
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }));
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(within(mainNavigation()).queryByText('Bibliothèque')).not.toBeInTheDocument();
    expect(
      within(mainNavigation()).getByRole('link', { name: 'Bibliothèque' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('archive.ui')).toContain('"sidebarCollapsed":true');
    await user.click(screen.getByRole('button', { name: 'Déplier la barre latérale' }));
    expect(within(mainNavigation()).getByText('Bibliothèque')).toBeInTheDocument();
  });

  it('opens the settings with Ctrl+, and shows the breadcrumb', async () => {
    const { user } = renderApp('/');
    await user.keyboard('{Control>},{/Control}');
    expect(pageTitle()).toHaveTextContent('Général');
    const breadcrumb = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(within(breadcrumb).getByRole('link', { name: 'Paramètres' })).toBeInTheDocument();
  });

  it('offers the local profile menu, closed by Escape', async () => {
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Menu du profil' }));
    expect(await screen.findByRole('menuitem', { name: /Aide et raccourcis/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('navigates from the profile menu', async () => {
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Menu du profil' }));
    await user.click(await screen.findByRole('menuitem', { name: /À propos d’ARCHIVE/ }));
    expect(pageTitle()).toHaveTextContent('À propos');
  });

  it('shows the real build information in About when the native runtime answers', async () => {
    mockNativeRuntime();
    renderApp('/settings/about');
    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('abc1234def')).toBeInTheDocument();
    expect(screen.getByText('windows · x86_64')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  it('explains that build information needs the desktop runtime, with a retry', async () => {
    const { user } = renderApp('/settings/about');
    expect(
      await screen.findByText(
        'Les informations de version ne sont disponibles que dans l’application de bureau.',
      ),
    ).toBeInTheDocument();
    mockNativeRuntime();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
  });

  it('keeps the search entry visibly unavailable until search exists', () => {
    renderApp('/');
    const search = screen.getByRole('button', { name: /Rechercher dans ARCHIVE/ });
    expect(search).toHaveAttribute('aria-disabled', 'true');
  });

  it('lists every shortcut with its availability in Help', () => {
    renderApp('/help');
    const table = screen.getByRole('table', { name: 'Raccourcis clavier d’ARCHIVE' });
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(
      within(table).getByRole('row', { name: /Ouvrir les paramètres.*Disponible/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('row', { name: /Recherche globale.*Bientôt disponible/ }),
    ).toBeInTheDocument();
  });

  it('shows a not-found page with a way back', async () => {
    const { user } = renderApp('/does-not-exist');
    expect(pageTitle()).toHaveTextContent('Page introuvable');
    await user.click(screen.getByRole('link', { name: 'Retour à la vue d’ensemble' }));
    expect(pageTitle()).toHaveTextContent('Vue d’ensemble');
  });

  it('offers a skip link that moves the focus to the main content', async () => {
    const { user } = renderApp('/');
    await user.tab();
    const skip = screen.getByRole('button', { name: 'Aller au contenu principal' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
