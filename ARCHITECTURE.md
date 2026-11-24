# ARCHIVE — Architecture

> **Statut : Phases 1 à 9 implémentées (fondation, design system, données et stockage local, vue d'ensemble et
> espaces de travail, Bibliothèque, Notes, recherche plein texte, moteur de mémoire, graphe de connaissances et
> chronologie, assistant IA). Les sections des phases suivantes restent l'architecture cible.** Chaque section indique la phase qui la réalise. Quand une décision est implémentée, son statut passe de
> *Prévu* à *Implémenté (Phase N)*. Toute décision qui s'écarte de ce document doit y être reportée avec sa
> justification.
>
> Références : [cahier des charges](docs/SPECIFICATION.md) · [audit d'environnement](docs/ENVIRONMENT_AUDIT.md) ·
> [suivi](DEVELOPMENT_PROGRESS.md)

---

## 1. Vue d'ensemble

```text
┌──────────────────────────────── Application ARCHIVE (Tauri 2) ─────────────────────────────────┐
│                                                                                                │
│  WebView (WebView2 sous Windows)                  Cœur natif Rust (processus principal)        │
│  ┌────────────────────────────────┐   IPC typé    ┌─────────────────────────────────────────┐  │
│  │ React 19 + TypeScript          │   invoke()    │ commands/  validation des entrées        │  │
│  │  modules/     écrans           │ ────────────► │ services/  règles métier, transactions   │  │
│  │  components/  design system    │ ◄──────────── │ db/        SQLite, migrations, FTS5      │  │
│  │  services/    clients IPC      │  événements,  │ storage/   fichiers gérés, empreintes    │  │
│  │  stores/      état d'interface │  canaux       │ pipeline/  import, extraction, file      │  │
│  └────────────────────────────────┘               │ ai/        fournisseurs IA (HTTPS)       │  │
│   Aucun accès direct au disque, à la base         │ secrets/   gestionnaire d'identifiants   │  │
│   ni au réseau (CSP + capabilities minimales)     └───────────────────┬─────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┼────────────────────────┘
                                                                        │
             Dossier de données de l'application ◄──────────────────────┤  archive.db, files/, backups/, logs/
             Windows Credential Manager          ◄──────────────────────┤  clés API (jamais en base)
             Fournisseur IA (HTTPS)              ◄──────────────────────┘  uniquement sur action explicite
```

**Principe directeur : le frontend présente, le cœur Rust possède les données.** La WebView n'a accès ni au
système de fichiers, ni à la base, ni au réseau. Toute opération passe par une commande Rust déclarée
explicitement, qui valide ses entrées (spec §18.3).

## 2. Stack technique confirmée

| Domaine | Choix | Version | Justification |
|---|---|---|---|
| Desktop | Tauri 2 | 2.12 | WebView système légère, modèle de permissions par capabilities, cœur natif en Rust |
| Langage natif | Rust, édition 2024 | 1.97 stable | Sécurité mémoire, performances, écosystème Tauri |
| Interface | React | 19.3 | Imposé par la spec |
| Langage UI | TypeScript, mode strict | **6.0.x** | TS 7 est incompatible avec `typescript-eslint` (audit C5) |
| Build frontend | Vite + `@vitejs/plugin-react` | 8.3 / 6.3 | Imposé par la spec |
| Styles | Tailwind CSS v4 (`@tailwindcss/vite`) | 4.3 | Configuration CSS-first : les jetons de la spec deviennent des variables `@theme` |
| Icônes | `lucide-react` | 1.77 | Imposé ; bibliothèque unique |
| Routage | React Router, `createHashRouter` | 8.5 | Comportement identique sous Vite, dans Tauri et dans Playwright, sans repli serveur |
| État global | Zustand | 5.1 | État d'interface transversal uniquement |
| Base de données | SQLite via `rusqlite` (`bundled`) | 0.43 / SQLite 3.54 | FTS5 inclus (sonde validée), même moteur sous Linux et Windows |
| Recherche | SQLite FTS5 | — | `unicode61 remove_diacritics 2` (accents) et `trigram` (sous-chaînes) |
| Éditeur | TipTap 3 | 3.33.1 (exacte) | Notes (Phase 5) ; aperçu Markdown de la Bibliothèque |
| IA (réseau) | `reqwest` (rustls, cryptographie `ring`, vérificateur du système) | 0.13.5 | Appels HTTPS des fournisseurs depuis le cœur uniquement, en flux ; aucun OpenSSL (Phase 9, §11) |
| IA (clés) | `keyring-core` + `windows-native-keyring-store` | 1.0.1 (exacte) / 1.1 | Clés API dans le Gestionnaire d'identifiants de Windows ; repli en mémoire pour la session (Phase 9, §11.3) |
| Rendu des réponses | `marked` (analyse seule, rendu React sans HTML) | 17.0.6 (exacte) | Markdown des réponses de l'assistant ; déjà présent via `@tiptap/markdown` (Phase 9) |
| Graphe | `d3-force` (disposition) + SVG dessiné par React | 3.0.1 (exacte) | Rendu 2D sans WebGL ; chaque nœud est un élément du DOM, stylé par les jetons et atteignable au clavier ; disposition calculée dans un Web Worker (Phase 8, voir §10 ; Cytoscape.js écarté) |
| PDF | `pdfjs-dist` | 6.5 | Aperçu, et candidat pour l'extraction (Phase 4) |
| Polices | `@fontsource-variable` : Inter, Space Grotesk, JetBrains Mono | 5.3 | Fichiers embarqués, aucune requête réseau à l'exécution |
| Tests | Vitest 5, React Testing Library 16, jsdom, Playwright, `cargo test` | — | Voir §13 |
| Primitives accessibles | Radix UI (`radix-ui`) | 1.8 | Dialogues, menus, infobulles et notifications : focus, clavier et ARIA conformes, stylés avec les jetons. Ajouté en Phase 1 |
| Qualité | ESLint 10 + `typescript-eslint` + `react-hooks`, Prettier, `rustfmt`, `clippy` | — | `eslint-plugin-jsx-a11y` écarté : il ne supporte pas ESLint 10, et ESLint 9 est en fin de vie |
| Accessibilité | `@axe-core/playwright` | 4.14 | Audit WCAG 2.2 A/AA à l'exécution, sur chaque écran |
| Données côté interface | TanStack Query | 5.108 | Cache, états de chargement et d'erreur, invalidation après mutation (Phase 2) |
| Types partagés | `ts-rs` | 12 | Types TypeScript générés depuis Rust par `cargo test` dans `src/types/bindings`, vérifiés par la CI (Phase 2) |
| Journal, ouverture de dossiers, espace disque | `tauri-plugin-log`, `tauri-plugin-opener` (côté Rust uniquement), `fs4` | 2.10 / 2.7 / 1.1 | Journal rotatif dans `logs/`, ouverture des dossiers dans l'Explorateur, espace libre réel (Phase 2) |
| Paquets | npm | 10.9 | Universel, rien à installer en plus sur la CI Windows |
| CI/CD | GitHub Actions | — | Ubuntu pour les contrôles, `windows-latest` pour les installateurs |

## 3. Structure du dépôt (cible)

```text
archive/
├── src/                          # Frontend React
│   ├── app/                      # App.tsx, router/, providers/
│   ├── components/
│   │   ├── ui/                   # Button, Input, Card, Dialog, Toast, Tooltip, Spinner, EmptyState…
│   │   ├── layout/               # AppShell, Sidebar, Topbar, PageHeader
│   │   ├── navigation/  documents/  notes/  feedback/
│   ├── modules/                  # Un dossier par module : écrans et logique de présentation
│   │   ├── dashboard/  library/  notes/  search/  knowledge-graph/
│   │   └── workspaces/  timeline/  assistant/  settings/
│   ├── services/                 # Clients IPC typés, un par domaine (documents, notes, search…)
│   ├── stores/  hooks/  types/  utils/
│   ├── i18n/                     # fr.ts (référence), en.ts, formatage Intl
│   └── styles/                   # tokens.css (@theme), base.css
├── src-tauri/                    # Cœur natif Rust
│   ├── src/
│   │   ├── lib.rs / main.rs      # Démarrage, enregistrement des commandes et des plugins
│   │   ├── commands/             # Frontière IPC : validation, conversion des erreurs
│   │   ├── db/                   # Connexions, migrations, dépôts (repositories)
│   │   ├── storage/              # Fichiers gérés, chemins, empreintes
│   │   ├── pipeline/             # Import, extraction, normalisation, file de traitement
│   │   ├── search/  relations/  ai/  secrets/  backup/
│   │   └── error.rs              # Erreur applicative centralisée
│   ├── migrations/               # SQL versionné, embarqué à la compilation
│   ├── capabilities/  icons/
│   └── tauri.conf.json
├── tests/e2e/                    # Playwright : navigation, accessibilité (axe-core), captures d'audit visuel
├── tests/fixtures/               # Fichiers d'essai réels et générateurs de jeux de données
├── assets/brand/                 # Logo SVG source et déclinaisons
├── docs/                         # SPECIFICATION.md, ENVIRONMENT_AUDIT.md, DESIGN_SYSTEM.md, screenshots/,
│                                 # USER_GUIDE.md (Phase 10)
├── .github/workflows/            # ci.yml, windows-build.yml
└── CLAUDE.md, DEVELOPMENT_PROGRESS.md, ARCHITECTURE.md, CHANGELOG.md, README.md
```

**Écarts assumés par rapport à la structure proposée (spec §4.4) :**

1. **Migrations dans `src-tauri/migrations/`** et non dans `database/migrations/`. Elles sont compilées dans le
   binaire Rust (`include_str!`). Les placer à côté de la crate garantit des chemins stables et une détection
   fiable des changements par Cargo, sans aucun fichier à livrer à l'exécution.
2. **Pas de `src/services/database/` ni de `src/services/indexing/` côté frontend.** La WebView ne parle jamais
   directement à la base (voir §12). La base et l'indexation vivent dans le cœur Rust, et les services frontend
   sont de fins clients IPC par domaine.
3. **Ajouts :** `src/i18n/` (français principal, architecture prête pour l'internationalisation),
   `assets/brand/`, `.github/workflows/` (développement 100 % cloud) et `CLAUDE.md` (continuité entre sessions).

## 4. Frontend — *Implémenté (Phases 1 à 8)*

### 4.1 Responsabilités

- Rendu, interactions, navigation, raccourcis clavier, état d'interface.
- **Aucune règle métier persistante** : détection de doublons, règles de suppression ou indexation relèvent du
  cœur Rust (spec §23).
- Les composants de présentation n'appellent jamais `invoke` directement. Ils passent par `src/services/*`
  (clients typés) et par des hooks.

### 4.2 Routage

| Route | Écran | Phase fonctionnelle |
|---|---|---|
| `/` | Vue d'ensemble | 3 |
| `/library`, `/library/:documentId` | Bibliothèque, aperçu de document | 4 |
| `/notes`, `/notes/:noteId` | Notes, éditeur | 5 |
| `/search` | Résultats de recherche, recherches récentes | 6 |
| `/graph` | Graphe de connaissances | 8 |
| `/timeline` | Chronologie | 8 |
| `/assistant` | Assistant IA | 9 |
| `/workspaces`, `/workspaces/:workspaceId` | Espaces de travail | 3 |
| `/favorites`, `/recent`, `/archived` | Favoris, récents, archives | 3 à 5 |
| `/settings/:section?` | Paramètres | 2 à 10 |
| `/help` | Aide et raccourcis clavier | 1 |

Chaque route déclare un `handle` (`RouteHandle` : titre, parent du fil d'Ariane) lu par la barre supérieure,
qui affiche le titre `h1` de la page, et par `RouteAnnouncer` (titre de fenêtre, annonce aux lecteurs d'écran).
Une page dont le titre dépend des données (le nom d'un espace) le remplace avec `usePageTitle` (Phase 3).
Les erreurs de page s'affichent dans la coquille (`errorElement`). Un `ErrorBoundary` racine couvre le reste.
En développement uniquement, la route `#/dev/ui` présente la galerie du design system.

La recherche globale (`Ctrl+K`) est une surcouche (overlay), pas une route ; la page `/search` présente tous les
résultats d'une recherche, ses filtres étant conservés dans l'adresse (Phase 6). En Phase 1, les écrans dont le
module n'est pas encore livré affichent un **état vide conçu et honnête**, qui annonce la fonctionnalité sans la
simuler. Les actions non disponibles sont absentes, ou désactivées avec une explication (spec §17.1 : aucun
bouton mort).

### 4.3 État

- État local (`useState`, `useReducer`) pour les comportements isolés.
- Zustand pour l'état d'interface transversal : barre latérale repliée (persistée dans le `localStorage` de
  la WebView, préférence non critique), notifications, dialogues d'espace (Phase 3), titre dynamique de page,
  puis progression des imports, dialogues de document et vue liste ou grille de la Bibliothèque (Phase 4).
- Les filtres, la recherche et le tri de la Bibliothèque vivent dans l'adresse (`?q=…&kind=…`) : un lien ouvre
  une Bibliothèque déjà filtrée et un rechargement conserve la vue. Deux changements rapprochés s'enchaînent au
  lieu de repartir de l'adresse affichée (Phase 4).
- Les données viennent du cœur via les services et TanStack Query (adopté en Phase 2). Chaque mutation reste en
  attente jusqu'à ce que les vues concernées soient rafraîchies : un dialogue ne se ferme jamais sur des données
  périmées.
- Le cœur Rust est la source de vérité : aucun état métier n'est dupliqué dans les stores.

### 4.4 Design system

- **Jetons** : les couleurs de la spec §2.3 sont déclarées une seule fois en variables `@theme` (Tailwind v4) :
  `--color-obsidian`, `--color-carbon`, `--color-graphite`, `--color-steel`, `--color-border`,
  `--color-border-subtle`, `--color-text-primary`, etc. **Aucune valeur hexadécimale en dur dans les composants.**
- **Espacements** : l'unité Tailwind v4 vaut 4 px, si bien que les valeurs autorisées par la spec §3.5
  (4 à 64 px) correspondent exactement aux pas `1, 2, 3, 4, 5, 6, 8, 10, 12, 16`. Les autres pas sont proscrits,
  sauf dimensions de mise en page fixées par la spec §3.2 (padding vertical de 28 px, par exemple).
- **Rayons** : carte 10 px, modale 12 px, bouton et champ 7 px, définis en variables.
- **Typographie** : Inter pour l'interface, Space Grotesk pour les titres et les statistiques, JetBrains Mono
  pour les chemins, identifiants et le code. Polices embarquées, avec des replis système déclarés.
- **Mouvement** : durées en variables (survol 140 ms, transitions 180 ms, modales 200 ms), courbes sobres.
  Avec `prefers-reduced-motion`, les transitions sont neutralisées.
- **Icônes** : `lucide-react` exclusivement, épaisseur de trait uniforme, tailles 14, 16, 18, 20 et 24 px.
- **États** : chaque composant interactif définit les états par défaut, survol, `focus-visible`, actif, désactivé,
  chargement, erreur et, le cas échéant, succès (spec §3.7).

**Contrastes WCAG de la palette imposée** (calculés en Phase 0 ; un test automatisé les vérifiera en Phase 1) :

| Texte \ Fond | Obsidian | Carbon | Graphite | Steel |
|---|---|---|---|---|
| Primary `#F1F4F8` | 17,85 | 16,74 | 15,37 | 12,98 |
| Secondary `#A3ADBA` | 8,67 | 8,13 | 7,46 | 6,30 |
| **Muted `#6F7B89`** | 4,57 | **4,28** | **3,93** | **3,32** |
| Disabled `#4D5865` | 2,72 | 2,55 | 2,34 | 1,98 |
| Amber `#D6A45D` | 8,75 | 8,20 | 7,53 | 6,36 |
| Electric Blue `#67A9E8` | 7,89 | 7,40 | 6,79 | 5,74 |
| Danger `#E46C72` | 6,27 | 5,88 | 5,40 | 4,56 |

Règles qui en découlent :

1. **Muted** n'atteint le niveau AA (4,5:1) pour le texte courant que sur Obsidian. Sur Carbon, Graphite ou
   Steel (barre latérale, cartes, survols), les informations utiles en petit corps utilisent **Secondary**.
   Muted y reste réservé aux métadonnées non essentielles en grand corps (au moins 3:1).
2. **Boutons pleins** sur Amber, Blue, Success ou Danger : texte **Obsidian** (contraste de 6,3 à 8,8:1).
   Le texte blanc ou Primary sur ces fonds échoue (2,0 à 3,1:1).
3. **Disabled** concerne uniquement les éléments désactivés, que le WCAG exempte de contrainte de contraste.
4. **Bordures** : Border sur Obsidian donne 1,56:1. Les champs doivent donc être identifiables autrement
   (fond Graphite et libellé). L'anneau de focus Electric Blue (6,8:1 sur Graphite) garantit la visibilité du
   focus.

### 4.5 Internationalisation

- `src/i18n/fr.ts` est le dictionnaire de référence (typé `as const`). `en.ts` doit satisfaire le même type :
  une clé manquante provoque une erreur de compilation.
- Une fonction `t(key, params)` et un hook React suffisent. Pas d'i18next au départ : zéro dépendance et des clés
  typées.
- Dates, nombres et tailles de fichiers passent par `Intl` (`fr-FR` par défaut).
- Les textes anglais de la spec sont traduits dans l'interface (« Bonjour. Bienvenue dans ARCHIVE. »). Le
  traitement de la signature de marque est une décision ouverte (§16).

## 5. Cœur natif Rust — *Implémenté (Phases 1 à 8)*

- **Implémenté en Phase 1** : `app_info` (version, commit, profil de compilation, plateforme, version de
  Tauri, affichés dans Paramètres › À propos) et `log_frontend_event`. Ce dernier reçoit les diagnostics de
  l'interface (erreurs non interceptées, promesses rejetées, violations de CSP), les assainit (une seule
  ligne, 2 000 caractères au plus) et les écrit sur la sortie d'erreur, en attendant le journal de la Phase 2.
- **Couches** : `commands` (frontière IPC) → `services` (règles métier, transactions) → `db` (dépôts SQL),
  `storage` et `pipeline`.
- **Commandes** : nommées `domaine_action` (`documents_list`, `notes_save`…). Elles sont asynchrones dès qu'il y
  a des entrées/sorties. Leurs entrées sont désérialisées dans des structures validées (bornes de longueur,
  énumérations strictes, identifiants au format UUID).
- **Erreurs** : une énumération `AppError` (`thiserror`) est sérialisée en `{ code, message }`. Le code est
  stable, et le frontend le traduit via l'i18n. Les messages n'exposent ni chemins internes, ni secrets, ni
  contenu de document (spec §18.4).
- **Opérations longues** (import, indexation, sauvegarde, streaming IA) : progression via
  `tauri::ipc::Channel`, annulation par jeton (`CancellationToken`) et une commande `*_cancel`.
- **Invalidation** : des événements (`library:changed`, `notes:changed`…) signalent au frontend les données à
  recharger.
- **Types partagés** (Phase 2) : les DTO sont définis une seule fois en Rust (`#[derive(TS)]`) et le TypeScript
  correspondant est **généré** par `ts-rs` lors de `cargo test`, dans `src/types/bindings`. Ces fichiers ne
  sont jamais modifiés à la main, et la CI échoue s'ils ne sont pas à jour. Côté interface,
  `src/services/tauri.ts` associe chaque commande à ses arguments et à son résultat générés.
- **Exécution** (Phase 2) : les commandes qui touchent la base ou le disque s'exécutent via `spawn_blocking`,
  jamais sur le fil principal. Les erreurs techniques sont journalisées en détail au moment de les renvoyer.
- **Mode sans échec** (Phase 2) : si la base ne peut pas s'ouvrir (fichier endommagé, base issue d'une version
  plus récente, migration en échec), l'application démarre quand même. `app_status` décrit la cause, et
  l'interface affiche un écran explicatif avec « Réessayer » (`database_retry`) et l'accès au dossier des
  données. La base n'est jamais modifiée dans ce cas.
- **Concurrence** : SQLite en mode WAL, une connexion d'écriture sérialisée et des connexions de lecture. Un
  worker d'arrière-plan traite la file, les tâches lourdes passent par `spawn_blocking` : l'interface n'est
  jamais bloquée (spec §25, Performance).

## 6. Base de données — *Implémentée (Phase 2)*

### 6.1 Configuration

- Fichier `archive.db` dans le dossier de données de l'application. Une connexion d'écriture (transactions
  `IMMEDIATE`) et deux connexions en lecture seule (`query_only`), en mode WAL : les lectures n'attendent jamais
  une écriture longue.
- À chaque connexion : `PRAGMA foreign_keys = ON`, `busy_timeout = 5000` ; pour l'écriture,
  `journal_mode = WAL` (vérifié) et `synchronous = NORMAL`.
- Contrôles d'intégrité (`PRAGMA integrity_check`, `foreign_key_check`) exposés dans Paramètres › Stockage.

### 6.2 Conventions

- **Identifiants** : UUID v7 au format TEXT. Ils sont triables dans le temps, sans collision, et restent stables
  à travers les sauvegardes et restaurations.
- **Horodatages** : INTEGER en millisecondes Unix UTC, converties en heure locale à l'affichage.
- **Booléens** : INTEGER 0/1 avec contrainte `CHECK`. **JSON** : colonnes `*_json` contraintes par `json_valid()`.
- **Suppressions** : aucune cascade silencieuse sur le contenu utilisateur. Supprimer un espace de travail exige
  une réaffectation explicite de ses ressources (clé étrangère `RESTRICT` et parcours guidé, spec §12.3). Seules
  les tables de liaison (étiquettes) utilisent `CASCADE`.

### 6.3 Schéma

Le schéma v1 (`src-tauri/migrations/0001_initial.sql`) crée les tables marquées « 2 ». Les autres arriveront
par de nouvelles migrations, dans leurs phases. Ce sont les tables de la spec §5.1, avec des ajouts
justifiés :

| Table | Rôle | Phase |
|---|---|---|
| `workspaces`, `folders` | Organisation ; `folders.parent_id` est auto-référencé | 2 |
| `documents` | Métadonnées des fichiers importés (champs spec §5.1, **hors** `content_text`) | 2 |
| `document_contents` | Texte extrait (1:1). **Séparé** pour que les listes restent légères (spec §4.2) | 2 |
| `document_chunks` | **Non créée** (Phase 6) : les passages, avec leur numéro de page, sont les lignes de l'index plein texte, calculées depuis `document_contents` (§9) | — |
| `notes`, `note_links` | Notes (`content_format = 'tiptap-json'` + texte dérivé), liens internes, rétroliens | 2/5 |
| `tags`, `document_tags`, `note_tags` | Étiquettes | 2 |
| `relations` | Relations, avec `origin` (`user`, `rule`, `ai`), `status` (`suggested`, `accepted`, `rejected`), `confidence` et `provenance_json` | 2/7 |
| `concepts`, `concept_mentions` | Concepts extraits et leur source (élément, page, extrait, provenance), séparés du contenu original (spec §10.3) ; remplis seulement avec un fournisseur d'IA | 7 |
| `content_profiles`, `entity_terms`, `memory_state`, `search_vocabulary` | Description normalisée du contenu, termes caractéristiques, version des règles du moteur, vocabulaire de l'index (§8) | 7 |
| `timeline_events` | Événements réels, enregistrés **dès la Phase 3** ; la description garde le titre du moment, l'interface montre le titre actuel tant que la ressource existe (Phase 8) | 2/8 |
| `processing_jobs` | File persistante des étapes d'arrière-plan du pipeline (elle survit aux redémarrages) | 7 |
| `search_index`, `search_titles`, `search_entries`, `search_index_state` | Index plein texte FTS5 par passage, trigrammes des titres, correspondance élément → lignes, version des règles d'indexation (§9) | 6 |
| `search_history` | Historique de recherche, effaçable | 6 |
| `app_settings` | Paramètres clé/valeur | 2 |
| `ai_providers` | Fournisseur, modèle, préférences non secrètes et **référence** vers le secret | 9 |
| `conversations`, `conversation_messages` | Assistant IA : questions, réponses et, avec chaque réponse, les passages envoyés (`sources_json`) | 9 |
| `backups` | Historique des sauvegardes : emplacement, date, taille, contenu, dernière vérification | 10 |

**Écarts assumés par rapport à la spec §5.1 (Phase 2) :**
- `app_settings` utilise la clé (`setting_key`) comme clé primaire, sans colonne `id` : la clé est l'identité
  naturelle d'un paramètre.
- Colonnes ajoutées :
  - `name_key` (noms normalisés) pour interdire les doublons malgré la casse et les espaces ; SQLite ne sait
    pas comparer la casse des lettres accentuées ;
  - `deleted_at` sur les documents et les notes (corbeille réversible) ;
  - `revision` et `content_text` sur les notes (enregistrement sans écrasement, texte pour la recherche) ;
  - `workspace_id` sur les événements de chronologie (filtre par espace, spec §13.2) ;
  - `origin`, `status` et `provenance_json` sur les relations (spec §10.4).
- Les couleurs sont stockées sous forme de noms de jetons (`amber`, `cyan`…), jamais de valeurs : la palette
  reste la source unique.

### 6.4 Migrations

- Les fichiers `src-tauri/migrations/NNNN_description.sql` sont embarqués à la compilation et appliqués dans
  l'ordre au démarrage, chacun dans une transaction. Une table `schema_migrations` (version, nom, somme de
  contrôle, date) permet de détecter une migration modifiée après coup.
- **Avant toute migration d'une base existante**, une copie automatique est faite :
  `backups/pre-migration-<version>-<horodatage>.db`.
- En cas d'échec, la transaction est annulée et l'application s'ouvre en **mode sans échec**. Un écran explique
  le problème et propose d'ouvrir le dossier de données ou de restaurer la copie. Jamais de migration partielle.
- Tests (Phase 2, tous en place) :
  - base vide ;
  - réouverture sans effet ;
  - sauvegarde avant migration contenant les données ;
  - échec annulé entièrement ;
  - migration modifiée détectée ;
  - base plus récente laissée intacte ;
  - persistance après réouverture.
- Le `PRAGMA user_version` reflète aussi la version, pour les outils externes.

## 7. Stockage des fichiers — *Implémenté (Phases 2 et 4)*

Le dossier de données est le **dossier local** de l'application (`%LOCALAPPDATA%\<identifiant>` sous Windows),
et non `%APPDATA%` (Roaming). Une collection de documents volumineuse ne doit pas suivre un profil itinérant.
La variable `ARCHIVE_DATA_DIR` le remplace pour les tests et le développement.

```text
<dossier de données de l'application>/        ex. %LOCALAPPDATA%\<identifiant>\ sous Windows
├── archive.db (+ -wal, -shm)
├── files/<2 derniers caractères hex de l'id>/<id>.<ext>   # répartition sur la partie aléatoire de l'UUID v7
├── thumbnails/                                            # aperçus générés (optionnel)
├── backups/                                               # dont les copies prises avant chaque migration
├── logs/                                                  # archive.log, rotation à 5 Mo, 5 fichiers gardés
└── tmp/                                                   # préparation des imports, nettoyé au démarrage
```

- **Nom stocké** : `<id>.<ext>`, extension normalisée et prise dans une liste autorisée. Le nom d'origine est
  conservé en métadonnée (`original_filename`) pour l'affichage et l'export.
- **Import = copie, jamais déplacement.** Le fichier source est ouvert en lecture seule, copié dans `tmp/`,
  vérifié par empreinte SHA-256, puis renommé atomiquement dans `files/` (spec §5.3, §7.2).
- **Doublons** : à empreinte identique, l'interface signale « déjà importé » et renvoie au document existant.
  Aucune copie silencieuse.
- **Suppression** : action explicite et confirmée. L'interface distingue clairement le retrait de l'entrée et la
  suppression de la copie gérée, et rappelle que le **fichier d'origine n'est jamais touché** (spec §7.5).
- **« Afficher dans l'Explorateur »** : commande Rust qui résout le chemin à partir de l'identifiant. Le frontend
  ne manipule jamais de chemin.
- **Aperçus** (PDF, images) : la commande `documents_read_range` renvoie, en binaire, une plage d'octets (16 Mo au
  plus) de la copie gérée d'un document désigné par son identifiant. pdf.js lit ainsi les PDF par morceaux
  (`PDFDataRangeTransport`), et les images deviennent des URL `blob:`. Aucun protocole `asset:` ni schéma d'URI
  personnalisé : pas de CORS à configurer, CSP inchangée (décision de la Phase 4, qui remplace le schéma
  `archive://` envisagé).
- **Limites** : 512 Mo par fichier importé ; texte extrait borné à 16 Mo ; parties DOCX décompressées bornées à
  64 Mo. La cohérence entre l'extension et les octets magiques est vérifiée.
- **Recherche dans la Bibliothèque** (Phase 4, avant la recherche plein texte de la Phase 6) : titre et nom
  d'origine, sans tenir compte de la casse ni des accents, grâce à la fonction SQL `archive_fold` enregistrée
  par le cœur. SQLite seul ne replie que les lettres ASCII.
- **Exports** : noms assainis pour Windows (noms réservés `CON`, `NUL`…, caractères interdits, longueur).

### 7.1 Sauvegarde, restauration et export — *Implémenté (Phase 10)*

- **Sauvegarde = un fichier ZIP ouvert** (spec §16.1), à l'emplacement choisi par l'utilisateur (dialogue
  d'enregistrement ouvert par le cœur) : `manifest.json`, `archive.db` et `files/…` (les copies gérées, avec leur
  arborescence). La base est un instantané cohérent pris par `VACUUM INTO`, même pendant l'utilisation. Le
  manifeste donne la version du format, de l'application et du schéma, la date, les nombres d'éléments, et
  l'empreinte SHA-256 et la taille de chaque fichier. **Aucun secret** : les clés sont dans le Gestionnaire
  d'identifiants, la base n'en nomme que l'entrée ; le manifeste le dit (`secretsIncluded: false`).
- **Historique** (table `backups`, schéma v5) : emplacement, date, taille, contenu, dernière vérification ; une
  sauvegarde déplacée ou supprimée est signalée comme introuvable, jamais effacée de l'historique en silence.
- **Vérification** : seules les entrées attendues sont acceptées (pas de chemin absolu ni `..`, noms de fichiers
  gérés seulement) ; chaque empreinte est recalculée ; la base extraite passe `PRAGMA integrity_check` ; un schéma
  plus récent que l'application est refusé.
- **Restauration en deux temps** (spec §16.3) : après validation et affichage de la date et du contenu, puis
  confirmation, le cœur extrait la sauvegarde (empreintes vérifiées) dans `restore/` et redémarre ARCHIVE. Au
  démarrage, **avant toute ouverture de la base** (aucune connexion ni verrou Windows), les données actuelles sont
  déplacées dans `backups/before-restore-<date>/` puis remplacées par celles de la sauvegarde. Rien n'est supprimé :
  en cas d'échec, les déplacements sont annulés, et ce qui ne pourrait pas être remis en place reste dans ce
  dossier. Une notification au démarrage dit ce qui s'est passé (`AppStatus.restore` : appliquée, ou non, et le
  dossier qui garde les données). La restauration n'est tentée qu'une fois ; la copie extraite est ensuite
  effacée (une nouvelle tentative extrait la sauvegarde à nouveau). Les dossiers `before-restore-…` ne sont pas
  effacés automatiquement : leur taille compte dans celle du dossier des sauvegardes (Paramètres › Stockage).
  L'historique des sauvegardes traverse la restauration : la base restaurée ne connaît que les sauvegardes
  antérieures à elle ; l'historique courant est donc gardé dans le marqueur de restauration, puis réécrit dans la
  base restaurée une fois ouverte (la sauvegarde restaurée y figure, vérifiée).
  Une sauvegarde d'un schéma plus ancien est migrée normalement (avec sa copie de sécurité habituelle).
