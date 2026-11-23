# ARCHIVE — consignes pour les sessions Claude Code

ARCHIVE est une application de bureau Windows, local-first, de gestion des connaissances
(Tauri 2 + React + TypeScript + SQLite). Le développement se fait **entièrement dans des sessions cloud** :
ce dépôt est la seule source de vérité, et aucune machine locale n'est requise.

## Au démarrage de chaque session (obligatoire)

1. Lire `DEVELOPMENT_PROGRESS.md` : phase courante, actions en attente, **action suivante exacte**.
2. Lire `ARCHITECTURE.md` : décisions techniques et écarts assumés.
3. Consulter `docs/SPECIFICATION.md` (cahier des charges maître) pour les sections concernées.
4. Ne pas refaire l'audit : `docs/ENVIRONMENT_AUDIT.md` fait foi. Vérifier seulement que les dépendances système
   sont présentes (commande rapide en fin d'audit) et les réinstaller si besoin. Aligner Rust sur la dernière
   version stable (`rustup update stable`) : la CI l'utilise, et une nouvelle règle clippy peut la faire échouer.
5. Inspecter les fichiers concernés avant de les modifier, sans supposer que le travail antérieur est correct.
6. Reprendre exactement à la prochaine tâche incomplète.

## Protocole de phases (spec §21–22)

- Une seule phase à la fois. Ne jamais sauter de phase ni anticiper une phase future.
- Une fonctionnalité n'est terminée que testée. **Ne jamais annoncer un test réussi qui n'a pas été exécuté.**
- Mettre à jour `DEVELOPMENT_PROGRESS.md` et `CHANGELOG.md` en continu et en fin de phase.
- Aucun bouton mort, aucune donnée factice, aucune fonctionnalité simulée, aucune statistique inventée.
- En cas de blocage dû à l'environnement : l'expliquer et proposer la meilleure alternative sûre, sans prétendre
  que la fonctionnalité marche.

## Environnement cloud

- Le conteneur Linux est **éphémère** : commiter et pousser régulièrement.
- Branches : `main` ne contient que des phases validées. Le travail se fait sur `phase/<n>-<nom>`, fusionnée par
  pull request.
- La cible est Windows : les installateurs sont construits par GitHub Actions (`windows-latest`). Aucune
  compilation croisée n'est possible dans le conteneur.
- Il n'y a pas d'affichage : utiliser `xvfb-run` pour lancer l'application native. La QA visuelle se fait avec
  Playwright + Chromium sur le frontend (Vite, IPC simulé).
- Playwright : utiliser le Chromium préinstallé (`/opt/pw-browsers/chromium`) et **ne jamais lancer
  `playwright install`**.

## Commandes de validation (à exécuter avant tout commit)

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:e2e
```

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Une commande n'est réussie que si son **code de sortie** vaut 0 : ne jamais filtrer sa sortie par un tube
(`| tail`, `| grep`) sans `set -o pipefail`, qui sinon masque l'échec.

Pour l'audit visuel : `npm run test:visual`, puis relire les captures dans `visual-audit/`.

## Conventions

- **Langues** : interface en français (architecture i18n, `src/i18n/fr.ts` comme référence) ; documentation du
  projet en français ; code, identifiants et messages de commit en anglais.
- **TypeScript** : mode strict, version 6.0.x (pas TS 7, incompatible avec `typescript-eslint`). Pas de `any`
  non justifié.
- **Données** : la WebView n'accède jamais au disque, à la base ou au réseau. Tout passe par des commandes Rust
  qui valident leurs entrées.
- **Design** : uniquement les jetons de la spec §2.3 (aucune couleur en dur), l'échelle d'espacement de 4 px,
  Lucide pour les icônes, et les règles de contraste ; voir `docs/DESIGN_SYSTEM.md`. Réutiliser les
  composants de `src/components/ui` avant d'en créer.
- **Textes** : jamais de chaîne d'interface en dur. Tout texte passe par `src/i18n/fr.ts` et `en.ts`, qui
  doivent rester en parité (vérifiée par test). Les espaces insécables s'écrivent avec la séquence
  d'échappement `\u00a0`, jamais avec le caractère brut.
- **Secrets** : jamais dans Git, ni dans le frontend, ni dans les journaux, ni en clair dans SQLite.
