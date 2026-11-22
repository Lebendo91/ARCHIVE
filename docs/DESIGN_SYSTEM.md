# ARCHIVE — Design system « Obsidian Knowledge Systems »

> Référence de conception et d'implémentation de l'interface (Phase 1). Source unique des valeurs :
> [`src/styles/tokens.css`](../src/styles/tokens.css). Composants : [`src/components/ui/`](../src/components/ui).
> En développement, la galerie `#/dev/ui` montre chaque composant dans chacun de ses états. Elle est absente
> des builds de production.

## 1. Couleurs

Les jetons reprennent **exactement** la palette obligatoire de la spécification (§2.3). Le test
`src/styles/contrast.test.ts` vérifie cette égalité à chaque exécution. Les palettes par défaut de Tailwind
sont supprimées : seules ces couleurs existent, et ESLint interdit les valeurs hexadécimales dans le code
TypeScript.

| Spécification | Valeur | Jeton CSS | Classes Tailwind |
|---|---|---|---|
| Obsidian | #090B0F | `--color-obsidian` | `bg-obsidian`, `text-obsidian` |
| Carbon | #10141A | `--color-carbon` | `bg-carbon` |
| Graphite | #171D25 | `--color-graphite` | `bg-graphite` |
| Steel | #222B36 | `--color-steel` | `bg-steel` |
| Border | #2A3441 | `--color-line` | `border-line` |
| Border subtle | #202833 | `--color-line-subtle` | `border-line-subtle` |
| Primary text | #F1F4F8 | `--color-fg` | `text-fg` |
| Secondary text | #A3ADBA | `--color-fg-secondary` | `text-fg-secondary` |
| Muted text | #6F7B89 | `--color-fg-muted` | `text-fg-muted` |
| Disabled text | #4D5865 | `--color-fg-disabled` | `text-fg-disabled` |
| Archive Amber | #D6A45D | `--color-amber` | `bg-amber`, `text-amber` |
| Electric Blue | #67A9E8 | `--color-blue` | `text-blue`, `outline-blue` |
| Soft Cyan | #6FCBC7 | `--color-cyan` | `text-cyan` |
| Purple | #A995E8 | `--color-purple` | `text-purple` |
| Success / Warning / Danger / Information | #43B989 / #E8B45B / #E46C72 / #67A9E8 | `--color-success`… | `text-success`… |