- **Commandes** (`commands/backup.rs`) : `backup_overview`, `backup_create` (dialogue d'enregistrement du cœur,
  extension `.zip` imposée, progression par `Channel`), `backup_verify`, `backup_open_file` (fichier choisi dans un
  dialogue du cœur, vérifié puis ajouté à l'historique), `backup_restore` (préparation puis redémarrage : la
  commande ne répond que si la sauvegarde ne peut pas être restaurée), `backup_forget` (l'historique seulement),
  `backup_reveal`. L'interface ne fournit jamais de chemin : seulement des identifiants de l'historique.
- **Export** (spec §16.2 et §16.4, `export/`) de toute la base ou d'un espace de travail, dans un **nouveau
  dossier** `ARCHIVE-export-<date>` (ou `ARCHIVE-export-<espace>-<date>`) créé dans le dossier choisi par
  l'utilisateur (dialogue du cœur) : numéroté si le nom existe, écrit sous `….partial` puis renommé, supprimé en
  cas d'échec ; jamais à l'intérieur du dossier de données d'ARCHIVE ; rien d'autre n'est touché.
  - `documents/<espace>/<dossiers>/<nom d'origine>` : les copies gérées, sous leur nom d'origine ;
    `notes/<espace>/<dossiers>/<titre>.md` : les notes en Markdown, avec un en-tête YAML (titre, identifiant,
    dates ISO 8601, espace, dossier, étiquettes, favori ; valeurs écrites comme des chaînes JSON, donc du YAML
    valide). Les éléments sans espace sont à la racine de `documents/` et `notes/`.
  - Noms rendus sûrs pour Windows (caractères interdits, noms réservés, 100 caractères au plus en gardant
    l'extension), numérotés « (2) », « (3) »… sans tenir compte de la casse, comme Windows.
  - Les notes enregistrées en document TipTap sont converties en Markdown **par l'interface**, avec la conversion
    de l'export d'une note (Phase 5), puis envoyées au cœur ; les notes Markdown ou texte sont écrites telles
    quelles ; une note dont le document est illisible est écrite en texte brut plutôt que perdue.
  - `metadata/documents.csv`, `notes.csv`, `workspaces.csv`, `relations.csv` : RFC 4180, UTF-8 avec BOM (pour
    que les tableurs lisent les accents), fins de ligne CRLF. Une cellule qui commencerait comme une formule
    (`=`, `+`, `-`, `@`, tabulation) est précédée d'une apostrophe, pour qu'un tableur ne l'exécute pas ;
    `archive.json` garde la valeur exacte.
  - `archive.json` (format `archive-export`, version 1) : espaces, dossiers, étiquettes, documents (avec leur
    fichier), notes (avec leur Markdown), relations entre éléments exportés, concepts et leurs mentions, et,
    pour un export complet seulement, les conversations de l'assistant.
  - Ni la corbeille, ni aucun secret (la configuration des fournisseurs n'est pas exportée). Une copie gérée
    manquante est nommée dans le résumé, laissée vide dans les tableaux (`file`) et `null` dans `archive.json` ;
    le reste est exporté.
  - Commandes : `export_notes_source`, `export_create` (dialogue de dossier du cœur, progression par `Channel`),
    `export_reveal` (le dernier export de la session, gardé par le cœur : l'interface n'envoie jamais de chemin).

## 8. Pipeline d'import et moteur de mémoire — *Implémenté (Phases 4 et 7)*

Étapes de la spec §10.1 : **Import → Extraction → Normalisation → Indexation → Analyse → Relations.** Chaque
étape a son propre statut : `pending`, `processing`, `completed`, `failed` ou `needs_attention`. L'import,
l'extraction et l'indexation se font quand l'élément est écrit, et leur statut se lit sur l'élément lui-même ;
les trois autres étapes passent par une file persistante, vidée en arrière-plan (Phase 7).

- **Import** (pour chaque fichier, avec progression et annulation) : validation, identification du type, lecture
  des métadonnées, attribution de l'identifiant, empreinte, copie, insertion en base (transaction), mise en
  file, événement de chronologie. Mêmes étapes que la spec §7.2.
- **Phase 4 (implémenté)** : l'extraction se fait pendant l'import, fichier par fichier, bornée en taille ; un
  fichier dont le texte ne peut être extrait est conservé, marqué `failed` avec la raison
  (`metadata.extractionIssue`), jamais refusé pour cela. Les échecs d'accès temporaires (fichier illisible,
  copie ou écriture impossible) peuvent être relancés depuis le panneau d'import.
- **Indexation** (Phase 6) : écrite dans la transaction qui enregistre les données, pas par une file (§9).
- **Extracteurs** (`import/extract.rs`, chacun borné en taille, sans panic sur un fichier mal formé) :
  - TXT et MD : détection d'encodage (BOM, validation UTF-8, repli Windows-1252, fréquent dans les anciens
    fichiers français).
  - CSV : texte structuré (en-têtes et lignes, borné). JSON : valeurs textuelles aplaties avec leur chemin de clé.
  - DOCX : `zip` + `quick-xml` (`word/document.xml` pour les paragraphes, titres et tableaux,
    `docProps/core.xml` pour l'auteur, les dates, le titre et la langue).
  - PDF : **pdf.js** (décidé en Phase 4), déjà requis pour l'aperçu. L'extraction s'exécute dans son Web
    Worker, page par page ; le texte est envoyé au cœur, qui le valide (taille bornée) et l'enregistre. Un PDF
    importé reste « en attente » jusqu'à cette étape, reprise au lancement suivant si l'application est fermée
    entre-temps. pdf.js tourne **sans WebAssembly** (`useWasm: false`, décodeurs JavaScript de repli) : la CSP
    n'a pas besoin de `wasm-unsafe-eval`, au prix d'un décodage plus lent des rares images JBIG2 et JPEG 2000.
  - Images : stockage et aperçu uniquement. **Aucune extraction de texte sans moteur OCR réellement intégré**
    (spec §7.1).
  - Le texte d'un PDF est accompagné de ce que le fichier déclare (titre, auteur, dates, langue), lu par pdf.js
    et vérifié par le cœur (Phase 7).
- **File de traitement** (Phase 7, `processing_jobs`, `memory/queue.rs`) : une ligne par élément et par étape
  d'arrière-plan (normalisation, analyse, relations). Toute écriture qui modifie un document ou une note met sa
  normalisation en file, dans la même transaction (les éléments signalés pour l'index de recherche) ; une note
  n'est traitée que 15 s après la dernière frappe. Chaque nouvelle demande élève la *génération* du travail :
  un résultat calculé pour une demande dépassée n'est pas enregistré comme le sien, et le travail est refait.
  Une étape terminée met la suivante en file.
- **Worker** (`memory/worker.rs`) : un fil d'exécution du cœur, jamais celui de l'interface. Il prend le travail
  dû le plus ancien, lit ce qu'il lui faut, calcule, puis écrit le résultat et la fin du travail dans une
  transaction courte ; il dort jusqu'au prochain travail dû ou jusqu'à ce qu'une écriture le réveille. Un échec
  est retenté plus tard (30 s, 2 min, 8 min, 32 min), puis attend l'utilisateur (`needs_attention`) ; le code
  de l'erreur est gardé, jamais le contenu. Un travail interrompu par un arrêt reprend au lancement suivant.
  Quand les règles du moteur changent (`MEMORY_VERSION`), tout est traité à nouveau. L'événement
  `memory:changed` prévient l'interface, qui regroupe ses rafraîchissements.
- **Normalisation** (`memory/normalize.rs`, spec §10.2) : une description commune à tous les formats
  (`content_profiles`) : titre, auteur et dates déclarés par le fichier (propriétés Word, informations PDF), nombre
  de pages, nombre de mots et de caractères, langue. La langue déclarée par le fichier l'emporte ; sinon, le
  français ou l'anglais n'est reconnu que si le texte le dit clairement (mots courants nombreux, nettement
  majoritaires) ; sinon elle reste inconnue. Rien n'est inventé.
- **Analyse** (`memory/analysis.rs`) : les termes caractéristiques de chaque élément (`entity_terms`), au plus
  12 : fréquents dans l'élément (trois fois plus dans son titre) et rares dans la base, d'après le nombre de
  passages qui les contiennent dans l'index de recherche (`search_vocabulary`, table `fts5vocab`).
- **Relations** (`memory/relate.rs`, spec §10.4) : deux éléments qui partagent au moins deux termes
  caractéristiques avec une similarité suffisante, ou un terme et une étiquette, reçoivent une suggestion
  `related_to` (origine `rule`, statut `suggested`), avec sa confiance et sa provenance : les termes partagés,
  les étiquettes communes, le même espace de travail, la similarité. Une relation sans direction est enregistrée
  une fois par paire. Le moteur ne touche jamais une relation décidée, créée par l'utilisateur ou écrite comme
  lien dans une note, et ne propose plus ce qui a été rejeté ; il retire seulement ses suggestions qui ne tiennent
  plus. Pour borner le travail, seuls les 200 éléments les plus proches sont comparés en détail (et toujours ceux
  déjà suggérés).
- **Contrôle par l'utilisateur** (`services/relations.rs`, spec §10.5) : accepter (événement « relation
  acceptée » dans la chronologie), rejeter, rétablir une suggestion rejetée, changer le type (ce qui accepte une
  suggestion), retirer (une relation trouvée par le moteur est alors rejetée, pour ne pas revenir ; une relation
  créée par l'utilisateur est supprimée), créer une relation. Types : `related_to`, `references`, `explains`,
  `example_of`, `part_of`, `depends_on`, `contradicts` ; les liens des notes (`links_to`) restent gérés par
  leur texte.
- **Concepts** (`memory/concepts.rs`, spec §10.3) : un trait `ConceptExtractor` indépendant du fournisseur ; les
  concepts sont stockés à part (`concepts`, `concept_mentions`), chaque mention avec sa source et sa
  provenance. Sans fournisseur d'IA configuré (avant la Phase 9), rien n'est extrait, et l'interface le dit.
- **Interface** : sur chaque document et chaque note, une carte « Relations » (décidées, suggestions avec
  pourquoi et confiance, rejetées) et une carte « Analyse » (langue, longueur, dates déclarées, termes menant à
  une recherche, statut de chaque étape avec relance) ; dans Paramètres › Stockage, la vue d'ensemble des
  traitements.
- **Mesure indicative** (`perf::memory_engine_on_a_generated_corpus`, ignorée par défaut ; mode release,
  conteneur cloud) : 1 000 documents de 8 pages et 1 000 notes (20 Mo de texte) entièrement traités en 44 s, soit
  22 ms par élément pour ses trois étapes ; 3,8 suggestions par élément ; la lecture de l'analyse et des relations
  d'un élément prend 0,1 ms.

## 9. Recherche et indexation — *Implémenté (Phase 6)*

- **Tables** (migration 2, `0002_search.sql`) :
  - `search_index` : table FTS5 `(entity_type UNINDEXED, entity_id UNINDEXED, page UNINDEXED, title, body, tags,
    meta)`, `tokenize = 'unicode61 remove_diacritics 2'`. Une ligne par **passage** : une page de PDF (pdf.js
    sépare les pages du texte extrait par un saut de page `\f`), sinon environ 2 000 octets coupés entre deux
    mots ; une page de plus de 8 000 octets est découpée elle aussi. Le titre, les étiquettes et les
    métadonnées (nom du fichier d'origine, titre et auteur du document) sont répétés sur chaque passage.
  - `search_titles` : table FTS5 `trigram` (sans accents) des titres et des noms de fichier, pour les
    correspondances partielles (« 555 » dans « NE555 »).
  - `search_entries` : les lignes de chaque élément, pour les retirer sans parcourir l'index.
  - `search_index_state` : version des règles d'indexation (`INDEX_VERSION`) et date de construction.
  - `search_history` : recherches lancées, 50 au plus, chacune une seule fois (casse et espaces ignorés).
- **Alimentation** : l'index est une donnée dérivée, écrite **dans la transaction qui modifie les données**. Les
  dépôts signalent ce qu'ils changent (`search::index::mark`) ; `Database::write` réindexe ces éléments juste
  avant de valider, et oublie les signalements si l'opération échoue. Un élément ne peut donc pas exister sans
  être trouvable, ni l'index garder un élément supprimé. Sont indexés : les documents (import, texte extrait,
  renommage, métadonnées, étiquettes, déplacement, corbeille, restauration, purge), les notes, les espaces de
  travail et les étiquettes (renommer une étiquette réindexe les éléments qui la portent).
- **Reconstruction** : au démarrage, si la version enregistrée diffère de `INDEX_VERSION` (base antérieure à la
  Phase 6, ou règles modifiées), l'index est reconstruit depuis les données, et le journal l'indique. Un échec
  est journalisé sans empêcher l'application de démarrer : seule la recherche est alors incomplète.
- **Requêtes** (`search_query`) :
  - la saisie n'est jamais insérée telle quelle dans la syntaxe FTS5. Chaque mot devient une chaîne entre
    guillemets (`"` doublés) ; le dernier mot prend le préfixe `*` tant que la saisie ne se termine pas par une
    espace ; `"…"` cherche une expression et `-mot` l'exclut ; les mots vides (français et anglais) sont ignorés
    s'il reste d'autres mots ; « œ » et « æ » trouvent aussi « oe » et « ae » ;
  - correspondances partielles : pour les mots de trois caractères ou plus, les titres qui les contiennent
    (trigrammes) viennent après les correspondances de mots entiers, marqués « Partie du titre » ;
  - filtres en SQL : types, espace de travail, étiquette, date (d'ajout ou de modification) et période,
    favoris ; la corbeille est exclue. Comptes par type (indépendants du filtre de type) et pagination : 100
    résultats par page au plus, 500 caractères de texte au plus ;
  - classement : `bm25()` pondéré (titre 10, étiquettes 5, métadonnées 2, texte 1) sur le meilleur passage de
    chaque élément, multiplié par 1,2 pour un favori et par 1,1 pour un élément de moins de 30 jours ; ou tri
    par date ;
  - extraits : `highlight()` et `snippet()` avec des marqueurs de la zone privée Unicode (U+E000, U+E001),
    convertis en segments `{ text, matched }`. L'interface les rend en React, jamais en HTML. Le numéro de page
    du passage accompagne l'extrait.
- **Interprétation** (spec §9.5) : dans l'interface (`interpret.ts`), un analyseur à règles explicites reconnaît
  une période (« la semaine dernière », « en mars », « ces 7 derniers jours », « last month »…), précédée ou non
  d'un verbe qui dit de quelle date il s'agit (« importés », « modifiées »), et un type en début de saisie suivi
  d'un connecteur (« notes sur… », « documents about… », « tout ce qui… »). Ce qui est reconnu devient un filtre
  **affiché** (« Compris : Type : Notes · Modifiés : … (du … au …) »), avec « Chercher le texte tel quel ». Un
  filtre choisi explicitement l'emporte, « Tout » compris. Les périodes suivent le calendrier local.
- **Interface** :
  - palette `Ctrl+K` : combobox WAI-ARIA, résultats groupés par type, flèches et Entrée, `Ctrl+Entrée` pour
    tous les résultats, recherches récentes ;
  - page `/search` : types avec leurs comptes, filtres en puces conservés dans l'adresse, tri, « Afficher
    plus », historique effaçable entrée par entrée ou en entier ;
  - les résultats en cache sont invalidés par toute modification des données (préfixe de clé `['search']`).
- **Recherche sémantique** : non activée, et l'interface le dit. Elle pourra s'ajouter en option une fois un
  fournisseur configuré (Phase 9), avec repli sur FTS5 (spec §9.4).
- **Mesure indicative** (`perf::search_on_a_generated_corpus`, ignorée par défaut ; mode release, conteneur
  cloud) : sur 2 000
  documents de 8 pages et 3 000 notes (41 Mo de texte) :
  - écriture et indexation : 1 837 éléments par seconde ;
  - reconstruction complète : 2,9 s ;
  - taille de la base : 151 Mo ;
  - recherches de 24 résultats : 2 à 3 ms pour un mot rare ou un titre partiel, 25 à 45 ms pour une expression,
    une exclusion ou deux mots filtrés, 70 à 96 ms en médiane (136 ms au 95ᵉ centile) pour un mot présent dans
    presque tous les éléments.

## 10. Graphe de connaissances et chronologie — *Implémenté (Phase 8)*

- **Cœur du graphe** (`services/graph.rs`, commande `graph_load`) : une requête décrit ce qu'on veut voir (types
  de nœud, types de relation dont `links_to` pour les liens des notes, suggestions ou non, espace de travail,
  élément de départ, éléments dépliés, plafond). Le cœur charge les éléments vivants (jamais la corbeille) avec leur
  titre seulement, les relations décidées (et les suggestions sur demande, jamais les rejetées), l'appartenance
  aux espaces et les étiquettes, **filtre avant d'envoyer** (spec §11.3), puis limite :
  - sans élément de départ, les nœuds les plus reliés d'abord (300 par défaut), sans nœud isolé ;
  - avec un élément de départ, cet élément puis ses voisins, même s'il n'a aucune connexion ;
  - les voisins des éléments dépliés s'ajoutent ensuite, jusqu'à 500 nœuds ; au-delà de 4 000 arêtes, les
    appartenances aux espaces puis les étiquettes sont laissées de côté, et la réponse le dit ;
  - chaque nœud porte son degré complet : l'interface sait combien de connexions ne sont pas affichées. L'ordre
    est stable (degré, type, titre replié, identifiant), si bien qu'une même base donne toujours le même graphe.
- **Rendu** (`modules/knowledge-graph`) : SVG dessiné par React, sans WebGL ni Canvas. Les formes diffèrent selon
  le type (document carré, note ronde, espace carré arrondi, étiquette losange, élément archivé en pointillés) :
  la couleur n'est jamais le seul indice. Les nœuds et les arêtes sont mémoïsés : un déplacement de la carte ne
  redessine que le groupe transformé. Les étiquettes sont dans un calque à part, au-dessus des nœuds et hors de
  leurs boutons (leur nom accessible contient le titre complet, WCAG 2.5.3). Zoom autour du pointeur, déplacement,
  glisser-déposer des nœuds, sélection d'un nœud ou d'une arête (test de distance au clic, sans élément invisible
  supplémentaire), atténuation de ce qui est hors du voisinage de la sélection ou des résultats de recherche.
- **Disposition** (`layout.ts`, `layout.worker.ts`) : `d3-force` (lien, répulsion Barnes-Hut, collision, force de
  séparation des étiquettes sur une grille, centrage), avec une source aléatoire initialisée par le contenu du
  graphe : la même base est toujours dessinée de la même façon. Positions de départ lisibles (chaque groupe connexe
  à sa place, anneaux autour du nœud le plus relié), puis 150 pas (90 pour une carte déjà placée). Une expansion
  fige les nœuds placés et installe les nouveaux près de leur voisin ; d'autres filtres repartent des positions
  connues ; un autre graphe (moins de la moitié de nœuds communs) est disposé à neuf. Le calcul a lieu dans un
  **Web Worker** autorisé par la CSP (`worker-src 'self'`) ; sans worker, il se fait en place et le journal le
  signale. La carte garde le graphe précédent jusqu'à la nouvelle disposition, une seule fois par graphe reçu
  (spec §4.2).
- **Accessibilité** : la carte est un groupe nommé avec une aide ; un seul arrêt de tabulation (tabindex mobile),
  les flèches mènent au nœud le plus proche dans la direction choisie, Entrée sélectionne, Échap désélectionne,
  `+`, `−` et `0` zooment. La vue en liste et le panneau de détails donnent la même information sans la carte.
- **Mesures indicatives** (conteneur Linux, Xeon 2,1 GHz partagé ; `perf::graph_on_a_generated_corpus` et
  `npm run test:perf`) : sur 1 000 documents, 1 000 notes, 20 espaces, 60 étiquettes, 1 972 liens, 1 500 relations
  et 4 000 suggestions, `graph_load` répond en 19 ms (médiane ; 300 nœuds sur 1 844 reliés, 164 Ko), 24 ms avec
  l'organisation et les suggestions (1 059 arêtes, 321 Ko), 11 ms pour le voisinage d'un élément, même avec
  10 éléments dépliés. Disposition dans Chromium : 0,12 s pour 100 nœuds, 0,34 s pour 300, 0,54 s pour 500, hors du
  fil de l'interface ; zoom d'une carte de 300 nœuds en deux images de 18 ms environ chacune.
- **Chronologie** (`repo/timeline.rs`, commandes `timeline_list` et `timeline_clear`) : filtres par types
  d'événement, types de ressource, espace de travail et période `[from, to[`, pagination par curseur
  `(date, identifiant)` qui ne répète ni ne saute deux événements de la même milliseconde. Chaque événement dit où
  il mène (`target`) : la ressource elle-même tant qu'elle existe hors corbeille, ou pour une relation acceptée
  l'élément dont elle part. L'interface regroupe par jour (calendrier local), montre le titre actuel des
  ressources encore présentes, et efface l'historique seulement après confirmation, sans toucher aux ressources.
  Les huit événements de la spec §13.1 sont vérifiés de bout en bout par un test Rust qui passe par les vrais
  services et le vrai pipeline d'import.

## 11. Couche IA — *Implémentée (Phase 9)*

L'IA est facultative (spec §14.1) : sans fournisseur configuré, tout le reste d'ARCHIVE fonctionne, et
l'assistant affiche un état vide qui explique comment en ajouter un. **Aucun appel ne part sans une action
explicite de l'utilisateur** : envoyer une question, régénérer une réponse, tester une connexion ou extraire des
concepts (spec §15.4).

### 11.1 Fournisseurs (`src-tauri/src/ai/`)

- **Trait `AiProvider` « sans entrées-sorties »** (`provider.rs`) : chaque fournisseur construit ses requêtes
  HTTP et lit ses réponses, sans jamais toucher le réseau. Il offre la liste des modèles du compte (qui sert de
  test de connexion et ne consomme aucun jeton), une réponse en flux décodée en événements communs (`Model`,
  `Text`, `Usage`, `Switched`, `Finished`, `Failed`), et la lecture des réponses d'erreur. Le reste de
  l'application ne connaît que ce trait (spec §14.2).
- **Anthropic** (`anthropic.rs`) : Messages API en flux (`POST /v1/messages`, en-tête `anthropic-version:
  2026-10-21`, sans `temperature`/`top_p`/`top_k`, refusés par cette version), Models API pour le test.
  Le refus d'un modèle (`stop_reason: "refusal"`) est un résultat, pas une erreur : la sortie partielle est
  écartée, comme le demande la documentation. Le **repli côté serveur** (`fallbacks: "default"`, bêta
  `server-side-fallback-2026-07-01`) n'est envoyé que si la liste des modèles indique que le modèle choisi
  l'accepte (`allowed_fallback_models` non vide) et que la préférence est active ; le changement de modèle
  est affiché (« Réponse rédigée par … après un refus de … »).
- **OpenAI** (`openai.rs`) : Responses API en flux (`POST /v1/responses`) avec **`store: false`**, pour
  qu'OpenAI ne conserve pas la réponse en vue d'une récupération ultérieure.
- **Gemini** (`gemini.rs`) : `models/{modèle}:streamGenerateContent?alt=sse`, la clé dans l'en-tête
  `x-goog-api-key` (jamais dans l'URL) ; les « pensées » du modèle ne sont pas montrées comme réponse ; la
  liste des modèles est réduite à ceux qui génèrent du texte.
- **Erreurs** : catégories stables (clé refusée, permission, modèle introuvable, limite de débit avec délai,
  quota, surcharge, requête invalide, serveur, réseau, délai, réponse illisible, flux interrompu). Le message
  du fournisseur n'est montré que nettoyé : tout ce qui ressemble à une clé est masqué, et il est raccourci.
- **Modèles** : aucune liste figée. Le test de connexion lit la liste du compte ; l'utilisateur y choisit son
  modèle, ou en saisit l'identifiant (lettres, chiffres, `. _ : -` seulement, car il entre dans l'URL de Gemini).
  La limite de sortie annoncée par le fournisseur borne la préférence « longueur maximale des réponses ».
- **Sources vérifiées** : les formats d'Anthropic ont été vérifiés sur sa documentation officielle au moment de
  la phase 9. Les documentations d'OpenAI et de Google n'étaient pas joignables depuis l'environnement de
  développement (réseau restreint) : leurs formats suivent leurs API publiques connues et sont isolés dans un
  module chacun, avec des tests sur des réponses enregistrées.

### 11.2 Réseau (`http.rs`)

- **Les appels HTTP partent du cœur Rust**, jamais de la WebView : la CSP interdit toujours toute connexion
  externe à l'interface (§12). `reqwest` avec **rustls et la cryptographie `ring`** (pas d'OpenSSL), le
  **vérificateur de certificats du système** (`rustls-platform-verifier`) et ses réglages de proxy.
- **HTTPS seulement** dans les builds distribués (`https_only`). L'en-tête qui porte la clé est marqué sensible ;
  le type `HttpRequest` ne s'affiche jamais avec ses en-têtes.
- **Flux** : décodeur SSE maison (`sse.rs`), insensible au découpage du réseau (testé octet par octet),
  borné en mémoire. Arrêt immédiat par l'utilisateur (`tokio::select!` sur un signal d'annulation).
- **Délais** : connexion 15 s, silence d'un flux 180 s (certains modèles réfléchissent longtemps avant le
  premier mot), liste des modèles 30 s.
