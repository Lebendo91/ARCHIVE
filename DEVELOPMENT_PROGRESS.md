# ARCHIVE — Suivi de développement

> Document de continuité (spec §22). **Toute session commence par sa lecture**, puis par celle
> d'[ARCHITECTURE.md](ARCHITECTURE.md). Mettre à jour en continu et en fin de phase.

## Phase courante

**Phase 3 — Vue d'ensemble et espaces de travail : en cours** (branche `phase/3-workspaces`).
La Phase 2 est terminée : validée localement, CI Linux et Windows au vert (run 44904532543 et 44904532541,
commit `739082f`), fusionnée dans `main` le 2026-11-21. Le porteur du projet a demandé l'enchaînement autonome des
phases ; une reprise automatique est programmée après chaque réinitialisation de sa limite d'utilisation.

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Audit de l'environnement | ✅ Terminée |
| 1 | Fondation et design system | ✅ Terminée et validée |
| 2 | Base de données et stockage local | ✅ Terminée |
| 3 | Vue d'ensemble et espaces de travail | 🔄 En cours |
| 4 | Bibliothèque | À faire |
| 5 | Notes | À faire |
| 6 | Recherche intelligente | À faire |
| 7 | Moteur de mémoire | À faire |
| 8 | Graphe de connaissances et chronologie | À faire |
| 9 | Assistant IA | À faire |
| 10 | Sauvegarde, sécurité, optimisation et packaging | À faire |

---

## Actions en attente du porteur du projet

1. **Choisir l'identifiant d'application** avant toute diffusion. Il est provisoirement fixé à
   `io.github.lebendo91.archive` ; il détermine le dossier de données et ne pourra plus changer ensuite
   (ARCHITECTURE §16).
2. **Signature de marque** : garder « Everything you know. Nothing forgotten. » en anglais (choix actuel,
   affiché dans « À propos »), ou la traduire.

---

## Phase 2 — Base de données et stockage local (terminée le 2026-11-21)

### Tâches réalisées

- [x] **2.1** SQLite (`rusqlite` embarqué, WAL, une connexion d'écriture et deux en lecture seule), gestionnaire de
      migrations (sommes de contrôle, copie `VACUUM INTO` avant migration, refus des bases plus récentes,
      annulation complète en cas d'échec), migration `0001_initial.sql`, erreur centralisée `AppError`
      (`{ code, message }`), journal rotatif `logs/archive.log`, mode sans échec.
- [x] **2.2** Dépôts : workspaces, folders, tags, notes (révisions, corbeille), documents (doublons par empreinte,
      corbeille, texte extrait séparé), relations (origine, statut, confiance, provenance), timeline, settings.
- [x] **2.3** Stockage des fichiers : copie atomique en lecture seule de la source, SHA-256 en flux, chemins dérivés
      d'identifiants validés, usage, nettoyage de `tmp/`, ouverture des dossiers (`tauri-plugin-opener`, côté
      Rust), espace disque réel (`fs4`).
- [x] **2.4** Frontend : types générés (`ts-rs` vers `src/types/bindings`), table de commandes typée, TanStack
      Query, démarrage qui attend le statut et les paramètres, langue persistée, Paramètres › Stockage réels,
      indicateur de stockage dans la barre latérale, écran du mode sans échec, messages d'erreur par code.
- [x] **2.5** Validation locale complète (ci-dessous) et documentation (ARCHITECTURE, CHANGELOG, captures
      `docs/screenshots/phase-2/`).

### Validation (critères de la spec §21, Phase 2)

| Critère | Résultat | Preuve |
|---|---|---|
| Créer, lire, modifier des enregistrements | ✅ | Tests Rust de chaque dépôt |
| Supprimer de façon sûre | ✅ | Espace ou dossier non vide refusé, corbeille avant purge, relations nettoyées, original jamais touché |
| Redémarrer l'application, vérifier la persistance | ✅ | Binaire natif relancé trois fois sous Xvfb avec `ARCHIVE_DATA_DIR` : langue enregistrée relue au démarrage (interface en anglais, capture `native-relaunch-english.png`), aucune migration ni copie inutile à la relance ; test Rust de réouverture |
| Comportement des migrations | ✅ | 7 tests (base vide, idempotence, sauvegarde préalable, échec annulé, migration modifiée, base trop récente, fins de ligne) ; premier lancement natif : migration v1 appliquée, 13 tables |
| Mode sans échec | ✅ | Base corrompue : l'application démarre, explique la cause et ne modifie pas le fichier (test Rust, test de bout en bout, capture native) |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` (dont les tests d'export `ts-rs`) | ✅ 98/98 |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 86/86 |
| `npm run test:e2e` (dont axe-core sur le mode sans échec et la page Stockage) | ✅ 37/37 |
| `npm run test:visual` | ✅ captures revues ; deux défauts corrigés (vide sous les boutons du mode sans échec, double état actif dans la barre latérale) |
| Build natif de production (`tauri build --no-bundle`) et trois lancements sous Xvfb | ✅ aucune erreur d'interface ni violation de CSP dans le journal |
| CI GitHub (Linux et Windows) | ✅ frontend, bout en bout, cœur natif (avec types générés à jour), build Windows et test de fumée (commit `739082f`) |

