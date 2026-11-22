# ARCHIVE — Architecture

> **Statut : Phases 1 à 3 implémentées (fondation, design system, données et stockage local, vue d'ensemble et
> espaces de travail). Les sections des phases suivantes restent l'architecture cible.** Chaque section indique la phase qui la réalise. Quand une décision est implémentée, son statut passe de
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
| Éditeur | TipTap 3 | 3.35 | Phase 5 |
| Graphe | Cytoscape.js | 3.35 | Rendu Canvas 2D, sans WebGL (Phase 8) |
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

## 4. Frontend — *Implémenté (Phases 1 à 4)*

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

La recherche globale (`Ctrl+K`) est une surcouche (overlay), pas une route. En Phase 1, les écrans dont le
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

## 5. Cœur natif Rust — *Implémenté (Phases 1 à 4)*

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
| `document_chunks` | Passages avec numéro de page : base de la recherche, des citations et du contexte IA | 4/6 |
| `notes`, `note_links` | Notes (`content_format = 'tiptap-json'` + texte dérivé), liens internes, rétroliens | 2/5 |
| `tags`, `document_tags`, `note_tags` | Étiquettes | 2 |
| `relations` | Relations, avec `origin` (`user`, `rule`, `ai`), `status` (`suggested`, `accepted`, `rejected`), `confidence` et `provenance_json` | 2/7 |
| `concepts`, `concept_mentions` | Concepts extraits et leur source, séparés du contenu original (spec §10.3) | 7 |
| `timeline_events` | Événements réels, enregistrés **dès la Phase 3** | 2 |
| `processing_jobs` | File persistante du pipeline (elle survit aux redémarrages) | 4 |
| `search_history` | Historique de recherche, effaçable | 6 |
| `app_settings` | Paramètres clé/valeur | 2 |
| `ai_providers` | Fournisseur, modèle, préférences non secrètes et **référence** vers le secret | 9 |
| `conversations`, `messages`, `message_citations` | Assistant IA | 9 |
| `backups` | Historique des sauvegardes | 10 |

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

## 8. Pipeline d'import et moteur de mémoire — *Import implémenté (Phase 4), mémoire prévue (Phase 7)*

Étapes de la spec §10.1 : **Import → Extraction → Normalisation → Indexation → Analyse → Relations.** Chaque
étape a son propre statut : `pending`, `processing`, `completed`, `failed` ou `needs_attention`.

- **Import** (pour chaque fichier, avec progression et annulation) : validation, identification du type, lecture
  des métadonnées, attribution de l'identifiant, empreinte, copie, insertion en base (transaction), mise en
  file, événement de chronologie. Mêmes étapes que la spec §7.2.
- **Phase 4 (implémenté)** : l'extraction se fait pendant l'import, fichier par fichier, bornée en taille ; un
  fichier dont le texte ne peut être extrait est conservé, marqué `failed` avec la raison
  (`metadata.extractionIssue`), jamais refusé pour cela. Les échecs d'accès temporaires (fichier illisible,
  copie ou écriture impossible) peuvent être relancés depuis le panneau d'import.
- **Worker d'arrière-plan** (Phases 6 et 7, avec l'indexation et l'analyse) : il dépilera une file persistante
  `processing_jobs`, avec reprise sur erreur et backoff. Les échecs resteront visibles (`needs_attention`) et
  pourront être relancés.
- **Extracteurs** (`import/extract.rs`, chacun borné en taille, sans panic sur un fichier mal formé) :
  - TXT et MD : détection d'encodage (BOM, validation UTF-8, repli Windows-1252, fréquent dans les anciens
    fichiers français).
  - CSV : texte structuré (en-têtes et lignes, borné). JSON : valeurs textuelles aplaties avec leur chemin de clé.
  - DOCX : `zip` + `quick-xml` (`word/document.xml` pour les paragraphes, titres et tableaux,
    `docProps/core.xml` pour l'auteur, les dates et le titre).
  - PDF : **pdf.js** (décidé en Phase 4), déjà requis pour l'aperçu. L'extraction s'exécute dans son Web
    Worker, page par page ; le texte est envoyé au cœur, qui le valide (taille bornée) et l'enregistre. Un PDF
    importé reste « en attente » jusqu'à cette étape, reprise au lancement suivant si l'application est fermée
    entre-temps. pdf.js tourne **sans WebAssembly** (`useWasm: false`, décodeurs JavaScript de repli) : la CSP
    n'a pas besoin de `wasm-unsafe-eval`, au prix d'un décodage plus lent des rares images JBIG2 et JPEG 2000.
  - Images : stockage et aperçu uniquement. **Aucune extraction de texte sans moteur OCR réellement intégré**
    (spec §7.1).
- **Métadonnées** : jamais inventées. Un champ indisponible reste vide ou marqué « inconnu » (spec §10.2).
- **Analyse et relations** (Phase 7) : d'abord des règles déterministes, sans IA : liens explicites, étiquettes
  partagées, même espace de travail, termes distinctifs communs (via la table virtuelle `fts5vocab`).
  L'extraction de concepts par IA vient ensuite, en option, derrière un trait `ConceptExtractor`. Une relation
  suggérée n'est **jamais présentée comme un fait** : l'utilisateur l'accepte, la rejette ou la modifie
  (spec §10.5).

## 9. Recherche et indexation — *Prévu (Phase 6)*

- **Index FTS5 unifié** sur les notes et les passages de documents :
  `search_index(entity_type UNINDEXED, entity_id UNINDEXED, chunk_id UNINDEXED, title, body, tags,
  tokenize = 'unicode61 remove_diacritics 2')`. Il est alimenté par le pipeline (et non par des déclencheurs),
  pour que les extractions longues restent asynchrones. Un index `trigram` complémentaire sur les titres permet
  les correspondances partielles.
- **Classement** : `bm25()` pondéré (titre, puis étiquettes, puis corps), avec un léger bonus pour les favoris et
  les éléments récents.
- **Extraits** : `snippet()` et `highlight()`. Les marqueurs sont convertis en segments React, jamais en HTML
  brut (aucune injection possible).
- **Analyse des requêtes** : la saisie utilisateur n'est jamais concaténée dans la syntaxe FTS5. Les termes sont
  échappés, un préfixe `*` s'applique au dernier terme (recherche pendant la frappe), et les filtres (type, espace,
  étiquette, date) passent par des jointures SQL.