- **Tests sans clé réelle** : un serveur HTTP local (`test_server.rs`) joue le rôle des fournisseurs dans les
  tests Rust. La validation native utilise un build dédié (fonctionnalité Cargo `test-endpoints`) qui accepte
  `ARCHIVE_AI_TEST_ENDPOINT=http://127.0.0.1:…` ; **les builds distribués ne contiennent pas ce code**.

### 11.3 Clés API (`secret.rs`, spec §14.3)

- **Gestionnaire d'identifiants de Windows**, via `keyring-core` et `windows-native-keyring-store` (service
  `ARCHIVE`, entrée `ai-provider:<id>`). La base ne garde que le nom de l'entrée (`secret_ref`), et seulement
  tant que le coffre du système détient la clé.
- **Si le coffre est indisponible** (verrouillé, absent hors Windows) : la clé n'est gardée **qu'en mémoire,
  jusqu'à la fermeture d'ARCHIVE**, jamais écrite ailleurs, et l'interface l'explique (« à saisir de nouveau au
  prochain lancement »).
- La clé entre une seule fois dans le cœur (formulaire des réglages, champ masqué, vidé aussitôt) et **n'en
  ressort jamais** : aucune commande ne la renvoie, l'interface ne voit que « enregistrée dans le Gestionnaire
  d'identifiants » ou « pour cette session ». Type `Secret` : jamais affiché, jamais sérialisé, effacé de la
  mémoire à sa libération (`zeroize`). Les erreurs du coffre sont décrites sans leurs données.
