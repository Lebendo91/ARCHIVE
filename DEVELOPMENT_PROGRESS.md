# ARCHIVE — Suivi de développement

> Document de continuité (spec §22). **Toute session commence par sa lecture**, puis par celle
> d'[ARCHITECTURE.md](ARCHITECTURE.md). Mettre à jour en continu et en fin de phase.

## Phase courante

**Phase 0 — Audit de l'environnement : terminée** (2026-11-21), sous réserve d'une action du porteur du projet :
la création du dépôt distant (voir « Actions en attente »).
**Prochaine phase : Phase 1 — Fondation et design system** (non commencée).

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Audit de l'environnement | ✅ Terminée |
| 1 | Fondation et design system | ⏳ Prochaine |
| 2 | Base de données et stockage local | À faire |
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

1. **Créer le dépôt GitHub** : un dépôt privé et **vide** nommé `archive` (sans README, licence ni `.gitignore`),
   sur https://github.com/new. La session cloud ne peut pas créer de dépôt elle-même (audit C7). Une fois le
   dépôt créé, il est rattaché à la session et l'historique local y est poussé.
2. *(Avant le premier build distribué, Phase 1)* **Choisir l'identifiant d'application** : il détermine le dossier
   de données et ne pourra plus changer ensuite (ARCHITECTURE §16).
3. *(Phase 1)* **Signature de marque** : garder « Everything you know. Nothing forgotten. » en anglais, ou la
   traduire (ARCHITECTURE §16).

---

## Phase 0 — Audit de l'environnement (terminée)

### Tâches réalisées

- [x] Inspection du répertoire de travail : vide, aucun projet existant à préserver.
- [x] Système : Ubuntu 24.04.5, 4 vCPU, 15 Gio de RAM, 61 Go de disque disponibles selon `df`, pas d'affichage.
- [x] Environnements d'exécution : Node 22.23.5, npm 10.9.9, Rust/Cargo 1.97.0, clippy et rustfmt.
- [x] Prérequis Tauri Linux : manquants au départ, **installés et vérifiés** (WebKitGTK 4.1 2.52.6, GTK 3.24,
      libsoup 3.4…).
- [x] Réseau : npm et crates.io accessibles ; création de dépôt GitHub, releases GitHub et téléchargements
      Microsoft bloqués.
- [x] Versions actuelles des dépendances relevées (npm et crates.io) ; incompatibilité TypeScript 7 /
      `typescript-eslint` détectée.
- [x] Sonde FTS5 : SQLite 3.54.1 embarqué, recherche insensible aux accents, préfixes, extraits, trigram.
- [x] Sonde Tauri : compilation et édition de liens avec WebKitGTK réussies (1 min 57 s, build release).
- [x] Contrastes WCAG de la palette calculés ; règles d'usage établies (ARCHITECTURE §4.4).
- [x] Dépôt git local initialisé (`main`), documentation fondatrice rédigée.
- [x] Stack confirmée, écarts justifiés, décisions ouvertes listées (ARCHITECTURE §2, §3, §16).

### Tâches incomplètes

- [ ] **Pousser vers GitHub** : bloqué tant que le dépôt n'existe pas (action n°1 du porteur).
- [ ] **Enregistrer le script de configuration de l'environnement cloud** (réinstallation automatique des
      dépendances système à chaque session) : à faire dès que le dépôt est rattaché, puis à compléter en
      Phase 1 (`npm ci`).

### Fichiers créés

| Fichier | Rôle |
|---|---|
| `docs/SPECIFICATION.md` | Cahier des charges maître, conservé à l'identique (source de vérité du périmètre) |
| `docs/ENVIRONMENT_AUDIT.md` | Audit complet : système, outils, réseau, sondes, compatibilité |
| `ARCHITECTURE.md` | Architecture cible et décisions techniques |
| `DEVELOPMENT_PROGRESS.md` | Ce document |
| `CHANGELOG.md` | Journal des changements |
| `README.md` | Présentation du projet |
| `CLAUDE.md` | Consignes de reprise pour les sessions Claude Code |
| `.gitignore`, `.gitattributes`, `.editorconfig` | Hygiène du dépôt (fins de ligne LF, encodage UTF-8) |

