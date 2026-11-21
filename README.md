# ARCHIVE

**ARCHIVE — Your Second Brain.**
*Everything you know. Nothing forgotten.*

ARCHIVE est une application de bureau Windows de gestion des connaissances personnelles. Elle réunit les
documents, les notes et les idées de l'utilisateur dans un système structuré, interrogeable et relié, où les
informations s'organisent selon leur contenu, leurs relations et leur contexte.

- **Local d'abord** : les données restent sur la machine de l'utilisateur. Aucun service cloud n'est requis.
- **Recherche plein texte** dans le contenu des documents et des notes, insensible aux accents.
- **Relations et graphe de connaissances** : liens explicites, détectés ou suggérés, toujours sous le contrôle
  de l'utilisateur.
- **Assistant IA optionnel**, fondé sur les sources choisies par l'utilisateur, avec citations vérifiables.

## État du projet

**Phase 0 (audit de l'environnement) terminée. Il n'existe pas encore d'application exécutable.**
Le développement suit 11 phases séquentielles (0 à 10), décrites dans le [cahier des charges](docs/SPECIFICATION.md).
L'avancement détaillé se trouve dans [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md).

## Fonctionnalités prévues

| Module | Phase |
|---|---|
| Shell de l'application et design system « Obsidian Knowledge Systems » | 1 |
| Base de données SQLite locale, migrations, stockage des fichiers | 2 |
| Vue d'ensemble et espaces de travail | 3 |
| Bibliothèque : import PDF, DOCX, TXT, MD, CSV, JSON et images ; aperçu, étiquettes, dossiers | 4 |
| Notes : éditeur riche, enregistrement automatique, liens internes, Markdown | 5 |
| Recherche globale (`Ctrl+K`) sur SQLite FTS5 | 6 |
| Moteur de mémoire : file de traitement, relations, provenance | 7 |
| Graphe de connaissances et chronologie | 8 |
| Assistant IA multi-fournisseur, avec citations | 9 |
| Sauvegarde, restauration, export, installateur Windows | 10 |

## Stack technique

Tauri 2 (Rust) · React 19 · TypeScript 6 · Vite 8 · Tailwind CSS 4 · Zustand · SQLite (FTS5) · TipTap ·
Cytoscape.js · Lucide. Le détail et les justifications sont dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Prérequis

**Pour utiliser l'application** (dès qu'un installateur existera) : Windows 11, avec WebView2, présent par défaut.

**Pour développer** :
- Node.js ≥ 22.12 et npm
- Rust stable (≥ 1.85, édition 2024)
- Les [prérequis système de Tauri 2](https://v2.tauri.app/start/prerequisites/) de la plateforme. Sous
  Linux, la liste des paquets est dans [docs/ENVIRONMENT_AUDIT.md](docs/ENVIRONMENT_AUDIT.md), §4.

Le développement se fait entièrement dans des sessions cloud. Les installateurs Windows seront produits par
GitHub Actions : aucune machine locale n'est nécessaire pour compiler.

## Installation et commandes

Le projet sera initialisé en Phase 1 (tâche 1.1). Les commandes d'installation, de développement
(`npm run tauri dev`), de test et de build seront documentées ici à ce moment-là.

## Structure du dépôt

```text
archive/
├── docs/
│   ├── SPECIFICATION.md       # Cahier des charges maître (référence du périmètre)
│   └── ENVIRONMENT_AUDIT.md   # Audit de l'environnement de développement
├── ARCHITECTURE.md            # Architecture et décisions techniques
├── DEVELOPMENT_PROGRESS.md    # Suivi de développement et prochaine action
├── CHANGELOG.md               # Journal des changements
├── CLAUDE.md                  # Consignes de reprise pour les sessions Claude Code
└── README.md
```

La structure cible complète (`src/`, `src-tauri/`, `tests/`…) est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md), §3.

## Licence

Dépôt privé, aucune licence accordée à ce stade. Tous droits réservés au porteur du projet.