- **Journal** : jamais de clé, jamais de question, de passage ni de réponse ; seulement le fournisseur, le
  modèle, le nombre de passages et de caractères envoyés, le statut, la durée et les jetons.

### 11.4 Assistant ancré dans la base (spec §14.4–14.6)

- **Portée choisie par l'utilisateur** : documents et notes un par un, ou un espace de travail, ou rien (les
  réponses viennent alors des connaissances générales du modèle, et l'interface le dit). Rien n'est jamais pris
  hors de ce choix.
- **Récupération** (`retrieval.rs`) : les mots de la question (sans mots vides) sont cherchés dans l'index
  FTS5 de la phase 6, **sur le texte des passages d'abord** (le titre étant répété sur chaque passage, un
  passage ne doit pas être retenu pour son seul titre), puis le début des éléments dont le titre correspond ;
  chaque élément choisi un par un apporte au moins son début (« Résume ce document »). Fenêtre de 1 600
  caractères autour des mots de la question, 3 passages au plus par élément, et un **budget réglable**
  (préférence de confidentialité) : compact 4 passages / 5 000 caractères, standard 8 / 12 000, étendu
  16 / 30 000. Les éléments à la corbeille sont exclus.
- **Aperçu avant envoi** : la liste exacte des passages (titre, page, extrait, taille) et le nombre de messages
  de la conversation qui partiront sont affichés pendant la saisie ; ce sont les mêmes qui partent.