### Dépendances ajoutées

- **crates** : `rusqlite` 0.43 (`bundled`), `uuid` 1.29 (`v7`), `sha2` 0.11, `hex`, `thiserror` 2, `log`, `fs4` 1.1,
  `ts-rs` 12, `tauri-plugin-log` 2.10, `tauri-plugin-opener` 2.7 ; en développement, `tempfile`.
  La version minimale de Rust passe à 1.90 (exigence de ces crates).
- **npm** : `@tanstack/react-query` 5.108.

### Limites restantes

- L'ouverture des dossiers dans l'Explorateur n'a pas pu être exercée dans le conteneur, faute de gestionnaire de
  fichiers. Le chemin d'erreur est testé (notification explicite) ; à vérifier sous Windows.
- Les dépôts des documents, notes, étiquettes et relations ne sont pas encore exposés par des commandes. Ils le
  seront avec leurs écrans (Phases 3 à 5).
- Pas encore de tests de bout en bout pilotant l'application native (WebDriver) : la persistance est validée par
  des lancements scriptés sous Xvfb.

---

## Phase 1 — Fondation et design system (terminée, validée le 2026-11-21)

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
| L'application démarre | ✅ | **Windows** : test de fumée sur `windows-latest` (WebView2), application active après 20 s. **Linux** : binaire de production lancé sous Xvfb, actif après 12 s, sans erreur ni violation de CSP (capture `docs/screenshots/phase-1/native-linux-webkitgtk.png`) |
| L'application se construit | ✅ | **Windows** : installateurs MSI et NSIS produits par la CI en 6 min (artefact de 5,3 Mo, run 44900350768). **Linux** : `npm run tauri build -- --no-bundle` en 2 min 29 s. Frontend : `npm run build` |
| La navigation fonctionne | ✅ | Tests unitaires et de bout en bout sur tous les écrans, les liens, le fil d'Ariane et `Ctrl+,` |
| La barre latérale fonctionne | ✅ | Repli à 64 px, infobulles, élément actif, mémorisation après rechargement (tests de bout en bout) |
| Mise en page aux deux résolutions de référence | ✅ | 1440×900 et 1280×800, plus le minimum 1100×700 : aucun débordement horizontal (test), captures revues |
| Aucun défaut visuel majeur | ✅ | Audit des captures. Un défaut mineur corrigé (carte « Guide » de l'aide) ; un faux positif expliqué (capture prise pendant une transition) |
| Aucune erreur console critique | ✅ | Chaque test de bout en bout échoue sur toute erreur console ou diagnostic remonté |

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
| CI GitHub (Windows) | build MSI et NSIS, test de fumée | ✅ succès en 6 min (run 44900350768, commit `d2367d4`) : installateurs et capture publiés en artefacts |

### Bugs connus

Aucun.

### Limites restantes

- Le démarrage sous Windows est prouvé par la CI. En revanche, la **capture WebView2** et les
  **installateurs** ne sont pas téléchargeables depuis la session cloud : GitHub les sert depuis un stockage
  Azure (`*.blob.core.windows.net`) que la politique réseau refuse. Le porteur du projet les récupère depuis
  l'onglet *Actions* de GitHub. Le comportement réel des raccourcis bloqués sous WebView2 reste à vérifier
  lors de la recette sur un poste Windows (audit C3, C11).
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

**Phase 3 — Vue d'ensemble et espaces de travail**, branche `phase/3-workspaces`. Prochaine tâche : **3.1**.

| # | Tâche |
|---|---|
| **3.1** | Commandes Rust `workspaces_*` : liste avec compteurs réels, création, modification, archivage et restauration, suppression avec réaffectation explicite des ressources vers un autre espace ou « sans espace » ; événements de chronologie (`workspace_created`, `resource_archived`, `resource_restored`) ; commande `dashboard_overview` (statistiques réelles : documents, notes, espaces, stockage, éléments indexés récemment, activité récente, favoris) |
| 3.2 | Écran « Espaces de travail » : grille, création et édition (nom, description, couleur parmi les jetons, icône parmi une sélection Lucide), archivage, suppression protégée (explication, choix de destination, confirmation) |
| 3.3 | Tableau de bord d'un espace (`/workspaces/:id`) : description, compteurs, activité récente, favoris, actions disponibles |
| 3.4 | Barre latérale : raccourcis des espaces actifs et « Créer un espace » ; menu « Création rapide » dans la barre supérieure ; `Ctrl+Maj+N` disponible |
| 3.5 | Vue d'ensemble réelle : statistiques, activité récente, récemment ouverts, favoris, avec des états vides honnêtes ; accueil d'une première installation (spec §6.2), sans contenu fictif |
| 3.6 | Validation : tests Rust, unitaires, de bout en bout et d'accessibilité ; persistance native ; audit visuel ; documentation ; CI ; fusion |
