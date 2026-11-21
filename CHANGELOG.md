# Changelog

Toutes les évolutions notables d'ARCHIVE sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Le projet adoptera le
[versionnage sémantique](https://semver.org/lang/fr/) dès la première version distribuable.

## [Non publié]

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