- **Message envoyé** (`prompt.rs`) : consignes communes (les passages sont des données, jamais des
  instructions ; citer `[S1]`… seulement pour les passages fournis ; dire d'abord quand les passages ne
  répondent pas ; marquer `[general]` et `[interpretation]`), passages dans des éléments `<source>` qui ne
  peuvent pas être refermés par leur contenu, puis la question. L'historique (préférence, activée par défaut)
  ne reprend que les échanges complets, sans leurs anciennes citations, dans une limite de 12 000 caractères.
- **Conversations** (`conversations.rs`, schéma v4) : questions, réponses et, avec chaque réponse, les passages
  envoyés (référence et extrait court, jamais le texte complet). Statuts : complète, en cours, interrompue,
  échouée, refusée, bloquée. Une réponse en cours à la fermeture d'ARCHIVE devient « interrompue » au
  lancement suivant. Une seule réponse à la fois par conversation ; arrêt, régénération, effacement (avec
  confirmation) et suppression.
- **Citations vérifiées** : une citation `[Sn]` ne devient un lien que si le passage n a réellement été envoyé
  avec cette question ; sinon elle est signalée comme non vérifiée. Chaque paragraphe est étiqueté : issu
  d'ARCHIVE (au moins une citation vérifiée), connaissances générales, interprétation, ou non sourcé.