### Fichiers modifiés

Aucun : il n'existait aucun fichier avant cette phase.

### Décisions techniques

| Décision | Justification | Référence |
|---|---|---|
| Stack de la spec confirmée sans substitution | Aucune incompatibilité bloquante ; Tauri et FTS5 validés par sondes | ARCHITECTURE §2 |
| **TypeScript 6.0.x** au lieu de 7.0 | `typescript-eslint` exige `<6.1.0` | Audit C5 |
| npm comme gestionnaire de paquets | Universel, rien à installer en plus sur la CI Windows | ARCHITECTURE §2 |
| Le cœur Rust possède base, fichiers, réseau et secrets | Sécurité (spec §18.3) : la WebView ne reçoit aucune permission `fs`, `shell` ni `http` | ARCHITECTURE §1, §12 |
| Appels IA depuis Rust | La clé API ne transite jamais par le JavaScript | ARCHITECTURE §11 |
| Installateurs Windows construits par GitHub Actions | Cible Windows, conteneur Linux, compilation croisée impossible | Audit C1, C2 |
| QA visuelle avec Playwright + Chromium | Même moteur que WebView2 sous Windows | Audit C3 |
| Migrations dans `src-tauri/migrations/` | Embarquées à la compilation, chemins stables | ARCHITECTURE §3 |
| Texte extrait séparé de `documents` | Listes légères avec de gros documents (spec §4.2) | ARCHITECTURE §6.3 |
| UUID v7 et horodatages en millisecondes UTC | Tri temporel, stabilité à travers les sauvegardes | ARCHITECTURE §6.2 |
| `createHashRouter` | Identique sous Vite, Tauri et Playwright | ARCHITECTURE §4.2 |
| i18n maison typée, français comme référence | Zéro dépendance, clé manquante détectée à la compilation | ARCHITECTURE §4.5 |
| Muted réservé à Obsidian pour le petit texte ; texte Obsidian sur les boutons d'accent | Contrastes WCAG calculés | ARCHITECTURE §4.4 |

### Dépendances ajoutées

