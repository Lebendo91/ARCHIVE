# ARCHIVE — Suivi de développement

> Document de continuité (spec §22). **Toute session commence par sa lecture**, puis par celle
> d'[ARCHITECTURE.md](ARCHITECTURE.md). Mettre à jour en continu et en fin de phase.

## Phase courante

**Phase 1 — Fondation et design system : implémentée, en attente de validation par le porteur du projet.**
Le travail est sur la branche `phase/1-foundation`. La phase sera close une fois cette branche fusionnée dans
`main`.

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Audit de l'environnement | ✅ Terminée |
| 1 | Fondation et design system | 🟡 Implémentée et testée, en attente de validation |
| 2 | Base de données et stockage local | ⏳ Prochaine |
| 3 | Vue d'ensemble et espaces de travail | À faire |
| 4 | Bibliothèque | À faire |
| 5 | Notes | À faire |
| 6 | Recherche intelligente | À faire |
| 7 | Moteur de mémoire | À faire |
| 8 | Graphe de connaissances et chronologie | À faire |
| 9 | Assistant IA | À faire |
| 10 | Sauvegarde, sécurité, optimisation et packaging | À faire |

---

## Actions en attente du porteur du projet

1. **Valider la Phase 1** : relire les captures de [`docs/screenshots/phase-1/`](docs/screenshots/phase-1)
   ou installer l'application Windows produite par la CI, puis fusionner `phase/1-foundation` dans `main`
   (via une pull request, sur demande).
2. **Choisir l'identifiant d'application** avant toute diffusion. Il est provisoirement fixé à
   `io.github.lebendo91.archive` ; il détermine le dossier de données et ne pourra plus changer ensuite
   (ARCHITECTURE §16).
3. **Signature de marque** : garder « Everything you know. Nothing forgotten. » en anglais (choix actuel,
   affiché dans « À propos »), ou la traduire.

---

## Phase 1 — Fondation et design system

### Tâches réalisées

- [x] **1.1 Socle** : Vite 8, React 19 et TypeScript 6.0 en mode strict ; ESLint 10 typé (règle interdisant
      les couleurs en dur) ; Prettier ; Vitest ; Playwright. Cœur Rust Tauri 2.12 avec les commandes
      `app_info` et `log_frontend_event`. CSP stricte et capability minimale. Fenêtre de 1440×900, minimum
      1100×700. Workflows CI Linux et build Windows.
- [x] **1.2 Jetons de design** : palette de la spec en `@theme` (palettes Tailwind par défaut supprimées),
      échelle typographique, rayons, ombres, animations, mouvement réduit. Polices embarquées. Test de
      conformité à la spec et des contrastes WCAG.
- [x] **1.3 Identité** : symbole original (« A » stratifié, sommet Archive Amber), variante pour fond clair,
      icône d'application et jeu d'icônes Windows (ICO 16 à 256 px), composants `ArchiveMark` et logotype.
- [x] **1.4 Composants** : Button, ButtonLink, IconButton, Input, Card, Dialog, ConfirmDialog, Toaster,
      Tooltip, DropdownMenu, Badge, Kbd, Spinner, Skeleton, EmptyState, ModulePlaceholder, avec tous leurs
      états. Galerie de développement `#/dev/ui`.
- [x] **1.5 Mise en page** :
      - barre latérale repliable (infobulles, sections, état actif, défilement, choix mémorisé) ;
      - barre supérieure (titre `h1`, fil d'Ariane, entrée de recherche indisponible et expliquée, menu du
        profil local) ;
      - 18 écrans routés avec des états vides honnêtes ;
      - Paramètres : la section « À propos » est réelle, alimentée par le runtime natif ; les autres sections
        montrent la configuration actuelle réelle ou les réglages à venir ;
      - page Aide avec la référence des raccourcis, page 404, gestion d'erreurs, lien d'évitement,
        annonces d'accessibilité.
- [x] **1.6 i18n et raccourcis** : dictionnaires fr (référence) et en typés, avec parité testée ; formatage
      Intl (dates, tailles en Ko/Mo) ; gestionnaire de raccourcis (`Ctrl+,`, `Échap`) ; comportement
      d'application de bureau en production.
- [x] **1.7 QA** :
      - 72 captures produites (19 écrans et 5 états, à trois résolutions), avec audit visuel ;
      - axe-core sans violation sur tous les écrans ;
      - binaire natif de production lancé sous Xvfb ;
      - CI GitHub au vert ;
      - documentation à jour.

### Validation (critères de la spec §21, Phase 1)

