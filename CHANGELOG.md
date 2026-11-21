# Changelog

Toutes les évolutions notables d'ARCHIVE sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Le projet adoptera le
[versionnage sémantique](https://semver.org/lang/fr/) dès la première version distribuable.

## [Non publié]

### Ajouté — Phase 1 : fondation et design system (2026-11-21)

- Application de bureau Tauri 2 : cœur Rust (commandes `app_info` et `log_frontend_event`), CSP stricte,
  permissions minimales (aucun accès disque, shell ou HTTP pour l'interface), fenêtre de 1440×900 avec un
  minimum de 1100×700.
- Identité visuelle : symbole ARCHIVE original (« A » découpé en strates, sommet Archive Amber), logotype,
  icône d'application et icônes Windows.
- Design system « Obsidian Knowledge Systems » : jetons conformes à la palette de la spécification, polices
  embarquées (Inter, Space Grotesk, JetBrains Mono), règles de contraste WCAG, mouvement réduit
  (`docs/DESIGN_SYSTEM.md`).
- Composants accessibles : boutons, champs, cartes, dialogues (dont la confirmation destructive),
  notifications, infobulles, menus, badges, indicateurs de chargement, états vides.
- Coquille de l'application :
  - barre latérale repliable et barre supérieure avec fil d'Ariane et menu du profil local ;
  - navigation vers tous les modules, avec des états vides honnêtes ;
  - Paramètres avec une section « À propos » réelle, page Aide avec la référence des raccourcis, page 404 ;
  - gestion des erreurs.
- Interface en français avec une architecture i18n typée (anglais complet), raccourcis `Ctrl+,` et `Échap`.
- Qualité :
  - 78 tests unitaires et d'intégration ;
  - 33 tests de bout en bout, dont l'audit d'accessibilité axe-core WCAG 2.2 A/AA de chaque écran ;
  - 7 tests Rust ;
  - audit visuel à trois résolutions.
- CI GitHub Actions :
  - contrôles Linux (frontend, bout en bout, cœur natif) ;
  - build des installateurs Windows MSI et NSIS, avec un test de fumée et une capture sur Windows.

### Ajouté — Phase 0 : audit de l'environnement (2026-11-21)

- Audit complet de l'environnement de développement cloud : système, environnements d'exécution, prérequis
  Tauri, accès réseau et versions actuelles des dépendances (`docs/ENVIRONMENT_AUDIT.md`).
- Sondes de faisabilité réussies : SQLite FTS5 avec recherche insensible aux accents français, et compilation
  de Tauri 2 liée à WebKitGTK.
- Architecture cible : stack confirmée, modèle de sécurité, schéma de données prévisionnel, pipeline
  d'import, recherche, couche IA, CI/CD et dépendances entre modules (`ARCHITECTURE.md`).
- Règles de contraste WCAG du design system, calculées sur la palette officielle.
- Suivi de développement et plan détaillé de la Phase 1 (`DEVELOPMENT_PROGRESS.md`).
- Cahier des charges maître versionné dans le dépôt (`docs/SPECIFICATION.md`).
- Consignes de reprise pour les sessions cloud (`CLAUDE.md`), `README.md` et configuration du dépôt
  (`.gitignore`, `.gitattributes`, `.editorconfig`).