- **Flux vers l'interface** : `tauri::ipc::Channel` (morceaux de texte, modèle, changement de modèle, fin) ;
  la réponse est enregistrée par le cœur même si la fenêtre a disparu.

### 11.5 Concepts par IA (spec §10.3)

- **Sur demande seulement**, depuis la carte d'analyse d'un document ou d'une note, après une confirmation qui dit
  ce qui partira : le titre et au plus 24 000 caractères du texte (`ai/concepts.rs`).
- Le fournisseur répond en JSON (nom, type parmi les huit de la spec, citation courte). **Chaque concept est
  vérifié dans le texte** : il n'est gardé que si son nom ou sa citation s'y trouve, avec la page de la citation ;
  sinon il est écarté. Les concepts restent à part du contenu (tables `concepts`, `concept_mentions`, schéma v3),
  avec leur provenance (fournisseur, modèle, date).
- **Graphe** : nœuds « concept » (hexagones cyan) reliés aux éléments qui les mentionnent, masqués par défaut,
  activables dans les filtres ; un concept ouvre la recherche de son nom.

## 12. Modèle de sécurité — *Socle implémenté (Phase 1), renforcé à chaque phase*

- **Capabilities Tauri minimales** : aucune permission `fs`, `shell` ni `http` pour la WebView. Seuls les
  plugins nécessaires sont activés (dialogues d'ouverture et d'enregistrement, ouverture externe), avec la portée
  la plus étroite possible.
- **CSP stricte** (`src-tauri/tauri.conf.json`, Phase 1) : `default-src 'self'`, `script-src 'self'`,
  `connect-src ipc: http://ipc.localhost` (aucune connexion externe possible depuis la WebView),
  `img-src 'self' data: blob:`, `font-src 'self' data:`, `worker-src 'self' blob:`, `object-src 'none'`,
  `frame-src 'none'`, `base-uri 'self'`, `form-action 'none'`. Le schéma `archive:` s'ajoutera en Phase 4.
  - **Exception justifiée** : `style-src 'self' 'unsafe-inline'`, accompagnée de
    `dangerousDisableAssetCspModification: ["style-src"]`. Les primitives Radix et TipTap (Phase 5)
    positionnent leurs éléments par styles en ligne. Si Tauri ajoutait ses empreintes à `style-src`, le
    navigateur ignorerait `'unsafe-inline'`. Les scripts restent strictement contrôlés : Tauri y ajoute ses
    nonces et empreintes, et aucun script en ligne n'est autorisé.
  - `devCsp` relâche uniquement ce dont Vite a besoin en développement (script de rafraîchissement en ligne,
    WebSocket de rechargement à chaud).
  - Vérification : l'interface remonte toute violation au journal natif via `securitypolicyviolation`. Le
    binaire de production lancé sous Xvfb n'en a remonté aucune.
- **Capability** `main-window` : uniquement `core:event:default`. Le protocole `asset:` est désactivé.
- **Entrées** : chaque commande valide ses paramètres (UUID, bornes, énumérations). Les chemins sont canonicalisés
  et doivent désigner des fichiers réguliers. Les chemins internes sont construits à partir des identifiants
  uniquement, ce qui empêche toute traversée de répertoire (spec §18.2).
- **Fichiers** : jamais exécutés. Le type est déterminé par les octets magiques, et l'analyse est bornée et
  isolée. Un document malformé produit une erreur propre, jamais un plantage.