- **Au projet** : aucune (pas encore de `package.json` ni de `Cargo.toml` : c'est la Phase 1).
- **Au conteneur** (système, non persistant) : `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`,
  `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `file`, `patchelf`, `sqlite3`,
  `webkit2gtk-driver`.

### Tests et vérifications exécutés

| Vérification | Commande ou méthode | Résultat |
|---|---|---|
| Installation des prérequis Tauri | `apt-get install …` (audit §4) | ✅ code de sortie 0, bibliothèques détectées par `pkg-config` |
| Sonde FTS5 (projet jetable) | `cargo run` avec `rusqlite 0.43` (`bundled`) | ✅ FTS5 actif, accents, préfixes, `snippet`, trigram (sortie dans l'audit §7.1) |
| Sonde Tauri (projet jetable) | `cargo run --release` avec `tauri 2.12` | ✅ compile en 1 min 57 s, lié à `libwebkit2gtk-4.1`, `libgtk-3`, `libsoup-3.0` |
| Accès réseau | `curl` vers npm, crates.io, GitHub, Microsoft | ✅ relevé consigné (audit §5) |
| Compatibilité des dépendances | `npm view … peerDependencies` | ✅ incompatibilité TS 7 détectée et traitée |
| Contrastes de la palette | calcul WCAG 2.x (script Python) | ✅ tableau dans ARCHITECTURE §4.4 |

Aucun test applicatif : il n'existe pas encore de code applicatif.

### Bugs connus

Aucun.

### Limites restantes

- L'historique n'existe qu'en local tant que le dépôt distant n'est pas créé. **Le conteneur est éphémère** :
  pousser au plus vite.
- Les comportements propres à Windows (Credential Manager, Explorateur, verrous de fichiers, WebView2) ne sont
  vérifiables que sur la CI Windows ou sur un poste Windows 11 réel (audit C11).
- Dans le conteneur, les mesures de performance ne sont qu'indicatives de la machine cible (audit C12).

---

## Plan de la Phase 1 — Fondation et design system

| # | Tâche | Critère de validation |
|---|---|---|
| **1.1** | **Socle du projet** (détail ci-dessous) | Builds et contrôles statiques au vert, application lancée sous Xvfb, CI verte |
| 1.2 | Jetons de design (`@theme`), polices embarquées, styles de base, mouvement réduit | Test automatisé des contrastes ; aucune couleur en dur hors des jetons |
| 1.3 | Identité : logo SVG original, logotype ARCHIVE, icônes d'application (`tauri icon`) | Lisible de 16 px à 1024 px ; icône Windows générée |
| 1.4 | Composants UI : Button, IconButton, Input, Card, Dialog, Toast, Tooltip, Spinner/Skeleton, EmptyState, Kbd, avec tous leurs états | Tests Vitest/RTL (états, clavier, ARIA) |
| 1.5 | Mise en page : AppShell, Sidebar (repli, infobulles, sections, état actif, défilement), Topbar, routes de tous les écrans avec états vides honnêtes, page d'aide et raccourcis | Navigation complète au clavier ; aucun bouton mort |
| 1.6 | Infrastructure i18n (fr/en) et gestionnaire de raccourcis clavier (`Esc`, `Ctrl+,`…) | Tests unitaires ; clé manquante = erreur de compilation |
| 1.7 | QA visuelle : captures Playwright à 1440×900, 1280×800 et 1100×700 de chaque écran, audit, corrections, documentation | Aucun défaut visuel majeur, aucune erreur console critique |

### ▶ Action suivante exacte

1. **Dès que le dépôt `archive` existe** : le rattacher à la session (`add_repo`, accès en écriture), ajouter
   le remote, pousser `main`, puis enregistrer le script de configuration de l'environnement cloud.
2. **Puis tâche 1.1, socle du projet**, sur la branche `phase/1-foundation` :
   - Initialiser à la racine un projet **Vite 8 + React 19 + TypeScript 6.0.x** (npm) :
     `package.json` (scripts `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `tauri`), `vite.config.ts`
     (port fixe, `clearScreen: false`), `tsconfig` strict, ESLint 10 (`typescript-eslint`, `react-hooks`),
     Prettier.
   - Initialiser **`src-tauri/`** avec Tauri 2.12 : `Cargo.toml` (édition 2024), `build.rs`, `lib.rs` et
     `main.rs`, `tauri.conf.json` (nom produit ARCHIVE, fenêtre par défaut 1440×900 et minimale 1100×700, CSP
     stricte selon ARCHITECTURE §12), `capabilities/default.json` minimal (aucune permission `fs`, `shell` ni
     `http`). L'identifiant provisoire est `io.github.lebendo91.archive`, à confirmer par le porteur avant toute
     diffusion.
   - Ajouter `.github/workflows/ci.yml` (Ubuntu : contrôles et tests) et `.github/workflows/windows-build.yml`
     (`windows-latest`, déclenchement manuel et tags : installateurs MSI et NSIS en artefacts).
   - **Valider** : `npm run typecheck`, `npm run lint`, `npm run build`, puis `cargo fmt --check`,
     `cargo clippy -- -D warnings` et `cargo test` dans `src-tauri/`, puis `npm run tauri build -- --no-bundle`.
     Lancer le binaire sous `xvfb-run` et vérifier l'absence d'erreur critique. Pousser la branche et vérifier
     que la CI Linux passe, puis déclencher une fois le build Windows et vérifier que l'installateur est produit.