| Critère | Résultat | Preuve |
|---|---|---|
| L'application démarre | ✅ | Binaire de production Linux lancé sous Xvfb : actif après 12 s, aucune erreur ni violation de CSP (capture `docs/screenshots/phase-1/native-linux-webkitgtk.png`). Windows : voir ci-dessous |
| L'application se construit | ✅ | `npm run build` ; `npm run tauri build -- --no-bundle` (Linux, 2 min 29 s) ; installateurs Windows : voir ci-dessous |
| La navigation fonctionne | ✅ | Tests unitaires et de bout en bout sur tous les écrans, les liens, le fil d'Ariane et `Ctrl+,` |
| La barre latérale fonctionne | ✅ | Repli à 64 px, infobulles, élément actif, mémorisation après rechargement (tests de bout en bout) |
| Mise en page aux deux résolutions de référence | ✅ | 1440×900 et 1280×800, plus le minimum 1100×700 : aucun débordement horizontal (test), captures revues |
| Aucun défaut visuel majeur | ✅ | Audit des captures. Un défaut mineur corrigé (carte « Guide » de l'aide) ; un faux positif expliqué (capture prise pendant une transition) |
| Aucune erreur console critique | ✅ | Chaque test de bout en bout échoue sur toute erreur console ou diagnostic remonté |
| **Build Windows (CI `windows-latest`)** | ⏳ | Résultat à reporter ici dès la fin du workflow « Windows build » |

### Tâches incomplètes et éléments reportés (volontairement, sans simulation)

- **Indicateur de stockage** de la barre latérale (spec §3.3) → Phase 2 : il exige des données réelles.
- **Création rapide** dans la barre supérieure (spec §3.4), **raccourcis d'espaces** et **« Créer un
  espace »** dans la barre latérale → Phase 3 : aucune entité ne peut encore être créée.
- **Choix de la langue** dans les paramètres → Phase 2 : le paramètre doit être persisté en SQLite. Le
  dictionnaire anglais est déjà complet.
- **Recherche globale** (`Ctrl+K`) → Phase 6. L'entrée est visible mais indisponible, avec une explication.

### Fichiers créés

| Zone | Fichiers |
|---|---|
| Outillage | `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `playwright.config.ts`, `index.html` |
| Cœur natif | `src-tauri/Cargo.toml`, `Cargo.lock`, `build.rs`, `tauri.conf.json`, `capabilities/main-window.json`, `src/{main,lib}.rs`, `src/commands/{mod,app,diagnostics}.rs`, `icons/*` |
| Marque | `assets/brand/archive-{mark,mark-on-light,app-icon}.svg`, `public/favicon.svg` |
| Frontend | `src/main.tsx`, `src/app/**` (App, providers, routes, raccourcis), `src/components/{ui,layout,brand,feedback,shortcuts}/**`, `src/modules/**`, `src/i18n/**`, `src/services/**`, `src/stores/**`, `src/hooks/**`, `src/styles/**`, `src/utils/cn.ts` |
| Tests | `src/**/*.test.ts(x)`, `src/test/{setup.ts,render.tsx}`, `tests/e2e/{fixtures,navigation.spec,accessibility.spec,visual.spec}.ts` |
| CI | `.github/workflows/{ci,windows-build}.yml` |
| Documentation | `docs/DESIGN_SYSTEM.md`, `docs/screenshots/phase-1/*.png` |

### Fichiers modifiés

`README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `CLAUDE.md`, `DEVELOPMENT_PROGRESS.md`, `.gitignore`.

### Décisions techniques

Consignées dans [ARCHITECTURE.md §16, « Décisions prises en Phase 1 »](ARCHITECTURE.md). Les principales :
- Radix UI pour les primitives accessibles, et menus non modaux.
- ESLint 10 sans `jsx-a11y` ; l'accessibilité est vérifiée par axe-core.
- `style-src 'unsafe-inline'` justifié dans la CSP, les scripts restant stricts.
- Champs sur Obsidian, pour le contraste des placeholders.
- i18n maison typée.
- Entrée de recherche visible mais indisponible.

### Dépendances ajoutées

- **npm, exécution** : `react`, `react-dom` 19.3 ; `react-router` 8.5 ; `zustand` 5.1 ; `lucide-react` 1.77 ;
  `@tauri-apps/api` 2.12 ; `radix-ui` 1.8 ; `@fontsource-variable/{inter,space-grotesk,jetbrains-mono}` 5.3.
- **npm, développement** : `typescript` ~6.0.3 ; `vite` 8.3 ; `@vitejs/plugin-react` 6.3 ; `tailwindcss` et
  `@tailwindcss/vite` 4.3 ; `@tauri-apps/cli` 2.12 ; `vitest` 5.1 ; `jsdom` 31 ; `@testing-library/{react,dom,
  user-event,jest-dom}` ; `eslint` 10.15 ; `@eslint/js` 10 ; `typescript-eslint` 8.73 ;
  `eslint-plugin-react-hooks` 7.1 ; `globals` ; `prettier` 3.10 ; `@playwright/test` 1.65 ;
  `@axe-core/playwright` 4.14 ; `@types/{react,react-dom,node}`.
- **crates** : `tauri` 2.12, `tauri-build` 2.7, `serde`, `serde_json`.

### Tests exécutés et résultats

| Suite | Commande | Résultat |
|---|---|---|
| Typage | `npm run typecheck` | ✅ 0 erreur |
| Lint | `npm run lint` | ✅ 0 erreur |
| Formatage | `npm run format:check`, `cargo fmt --check` | ✅ |
| Tests unitaires et d'intégration du frontend | `npm test` | ✅ **78/78** (12 fichiers) |
| Bout en bout, mise en page, accessibilité | `npm run test:e2e` | ✅ **33/33** (axe-core WCAG 2.2 A/AA sur 18 écrans et 3 états) |
| Audit visuel | `npm run test:visual` | ✅ 72 captures générées ; principaux écrans revus |
| Clippy | `cargo clippy --all-targets -- -D warnings` | ✅ 0 avertissement |
| Tests Rust | `cargo test` | ✅ **7/7** |
| Build de production | `npm run tauri build -- --no-bundle` | ✅ binaire Linux de 11,5 Mo |
| Fumée native | binaire de production sous `xvfb-run` | ✅ actif après 12 s, sortie d'erreur sans erreur applicative |
| CI GitHub (Ubuntu) | jobs frontend, end-to-end, natif | ✅ tous au vert (commit `d2367d4`) |
| CI GitHub (Windows) | build MSI et NSIS et test de fumée | ⏳ en cours au moment de la rédaction |

### Bugs connus

Aucun.

### Limites restantes

- Le rendu sous **WebView2** et le comportement réel des raccourcis bloqués sous Windows ne sont vérifiables
  que sur Windows : test de fumée et capture en CI, puis recette sur poste réel (audit C3, C11).
- Le bundle JavaScript tient en un seul fichier (493 Ko, 155 Ko compressé). C'est acceptable pour une
  application de bureau chargée depuis le disque ; le découpage par route sera envisagé en Phase 10.
- Les polices embarquent tous leurs sous-ensembles (environ 400 Ko).

---

## Phase 0 — Audit de l'environnement (terminée le 2026-11-21)

Les résultats complets sont dans [docs/ENVIRONMENT_AUDIT.md](docs/ENVIRONMENT_AUDIT.md).

- Environnement : conteneur cloud Ubuntu 24.04, Node 22, Rust 1.97. Les prérequis Tauri ont été installés.
  Sondes réussies : FTS5 en français, compilation de Tauri.
- Dépôt GitHub privé `Lebendo91/ARCHIVE` créé par le porteur ; `main` poussé (`c2bc8bf`).
- **Environnement cloud « archive »** créé. Son script de configuration réinstalle automatiquement les
  dépendances système de Tauri à chaque nouvelle session. Il ne sera vraiment éprouvé qu'au démarrage d'une
  nouvelle session ; à compléter par `npm ci` (voir l'action suivante).

---

## ▶ Action suivante exacte

1. **Si la Phase 1 est validée** (fusion de `phase/1-foundation` dans `main`) : démarrer la **Phase 2 —
   Base de données et stockage local** sur la branche `phase/2-data`, par la **tâche 2.1** :
   - ajouter `rusqlite` (`bundled`) et un module `src-tauri/src/db/` : ouverture de `archive.db` dans le
     dossier de données de l'application ; PRAGMA `foreign_keys`, `journal_mode=WAL`, `synchronous=NORMAL`,
     `busy_timeout` ;
   - écrire le gestionnaire de migrations : fichiers `src-tauri/migrations/NNNN_*.sql` embarqués, table
     `schema_migrations` avec sommes de contrôle, une transaction par migration, copie de sauvegarde avant
     toute migration, mode sans échec en cas d'erreur ;
   - créer la migration `0001_initial.sql` avec les tables du schéma prévisionnel (ARCHITECTURE §6.3) qui
     relèvent de la Phase 2 ;
   - définir l'erreur applicative centralisée `AppError` (`{ code, message }`) ;
   - **valider** avec des tests Rust (base vide, migrations successives, échec simulé, idempotence) et une
     vérification de persistance après redémarrage.
2. Compléter le script de l'environnement cloud par `npm ci` dans le dépôt (via `update_environment`), une fois
   le script vérifié dans une nouvelle session.
3. Décider en Phase 2 (ARCHITECTURE §16) : génération des types (`ts-rs`), cache de données frontend, corbeille.