**Rôles** : Obsidian pour le fond, Carbon pour la navigation, Graphite pour les cartes, Steel pour les survols et
les éléments surélevés. Amber est l'accent de marque (élément de navigation actif, action principale). Blue
désigne l'interaction (focus, liens). Cyan est réservé à l'intelligence (assistant), Purple aux relations
(graphe, et liens internes d'une note vers une autre note ou un document, soulignés en pointillés). Les couleurs sémantiques ne servent qu'à signaler des états.

**Règles de contraste** (WCAG 2.2 AA, vérifiées par test et par axe-core) :

1. **Muted** n'est autorisé pour du petit texte que sur **Obsidian** (4,57:1). Sur Carbon, Graphite ou Steel,
   on utilise **Secondary**.
2. Les **boutons pleins** sur Amber ou Danger portent un texte **Obsidian**. Le texte clair échoue (environ 2:1).
3. Les **champs de saisie** reposent sur Obsidian, ce qui garantit des placeholders Muted à 4,57:1.
4. L'**anneau de focus** est un contour Electric Blue de 2 px, décalé de 2 px, visible sur toutes les surfaces.

## 2. Typographie

Polices embarquées (`@fontsource-variable`), sans aucune requête réseau à l'exécution :

| Rôle | Police | Classe |
|---|---|---|
| Interface, texte courant | Inter | `font-sans` (défaut) |
| Titres, marque, statistiques | Space Grotesk | `font-display` |
| Chemins, identifiants, code, raccourcis | JetBrains Mono | `font-mono` |

Échelle (dense, pour le bureau) : `text-2xs` 11 px · `text-xs` 12 · `text-sm` **13 (défaut)** · `text-base` 14 ·
`text-lg` 17 · `text-xl` 20 · `text-2xl` 24 · `text-3xl` 30 · `text-4xl` 36. Les libellés de section sont en
`text-2xs`, semi-gras, en majuscules, avec `tracking-label`, en Secondary. Le logotype utilise `tracking-brand`.

## 3. Espacements, rayons, dimensions

- **Espacements** : l'unité Tailwind vaut 4 px. Seuls les pas `1, 2, 3, 4, 5, 6, 8, 10, 12, 16`
  (4 à 64 px, spec §3.5) sont autorisés. Une seule exception : le padding vertical du contenu (`py-7`, 28 px),
  fixé par la spec §3.2.
- **Rayons** : `rounded-control` 7 px (boutons, champs), `rounded-card` 10 px, `rounded-modal` 12 px,
  `rounded-sm` 4 px (touches clavier), `rounded-full` (badges, avatars).
- **Mise en page** : barre latérale de 248 px (64 px repliée), barre supérieure de 64 px, contenu en
  `px-8 py-7`. La fenêtre mesure au minimum 1100×700 ; en dessous, la page défile au lieu de se chevaucher.

## 4. Mouvement

Survol en 150 ms, transitions de 150 à 200 ms, dialogues en 200 ms, avec la courbe `ease-standard`. Avec
`prefers-reduced-motion`, toutes les animations et transitions deviennent instantanées. Pas d'animation
décorative, pas d'animation continue en dehors des indicateurs de chargement.

## 5. Icônes

Lucide exclusivement, avec un trait uniforme de 1,75 (règle CSS globale). Tailles : 14 px pour les
métadonnées et les boutons compacts, 16 px pour les contrôles standards, 18 px pour la navigation, 20 px pour
les actions principales, 24 px pour les états vides.

## 6. Logo

Le symbole d'ARCHIVE est un « A » géométrique découpé en strates de connaissance, dont le sommet est en Archive
Amber. Sur une grille de 48 unités, tous les interstices mesurent 4 unités et les bords intérieurs sont
parallèles aux bords extérieurs.

| Fichier | Usage |
|---|---|
| [`assets/brand/archive-mark.svg`](../assets/brand/archive-mark.svg) | Symbole sur fond sombre (favicon, documentation) |
| [`assets/brand/archive-mark-on-light.svg`](../assets/brand/archive-mark-on-light.svg) | Symbole sur fond clair |
| [`assets/brand/archive-app-icon.svg`](../assets/brand/archive-app-icon.svg) | Source de l'icône Windows (`npx tauri icon`) |
| `src/components/brand/ArchiveMark.tsx` | Symbole et logotype dans l'interface (géométrie vérifiée par test) |

Ne jamais déformer le symbole, en changer les couleurs ou l'utiliser à moins de 16 px.

## 7. Composants

| Composant | Variantes et états | Notes d'usage |
|---|---|---|
| `Button` | primary, secondary, ghost, danger ; sm, md, lg ; hover, active, focus, disabled, loading | `type="button"` par défaut ; en chargement, le bouton est désactivé, marqué `aria-busy`, et le libellé reste en place |
| `ButtonLink` | mêmes variantes | Navigation présentée comme un bouton (jamais un lien dans un bouton) |
| `IconButton` | ghost, secondary ; sm, md, lg | `label` obligatoire : nom accessible et infobulle |
| `Input` | défaut, erreur, désactivé, avec icône | Libellé associé, aide et erreur reliées par `aria-describedby` |
| `Card`, `CardHeader` | padding none, md, lg | Surface Graphite avec bordure subtile |
| `Dialog`, `ConfirmDialog` | sm, md, lg | Focus piégé, Échap, retour du focus ; en mode destructif, le focus initial est sur « Annuler » |
| `Toaster` + `toast.*()` | success, error, warning, info | Les erreurs restent 10 s ; 4 notifications au maximum ; annoncées aux lecteurs d'écran |
| `Tooltip` | 4 côtés, raccourci optionnel | Au survol et au focus clavier |
| `DropdownMenu` | éléments avec icône et raccourci, séparateurs, libellés | Non modal (motif WAI-ARIA « menu button ») |
| `Badge` | neutral, brand, info, success, warning, danger, intelligence, relations | Statuts, disponibilité |
| `Kbd`, `KeyCombo` | — | Touches localisées (« Maj », « Échap ») |
| `Spinner`, `Skeleton` | tailles ; surface base ou raised | Uniquement pendant un chargement réel |
| `EmptyState` | tonalités d'icône | Explique la situation et l'étape suivante (spec §17.4) |
| `ModulePlaceholder` | un par module | État honnête d'un module pas encore livré : jamais de contenu simulé |

## 8. Principes d'interaction

- **Aucun bouton mort.** Une action indisponible est absente, ou désactivée avec une explication (par exemple
  l'entrée de recherche, désactivée jusqu'à la Phase 6).
- **Aucune donnée inventée.** Pas de statistique, de graphe ni de document fictif.
- **Destruction confirmée.** `ConfirmDialog`, qui rappelle ce qui est conservé (le fichier d'origine).
- **Comportement d'application de bureau en production.** Rechargement et impression désactivés, menu
  contextuel natif limité aux champs et au texte sélectionné.