- **Secrets** : stockés dans le Credential Manager, jamais journalisés, jamais inclus dans les sauvegardes par
  défaut, jamais transmis au frontend (l'interface sait seulement si une clé est configurée).
- **Journaux** : `tracing`, fichier à rotation dans `logs/`, sans contenu de document ni secret, avec des
  identifiants d'erreur pour la corrélation.
- **Vie privée** : aucune télémétrie, aucune synchronisation, aucun envoi automatique. Le seul trafic réseau est
  celui des appels IA déclenchés par l'utilisateur (spec §18.1).
- **Comportement d'application de bureau** (production) : les raccourcis de rechargement et d'impression
  sont bloqués, et le menu contextuel natif est limité aux champs éditables et au texte sélectionné. L'effet
  réel sous WebView2 sera vérifié sur Windows.
- **Dépendances** : `cargo audit` et `npm audit` dans la CI (au plus tard en Phase 10).

## 13. Tests et assurance qualité

| Niveau | Outils | Exécution | Dès |
|---|---|---|---|
| Statique | `tsc -b`, ESLint, Prettier, `cargo fmt --check`, `clippy -D warnings` | Conteneur et CI | ✅ Phase 1 |
| Unitaires frontend | Vitest + RTL + jsdom, IPC simulé (`@tauri-apps/api/mocks`), conformité des jetons à la spec et contrastes | Conteneur et CI | ✅ Phase 1 (78 tests) |
| Unitaires et intégration Rust | `cargo test` ; en Phase 2, SQLite en mémoire, dossiers temporaires, fixtures réelles | Conteneur et CI | ✅ Phase 1 (7 tests) |
| UI, accessibilité, visuel | Playwright (Chromium, même moteur que WebView2) sur Vite avec doublure du runtime natif. Échec sur toute erreur console. axe-core WCAG 2.2 A/AA sur chaque écran. Captures 1440×900, 1280×800 et 1100×700 (`npm run test:visual`, dossier `visual-audit/`) | Conteneur et CI | ✅ Phase 1 (33 tests) |
| Fumée native | Binaire de production lancé sous Xvfb (Linux), et sur `windows-latest` avec capture d'écran WebView2 | Conteneur et CI Windows | ✅ Phase 1 |
| E2E sur l'application réelle | `tauri-driver` : WebKitWebDriver sous Xvfb, msedgedriver sous Windows | Conteneur et CI Windows | à confirmer (Phase 2) |
| Performance | Jeux synthétiques générés, jamais livrés par défaut : `cargo test --release --lib perf:: -- --ignored --nocapture` (recherche sur 2 000 documents de 8 pages et 3 000 notes ; moteur de mémoire et graphe sur 1 000 documents et 1 000 notes) et `npm run test:perf` (disposition et affichage du graphe dans Chromium) | Conteneur | ✅ Phases 6 à 8 ; Phase 10 |

Règle absolue : un test n'est déclaré réussi que s'il a été exécuté, et son résultat est consigné dans
`DEVELOPMENT_PROGRESS.md` (spec §22).

## 14. Développement cloud et CI/CD

- **Développement** : sessions Claude Code dans des conteneurs Linux éphémères. Le dépôt GitHub privé est la
  seule source de vérité, sans dépendance à une machine locale.
- **Branches** : `main` ne contient que des phases validées. Chaque phase se développe sur une branche
  `phase/<n>-<nom>`, fusionnée dans `main` par pull request une fois validée.
- **`ci.yml`** (Ubuntu, à chaque push et pull request ; implémenté en Phase 1) comporte trois jobs :
  - frontend : types, lint, formatage, tests unitaires, build ;
  - end-to-end : Playwright et axe-core ;
  - natif : `cargo fmt --check`, `clippy -D warnings`, `cargo test`, sans besoin de `dist/` puisque le profil
    de développement n'embarque pas le frontend.
- **`windows-build.yml`** (`windows-latest` ; implémenté en Phase 1) se déclenche à la demande, et sur
  `main` ou `phase/**` lorsque le côté natif ou les dépendances changent. `tauri build` produit un MSI et un
  installateur NSIS (`setup.exe`). Un test de fumée lance l'application, vérifie qu'elle reste active
  20 secondes et capture l'écran (rendu WebView2 réel). Installateurs et capture sont téléchargeables en
  artefacts. La signature de code et la publication sur tags `v*` relèvent de la Phase 10.
- **Conteneur** : les dépendances système (audit §4) sont réinstallées par le script de configuration de
  l'environnement cloud.

## 15. Dépendances entre modules

```text
Phase 1  Fondation : shell, design system, i18n, routage, CI
  └─► Phase 2  Données : SQLite, migrations, stockage, paramètres, erreurs, timeline_events
        ├─► Phase 3  Vue d'ensemble + espaces de travail ─────────────────────┐
        │     └─► Phase 4  Bibliothèque : import, extraction, aperçu ─────────┤
        │           └─► Phase 5  Notes : éditeur, liens, rétroliens ──────────┤
        │                                                                     ▼
        │                       Phase 6  Recherche FTS5 (documents + notes)
        │                         └─► Phase 7  Moteur de mémoire (file, relations, provenance)
        │                               └─► Phase 8  Graphe + chronologie
        │                                     └─► Phase 9  Assistant IA (récupération = Phase 6)
        └────────────────────────────────────────────► Phase 10  Sauvegarde, sécurité, performance, packaging
```

## 16. Décisions ouvertes

| Sujet | Options | Recommandation | Échéance |
|---|---|---|---|
| **Identifiant d'application** (il fixe le dossier de données et ne peut plus changer après diffusion) | domaine possédé par le porteur, ou `io.github.lebendo91.archive` | domaine du porteur s'il en a un, sinon `io.github.lebendo91.archive` | Phase 1, **validation du porteur** |
| Signature de marque en interface française | garder « Everything you know. Nothing forgotten. » ou traduire (« Tout ce que vous savez. Rien d'oublié. ») | garder l'anglais comme signature, traduire le texte explicatif | Phase 1, **validation du porteur** |
| Signature de code Windows | certificat OV/EV, service de signature cloud, ou aucune (avertissement SmartScreen) | à arbitrer selon la diffusion visée | Phase 10, **décision du porteur** |
| Passage à TypeScript 7 | dès que `typescript-eslint` le supporte | réévaluer à chaque phase | continu |

### Décisions prises en Phase 9

| Décision | Justification |
|---|---|
| Fournisseurs « sans entrées-sorties » derrière un trait, réseau dans un seul module | Chaque fournisseur se teste sur des réponses enregistrées, toute la chaîne contre un serveur local ; changer de fournisseur ne touche pas l'assistant (spec §14.2) |
| Appels HTTP bruts plutôt que les SDK officiels | Aucun SDK Rust officiel pour Anthropic, OpenAI ou Gemini ; les formats sont isolés dans un module par fournisseur |
| `ring` plutôt que `aws-lc-rs` comme cryptographie de rustls | Compilation sûre sur Windows MSVC (pas de CMake ni de NASM), plus rapide ; mêmes garanties TLS |
| Gestionnaire d'identifiants de Windows seul compilé ; mémoire de session ailleurs | ARCHIVE vise Windows ; sous Linux (développement, CI), l'absence de coffre est le cas « indisponible », expliqué à l'utilisateur. Le vrai coffre de Windows est testé dans la CI Windows |
| `keyring-core` épinglé à 1.0.1 | 1.1.0 est parue le 2026-11-20, trop récemment pour être adoptée pendant la phase |
| Test de connexion = liste des modèles | Ne consomme aucun jeton et donne la liste des modèles du compte, d'où vient le choix du modèle (aucune liste figée) |
| Modèle suggéré pour Anthropic seulement (`claude-opus-5-5`) | Tiré de la documentation officielle d'Anthropic, consultée pendant la phase ; celles d'OpenAI et de Google n'étaient pas joignables depuis l'environnement : leur modèle se choisit dans la liste du compte |
| Repli d'Anthropic en cas de refus, seulement si la liste des modèles l'annonce | La documentation recommande `fallbacks: "default"` ; un modèle qui ne l'accepte pas répondrait par une erreur, d'où la condition `allowed_fallback_models` non vide |
| OpenAI : Responses API avec `store: false` | API recommandée pour les nouveaux projets ; `store: false` évite la conservation des réponses chez le fournisseur |
| Recherche des passages sur leur texte, puis sur les titres | Le titre est répété sur chaque passage de l'index : sans cette séparation, des passages sans rapport étaient envoyés pour leur seul titre (défaut trouvé par les tests) |
| Étiquettes `[general]` / `[interpretation]` demandées au modèle, citations vérifiées par ARCHIVE | Spec §14.5 : un paragraphe n'est « issu d'ARCHIVE » que s'il cite un passage réellement envoyé ; ce que le modèle marque lui-même est montré comme tel |
| Concepts par IA vérifiés dans le texte avant d'être enregistrés | Spec §10.3 et « ne jamais inventer » : un concept dont ni le nom ni la citation n'apparaissent dans le texte est écarté |
| Validation native avec un build `test-endpoints` | Le parcours réel (clé, réseau, flux, canal Tauri, WebView) se vérifie sans clé ni réseau ; le code d'adresse modifiable est absent des builds distribués |

### Décisions prises en Phase 8

| Décision | Justification |
|---|---|
| `d3-force` 3.0.1 et SVG dessiné par React, au lieu de Cytoscape.js (prévu) | Spec §4.1 : « Cytoscape.js ou une autre bibliothèque 2D légère ». En SVG, chaque nœud est un élément du DOM : stylé par les jetons du design system (thème compris), nommé et atteignable au clavier, vérifiable par axe et par les tests ; `d3-force` pèse 17 Ko dans le worker contre ~400 Ko. Le plafond de 500 nœuds garde le SVG fluide |
| Nouvelle version de `d3-force` et de ses trois dépendances (novembre 2026) acceptée après examen | Publiées par l'intégration continue du projet d3 avec attestation de provenance SLSA, sans script d'installation ; le code ne diffère de la version de 2021 que par une optimisation de `quadtree.addAll` et un arrondi de `d3-timer`. `npm audit signatures` n'a pas pu joindre le dépôt de confiance Sigstore depuis le conteneur |
| Filtrage, sélection et plafonds dans le cœur ; disposition dans l'interface, dans un worker | Spec §11.3 : rien n'est envoyé au-delà de ce qui sera dessiné ; la disposition dépend de ce que l'utilisateur voit et déplace, et le worker garde l'interface réactive (mesuré : 0,34 s pour 300 nœuds sur le conteneur) |
| Les plus reliés d'abord, et « Partir d'un élément » plutôt qu'un graphe complet | Un graphe de 2 000 éléments n'est pas lisible ; l'utilisateur part de ce qui compte, puis déplie à la demande |
| Espaces et étiquettes masqués par défaut ; suggestions sur demande | Le graphe montre d'abord les liens qui disent quelque chose (liens des notes, relations décidées) ; une suggestion n'est pas un fait (spec §10.4) ; l'organisation reste à un clic |
| Pas de nœud isolé dans la vue d'ensemble ; un état vide qui explique comment naissent les relations | Spec §11.4 : jamais de graphe inventé ; les éléments sans connexion restent dans la Bibliothèque et les Notes |
| Disposition déterministe, positions conservées, nœuds figés pour une expansion | Une même base est toujours dessinée de la même façon (captures d'audit stables) ; la carte que l'utilisateur lit ne se réorganise pas sous ses yeux (spec §11.3, *controlled layouts*) |
| La carte se rétrécit par la droite quand le panneau de détails s'ouvre | Rien ne bouge sous le pointeur : un double clic dont le premier clic ouvre le panneau atteint toujours le même élément (défaut trouvé par les tests de bout en bout) |
| Un résultat choisi dans la recherche du graphe donne le focus à ses détails | L'utilisateur au clavier ou d'un lecteur d'écran lit et utilise aussitôt ce qu'il a cherché |
| Chronologie paginée par curseur `(date, identifiant)` et filtrée dans le cœur | Deux événements d'une même milliseconde ne sont ni répétés ni sautés ; les filtres réduisent ce qui est lu, pas seulement ce qui est affiché |
| Titre actuel d'une ressource encore présente, instantané sinon | Une note est créée sans titre (Ctrl+N) puis nommée : la validation native montrait « Sans titre » partout ; l'instantané garde lisible l'historique de ce qui n'existe plus |

### Décisions prises en Phase 7

| Décision | Justification |
|---|---|
| Import, extraction et indexation lus sur l'élément ; normalisation, analyse et relations dans une file persistante (`processing_jobs`) vidée par un fil d'exécution du cœur | Les trois premières étapes ont lieu à l'écriture ; les suivantes peuvent attendre, échouer, reprendre après un arrêt, sans jamais bloquer l'interface |
| Mise en file dans la transaction qui modifie l'élément, à partir des éléments signalés pour l'index de recherche ; notes traitées 15 s après la dernière frappe | Rien n'est oublié (même mécanisme que l'index) ; l'enregistrement automatique ne relance pas l'analyse à chaque pause |
| Génération par travail : un résultat calculé pour une demande dépassée n'est pas enregistré comme le sien | Un élément modifié pendant son traitement est traité de nouveau, sans verrou ni attente |
| Nouvel essai espacé (30 s × 4ⁿ), puis « À vérifier » après 5 échecs, avec relance à la demande ; code d'erreur seulement | Une panne passagère se résout seule ; une panne durable se voit sans inonder le journal ni exposer le contenu |
| Langue : déclarée par le fichier, sinon reconnue seulement si le texte est clairement en français ou en anglais, sinon inconnue | Spec §10.2 : aucune métadonnée inventée ; une détection présentée comme telle (« reconnue dans le texte ») |
| Termes caractéristiques pondérés par leur rareté dans l'index de recherche (`fts5vocab`, nombre de passages) | Pas de second index du vocabulaire : celui de la recherche est déjà tenu à jour |
| Suggestions par règles explicites (deux termes partagés avec une similarité suffisante, ou un terme et une étiquette), avec provenance et confiance, jamais acceptées d'office | Spec §10.4 : un lien suggéré n'est jamais un fait ; l'utilisateur voit pourquoi et décide |
| « Retirer » une relation trouvée par le moteur la rejette ; une relation de l'utilisateur est supprimée | Le moteur ne repropose jamais ce que l'utilisateur a écarté |
| Comparaison détaillée limitée aux 200 éléments les plus proches, et vérification des éléments sans lire leur texte | Un mot présent partout ne doit pas faire de chaque élément un candidat (mesuré : 22 ms par élément) |
| Extraction de concepts derrière un trait `ConceptExtractor`, indisponible sans fournisseur ; tables créées dès maintenant | Spec §10.3 : interface indépendante du fournisseur ; stockage séparé avec la source vérifié par des tests, sans IA simulée |
| Un même sélecteur d'éléments (recherche par titre) pour les liens internes et les relations | Un seul comportement à apprendre et à tester |

### Décisions prises en Phase 6

| Décision | Justification |
|---|---|
| Index écrit dans la transaction des données (signalements des dépôts, réindexation avant validation), et non par la file du pipeline | Le texte est déjà extrait quand il est enregistré (pdf.js compris) : l'index ne peut ni être en retard, ni diverger des données. Coût mesuré : environ 1 800 éléments par seconde |
| Passages par page de PDF, sinon d'environ 2 000 octets ; titre, étiquettes et métadonnées répétés sur chaque passage ; pas de table `document_chunks` | Le numéro de page accompagne l'extrait (spec §9.3, référence de la source) ; `bm25()` compare des passages de taille comparable ; les passages se recalculent depuis `document_contents` |
| Saisie analysée par le cœur (`ParsedQuery`) : mots entre guillemets, préfixe sur le dernier, expressions, exclusions, mots vides, ligatures | Aucune syntaxe FTS5 tapée par l'utilisateur n'est interprétée (tests d'injection) ; la recherche suit la frappe |
| Correspondance partielle par trigrammes, sur les titres seulement, après les mots entiers | Trouver « 555 » dans « NE555 » sans indexer tout le texte en trigrammes (taille) ni noyer les résultats |
| `bm25()` pondéré 10/5/2/1 (titre, étiquettes, métadonnées, texte), favoris × 1,2, éléments récents × 1,1 | Spec §9.2 : un titre qui contient le mot passe avant une simple mention dans le texte |
| Extraits balisés par des caractères de la zone privée Unicode, convertis en segments | Aucun HTML ne traverse la frontière : un texte contenant « <mark> » reste du texte |
| Dates et types lus dans l'interface par des règles, affichés comme filtres, désactivables ; un filtre explicite l'emporte | Spec §9.5 : rien ne prétend comprendre davantage. Les périodes dépendent du calendrier local de l'utilisateur, que l'interface connaît |
| Historique : 50 recherches au plus, chacune une seule fois, enregistrées quand un résultat est ouvert ou la recherche validée ; effaçable entrée par entrée ou en entier | Pas une trace de chaque frappe ; l'utilisateur garde la main |
| Index reconstruit au démarrage quand sa version change ; un échec est journalisé sans bloquer | Donnée dérivée : la reconstruire est toujours sûr, et la recherche ne doit jamais empêcher l'accès au reste |
| Un résultat « étiquette » mène à `/search?tag=<id>`, la liste des éléments qui la portent | Une étiquette n'a pas de page propre ; la recherche filtrée en tient lieu |
| Pas de recherche sémantique en Phase 6, et un message qui le dit | Spec §9.4 : optionnelle, elle dépend d'un fournisseur d'IA (Phase 9) |

### Décisions prises en Phase 5

| Décision | Justification |
|---|---|
| Éditeur TipTap 3.33.1 : StarterKit (titres, gras, italique, souligné, barré, listes, citation, code, liens, séparateur), listes de tâches, tableaux, extension Markdown officielle ; versions **exactes** et alignées | Éditeur ProseMirror éprouvé, schéma strict et navigation au clavier ; les paquets TipTap exigent la même version entre eux, la montée de version est donc délibérée |
| Contenu stocké en JSON TipTap, accompagné de son texte brut (`content_text`) | Fidélité complète du document ; le texte sert aux extraits, à la recherche de la liste des notes et à l'indexation de la Phase 6 |
| Markdown converti dans l'interface par `@tiptap/markdown` (avec `marked`), selon le schéma de l'éditeur | Aller-retour vérifié sur les titres, listes, tâches, tableaux, code, citations et liens ; le soulignement, sans équivalent en Markdown, s'écrit `<u>…</u>` et se relit tel quel |
| Liens internes : liens ordinaires vers `archive://note/<id>` ou `archive://document/<id>` | Syntaxe Markdown standard, exportée et réimportée sans perte ; la cible est désignée par son identifiant, pas par un titre ambigu. Le cœur les garde comme relations `links_to`, d'où sont lus les rétroliens et les notes qui citent un document |
| Enregistrement par révision : une écriture fondée sur une révision périmée est refusée (`stale_revision`) | Aucune perte silencieuse (spec §8.3) : l'interface propose de recharger la version enregistrée ou de garder la sienne |
| Événement « note modifiée » au plus une fois par heure et par note | L'enregistrement automatique saturerait sinon la chronologie |
| Import Markdown : fichiers choisis dans le sélecteur natif, lus, vérifiés et décodés par le cœur (UTF-8, UTF-16, Windows-1252) ; export écrit par le cœur à l'endroit choisi dans le dialogue natif | Aucun chemin ne traverse la frontière ; mêmes vérifications que la Bibliothèque. Un fichier Markdown est lu comme du texte : 16 Mo au plus (`TEXT_READ_MAX`), annoncés comme tels |
| Enregistrement automatique : 800 ms après la dernière modification, 5 s au plus pendant une saisie continue ; « Enregistré » seulement après la confirmation du cœur | Spec §8.3 : l'état affiché est vrai. Une écriture échouée le dit, garde les modifications et propose de réessayer |
| Brouillon de récupération dans le stockage local de la WebView, écrit au plus une seconde après les modifications (limité, pas différé), effacé après un enregistrement confirmé, proposé seulement sur la révision où il a été écrit | Un arrêt brutal pendant une longue saisie perd au plus une seconde ; un brouillon devenu obsolète (note modifiée ailleurs) n'est jamais proposé |
| Fermeture de la fenêtre : tant qu'un enregistrement est en attente, la demande de fermeture l'attend (3 s au plus) puis ferme ; permission `core:window:allow-destroy` | Aucune modification perdue en fermant ; vérifié par une vraie demande `WM_DELETE_WINDOW` dans la validation native |
| Liens externes ouverts par le cœur (`app_open_url` : `http`, `https` avec un hôte, `mailto`) ; liens internes ouverts par le routeur ; toute autre adresse retirée à la conversion Markdown et au chargement d'une note (le texte reste) | L'interface n'ouvre rien elle-même ; un fichier Markdown piégé (`javascript:`, `file:`) ne laisse ni lien actif ni adresse réexportée |
| Aperçu Markdown de la Bibliothèque : le texte conservé par le cœur, mis en page avec le schéma des notes, en lecture seule (1 million de caractères au plus) | Les images et le HTML brut sont écartés : rien n'est chargé depuis le réseau, rien ne s'exécute ; le fichier géré n'est pas relu |
| Étiquettes et dossiers communs aux documents et aux notes : gestionnaire d'étiquettes (renommage partout, suppression annonçant le nombre d'éléments concernés, jamais d'élément supprimé) ; déplacement d'un dossier avec son contenu, jamais dans son propre sous-arbre | Commandes `tags_usage` et `folders_move` ; les conflits de nom sont signalés dans le dialogue |
| Les retours d'un dialogue qui reste ouvert (gestionnaire d'étiquettes) s'affichent dans le dialogue, dans une région annoncée | Une notification Radix est une couche de fermeture : elle prendrait la touche Échap au dialogue |
| Dialogues : le focus initial va au premier champ du formulaire (texte sélectionné), sinon au premier contrôle | Un formulaire commence là où l'on écrit ; un dialogue peut toujours choisir lui-même |
| Liens internes en Purple, soulignés en pointillés ; liens web en Electric Blue | Purple est la couleur des relations (§4.4, design system) ; la distinction ne repose pas sur la seule couleur |

### Décisions prises en Phase 4

| Décision | Justification |
|---|---|
| Sélecteur de fichiers natif appelé **côté Rust** (`tauri-plugin-dialog`), sans permission accordée à l'interface | L'interface ne reçoit jamais de chemin choisi par elle-même ni d'accès au système de fichiers ; le cœur ouvre le dialogue et importe ce que l'utilisateur a choisi |
| Glisser-déposer : le cœur mémorise les chemins du dépôt natif, la commande d'import n'accepte aucun chemin | Une interface compromise ne peut pas demander l'import d'un fichier arbitraire |
| PDF : pdf.js 6.5 pour l'aperçu et l'extraction du texte, sans WebAssembly | Moteur éprouvé sur les fichiers mal formés (Firefox), un seul moteur PDF, CSP inchangée hors du nouveau schéma |
| DOCX : `zip` 9.8 (décompression *deflate* seule, en Rust pur) et `quick-xml` 0.42 | Lecture de `word/document.xml` et `docProps/core.xml` bornée en taille (archives piégées) ; aucun autre format de compression n'est compilé |
| Détection du type par extension autorisée **et** signature des octets, sans dépendance | Huit signatures simples ; un fichier dont le contenu contredit l'extension est refusé |
| Aperçus par la commande `documents_read_range`, plutôt qu'un schéma d'URI personnalisé | Lecture bornée et désignée par identifiant ; ni CORS ni modification de CSP ; pdf.js charge les gros PDF par plages |
| Suppression définitive : l'entrée d'abord, la copie gérée ensuite | Une copie impossible à effacer devient un fichier orphelin, jamais une entrée cassée |
| Filtres de la Bibliothèque dans un panneau aux champs étiquetés, filtres actifs en puces retirables | Huit filtres ne tiennent pas sur une ligne sans tronquer leurs libellés (audit visuel) ; les puces gardent l'état visible et se retirent d'un clic |
| Listes : seul un état du texte qui demande une action est signalé (en attente, échec, à vérifier) ; une image indique « Sans texte » | Un badge « Texte extrait » sur chaque ligne n'apporte rien, et l'afficher pour une image serait faux (pas d'OCR) |
| Aperçus des données : CSV en tableau (500 premières lignes), JSON mis en forme depuis la copie gérée (2 Mo au plus), contenu brut s'il est invalide | L'utilisateur voit son fichier tel qu'il est ; le texte aplati reste disponible dans « Texte extrait » et sert à la recherche |
| Fichiers de test générés octet par octet par `scripts/make-library-fixtures.py` | Aucun fichier binaire d'origine inconnue dans le dépôt ; les mêmes fichiers servent aux tests de bout en bout et à la validation native |

### Décisions prises en Phase 3

| Décision | Justification |
|---|---|
| Une seule requête pour la liste des espaces (archivés compris), filtrée par chaque vue | Barre latérale, pages, dialogues et archives sont toujours cohérents ; une seule invalidation |
| Dialogues d'espace rendus une seule fois par la coquille (store `workspaceDialogs`) | Ils s'ouvrent depuis la barre latérale, la barre supérieure, `Ctrl+Maj+N` ou les pages, et rendent le focus à l'élément d'origine |
| Couleurs d'espace proposées : Amber, Blue, Purple et Neutre | Spec §2.3 : Cyan est réservé à l'intelligence et les couleurs sémantiques aux états. Une couleur stockée hors de ce choix reste affichée correctement |
| Suppression d'un espace : vide, déplacement ou « sans espace », jamais de suppression de contenu | Spec §12.3. Le contenu déplacé est regroupé dans un dossier au nom de l'espace supprimé, pour rester identifiable |
| Actions des modules non livrés visibles, désactivées et marquées « Bientôt disponible » | Aucune action morte ; l'utilisateur voit ce qui arrive |
| Récupération du focus (`useFocusRecovery`) | Quand l'élément ciblé disparaît (carte archivée, page supprimée), le focus va au contenu principal au lieu de se perdre sur `body` |
| État actif des liens de la barre latérale calculé avec `useMatch` | Le déclencheur d'infobulle (Radix `Slot`) fusionne les classes en texte et cassait la fonction `className` de `NavLink` en mode replié |
| Un seul cœur natif simulé pour les tests (`src/test/coreDouble.ts`) | Mêmes règles (noms uniques, chronologie, stratégies de suppression) dans les tests unitaires et de bout en bout ; Playwright l'injecte dans la page |
| Validation native scriptée (`scripts/validate-native-phase3.py`) | Binaire de production et vraie base SQLite, pilotés sous Xvfb ; la base est vérifiée après chaque lancement |

### Décisions prises en Phase 2

| Décision | Justification |
|---|---|
| Types générés avec `ts-rs`, vérifiés par la CI | Une seule définition des données ; une divergence entre Rust et TypeScript devient impossible |
| TanStack Query | Les écrans lisent et modifient des données natives (paramètres, stockage) : cache, états et invalidation unifiés, sans réécrire ce mécanisme dans chaque écran |
| Corbeille dans le schéma (`deleted_at`), interface en Phases 4 et 5 | « Ne jamais supprimer silencieusement » : la suppression d'un document ou d'une note est réversible jusqu'à une purge explicite |
| Données dans `%LOCALAPPDATA%` | Les gros volumes ne doivent pas suivre un profil itinérant |
| Journal dans `logs/` du dossier de données | Un seul emplacement à sauvegarder et à consulter ; rotation pour borner la taille |
| L'interface attend le statut et les paramètres avant de s'afficher | Elle apparaît directement dans la langue choisie, sans flash de texte français |

### Décisions prises en Phase 1

| Décision | Justification |
|---|---|
| Radix UI pour Dialog, Tooltip, DropdownMenu et Toast | Gestion correcte du focus, du clavier et d'ARIA, difficile à réécrire sans défaut ; primitives sans style, habillées par les jetons |
| Menus non modaux | Motif WAI-ARIA « menu button ». Un menu modal masquait à axe-core des éléments encore focalisables |
| ESLint 10 sans `jsx-a11y`, accessibilité vérifiée par axe-core | `jsx-a11y` ne supporte pas ESLint 10, et ESLint 9 est en fin de vie. L'audit à l'exécution est plus fiable |
| Dictionnaires i18n maison typés (fr de référence) | Zéro dépendance ; une clé manquante est une erreur de compilation ; parité fr/en testée |
| Champs de saisie sur Obsidian | Placeholders Muted conformes AA (4,57:1) |
| Entrée de recherche visible mais indisponible jusqu'à la Phase 6 | Garder la mise en page cible sans simuler une recherche (spec §9.2) |
| Préférences d'interface non critiques en `localStorage` | Repli de la barre latérale ; les paramètres applicatifs iront en SQLite (Phase 2) |
| Identifiant provisoire `io.github.lebendo91.archive` | En attente de validation par le porteur avant toute diffusion |