- **Expressions de date** (« importés la semaine dernière ») : un analyseur à règles explicites, présenté comme
  tel. Aucune fausse « compréhension du langage naturel » (spec §9.5).
- **Recherche sémantique** (optionnelle, après la Phase 6) : embeddings par passage via le fournisseur configuré,
  similarité calculée en Rust, désactivée par défaut. Repli sur FTS5 avec une explication (spec §9.4).

## 10. Graphe de connaissances et chronologie — *Prévu (Phase 8)*

- **Graphe** : Cytoscape.js en rendu Canvas. Le sous-graphe est calculé en Rust, après filtrage, avec un plafond
  de nœuds (environ 300 par défaut) et une expansion progressive des voisins à la demande. La disposition
  (*layout*) n'est recalculée que si les données filtrées changent, et les positions sont mises en cache.
- **Chronologie** : elle lit `timeline_events`, alimentée dès les Phases 3 à 5, si bien que l'historique est réel
  depuis le début. Elle propose des filtres et un effacement explicite (spec §13.2).

## 11. Couche IA — *Prévu (Phase 9)*

- **Trait Rust `AiProvider`** : `capabilities()`, `test_connection()` et `stream_chat(requête)`, qui produit un
  flux d'événements (fragments de texte, usage, fin, erreurs). Les implémentations Anthropic, OpenAI et Gemini
  sont isolées chacune dans son module. Le reste de l'application ne connaît que le trait et un registre
  (spec §14.2).
- **Les appels HTTP partent de Rust**, jamais de la WebView. La clé API n'entre donc jamais dans le JavaScript,
  et la CSP interdit toute connexion externe depuis l'interface.
- **Clés** : un trait `SecretStore` s'appuie sur `keyring` (Windows Credential Manager). La base ne stocke
  qu'une référence. Si le stockage sécurisé est indisponible, l'interface l'explique et la clé n'est gardée qu'en
  mémoire pour la session (spec §14.3).
- **Contexte** : la portée est choisie par l'utilisateur (documents, notes, espace). La récupération se fait sur
  les passages via FTS5, et via les embeddings s'ils sont activés. **La liste des sources envoyées est visible**,
  et seuls les passages nécessaires partent (spec §14.4, §14.6).
- **Citations** : les passages sont numérotés `[S1…Sn]`, avec document et page. Seules les citations qui
  renvoient à un passage réellement envoyé deviennent des liens cliquables. Sans matériau pertinent, l'assistant
  le dit (spec §14.5). Des badges distinguent l'information issue d'ARCHIVE, les connaissances générales du
  modèle et l'interprétation.
- **Modèles** : pas de liste figée dans le code. Les valeurs par défaut seront prises dans la documentation
  officielle des fournisseurs au moment de la Phase 9, et la saisie libre d'un identifiant de modèle reste
  possible.
- **Aucun appel sans action explicite de l'utilisateur**, test de connexion compris (spec §15.4).

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
| Performance | Jeux synthétiques générés (100, 500 et 1 000 documents, 1 000 notes), jamais livrés par défaut | Conteneur | Phases 6 et 10 |

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

### Décisions prises en Phase 5

| Décision | Justification |
|---|---|
| Éditeur TipTap 3.33.1 : StarterKit (titres, gras, italique, souligné, barré, listes, citation, code, liens, séparateur), listes de tâches, tableaux, extension Markdown officielle ; versions **exactes** et alignées | Éditeur ProseMirror éprouvé, schéma strict et navigation au clavier ; les paquets TipTap exigent la même version entre eux, la montée de version est donc délibérée |
| Contenu stocké en JSON TipTap, accompagné de son texte brut (`content_text`) | Fidélité complète du document ; le texte sert aux extraits, à la recherche de la liste des notes et à l'indexation de la Phase 6 |
| Markdown converti dans l'interface par `@tiptap/markdown` (avec `marked`), selon le schéma de l'éditeur | Aller-retour vérifié sur les titres, listes, tâches, tableaux, code, citations et liens ; le soulignement, sans équivalent en Markdown, s'écrit `<u>…</u>` et se relit tel quel |
| Liens internes : liens ordinaires vers `archive://note/<id>` ou `archive://document/<id>` | Syntaxe Markdown standard, exportée et réimportée sans perte ; la cible est désignée par son identifiant, pas par un titre ambigu. Le cœur les garde comme relations `links_to`, d'où sont lus les rétroliens et les notes qui citent un document |
| Enregistrement par révision : une écriture fondée sur une révision périmée est refusée (`stale_revision`) | Aucune perte silencieuse (spec §8.3) : l'interface propose de recharger la version enregistrée ou de garder la sienne |
| Événement « note modifiée » au plus une fois par heure et par note | L'enregistrement automatique saturerait sinon la chronologie |
| Import Markdown : fichiers choisis dans le sélecteur natif, lus, vérifiés et décodés par le cœur (UTF-8, UTF-16, Windows-1252) ; export écrit par le cœur à l'endroit choisi dans le dialogue natif | Aucun chemin ne traverse la frontière ; mêmes vérifications que la Bibliothèque |

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
