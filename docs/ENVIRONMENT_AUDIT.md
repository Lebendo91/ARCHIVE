# ARCHIVE — Audit de l'environnement (Phase 0)

| | |
|---|---|
| **Date de l'audit** | 2026-11-21 |
| **Contexte** | Session Claude Code dans un conteneur cloud (Linux), sans dépendance à la machine du porteur du projet |
| **Statut** | Terminé : référence pour toutes les phases suivantes |

> Les sessions suivantes **ne doivent pas refaire cet audit** (spec §21, Phase 0). Elles relisent ce
> document et revérifient seulement ce qui a pu changer : versions installées dans le nouveau
> conteneur et présence des dépendances système (voir §8, « Vérification rapide en début de session »).

---

## 1. Situation de départ

- Répertoire de travail initial `/home/user` : **vide**. Aucun projet, aucun fichier source et aucune dépendance existants.
- Aucun dépôt GitHub `archive` n'existait sur le compte du porteur du projet.
- Le projet est donc créé de zéro dans `/home/user/archive` (dépôt git, branche `main`).

## 2. Système

| Élément | Valeur constatée |
|---|---|
| OS | Ubuntu 24.04.5 LTS (Noble Numbat), x86_64 |
| Noyau | Linux 6.18.44 |
| CPU | 4 vCPU |
| RAM | 15 Gio, pas de swap |
| Disque | 252 Go au total, 61 Go disponibles selon `df` (le quota réel par session peut être inférieur) |
| Affichage | Aucun (`DISPLAY` non défini) ; `Xvfb` et `xvfb-run` disponibles |
| Conteneur | Éphémère : il est recyclé après inactivité. Tout ce qui doit durer doit être commité **et poussé**. |

## 3. Environnements d'exécution et outils

| Outil | Version | Remarque |
|---|---|---|
| Node.js | 22.23.5 | Compatible Vite 8 (Node ≥ 22.12 requis) |
| npm | 10.9.9 | **Gestionnaire retenu** |
| pnpm / yarn / bun | 10.28.0 / 1.22.22 / 1.4.4 | Présents, non utilisés |
| rustc / cargo | 1.97.0 / 1.97.0 | Toolchain stable ; `clippy` et `rustfmt` présents |
| rustup | 1.28.2 | Seule cible installée : `x86_64-unknown-linux-gnu` |
| git | 2.43.0 | Signature des commits configurée par l'environnement |
| gh | 2.89.0 | **Inutilisable** : le jeton `GH_TOKEN` est invalide (voir §5) |
| Python | 3.13.18 | Outillage annexe uniquement |
| clang / lld / llvm-rc | 18.1.3 | Présents |
| gcc / make / cmake | 13.3.0 / 4.3 / 3.28.3 | `build-essential` installé |
| pkg-config | 1.8.1 | |
| Playwright | 1.63.0 (global) | Chromium 157.0.8103.78 préinstallé dans `/opt/pw-browsers` (`/opt/pw-browsers/chromium`) |
| sqlite3 (CLI) | 3.45.1 | Installé pendant l'audit (débogage uniquement) |

## 4. Prérequis Tauri 2 sous Linux

État initial : `build-essential`, `libssl-dev` (OpenSSL 3.0.13) et `xvfb` étaient présents. **WebKitGTK, GTK 3,
libsoup 3, appindicator, librsvg et xdo manquaient.**

Installés pendant l'audit (commande vérifiée, code de sortie 0) :

```bash
apt-get update && apt-get install -y --no-install-recommends libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev file patchelf sqlite3 webkit2gtk-driver
```

| Bibliothèque | Version après installation |
|---|---|
| webkit2gtk-4.1 / javascriptcoregtk-4.1 | 2.52.6 |
| gtk+-3.0 | 3.24.41 |
| libsoup-3.0 | 3.4.4 |
| ayatana-appindicator3 | 0.5.90 |
| librsvg-2.0 | 2.58.0 |
| libxdo | `libxdo.so.3` présent (Ubuntu ne fournit pas de fichier `.pc`, ce qui est normal) |
| WebKitWebDriver | `/usr/bin/WebKitWebDriver` (pour de futurs tests E2E via `tauri-driver`) |

Ces paquets disparaissent avec le conteneur. Ils doivent être réinstallés à chaque nouvelle session, soit via
le script de configuration de l'environnement cloud (à enregistrer, voir DEVELOPMENT_PROGRESS.md), soit
manuellement avec la commande ci-dessus.

## 5. Réseau et accès GitHub

| Destination | Résultat | Conséquence |
|---|---|---|
| `registry.npmjs.org` | Accessible | Dépendances npm installables |
| `index.crates.io` / `static.crates.io` | Accessibles | Compilation Rust possible (confirmée par les sondes) |
| `api.github.com` | Accessible ; identifiants du compte du porteur injectés par le proxy | Limité aux **dépôts rattachés à la session** |
| Création de dépôt (`POST /user/repos`) | **Refusée** par le proxy (« sessions are bound to their configured repositories ») | Le porteur du projet doit créer le dépôt lui-même |
| `github.com` (pages et téléchargements de releases) | **Refusé** (403) | Aucun outil ne doit dépendre de binaires téléchargés depuis des releases GitHub dans le conteneur |
| `aka.ms`, `download.visualstudio.microsoft.com` | **Injoignables** | Impossible de récupérer le CRT MSVC ou le SDK Windows : pas de compilation croisée Windows |
| Polices | Aucun accès réseau requis | Polices embarquées via les paquets npm `@fontsource-variable/*` |

## 6. Versions de référence des dépendances (registres, 2026-11-21)

### npm

| Paquet | Dernière version | Décision |
|---|---|---|
| `@tauri-apps/cli` / `@tauri-apps/api` | 2.12.6 / 2.12.5 | Retenus |
| `react` / `react-dom` | 19.3.1 | Retenus |
| `vite` / `@vitejs/plugin-react` | 8.3.8 / 6.3.0 | Retenus (le plugin exige Vite ^8) |
| `typescript` | 7.0.2 (`latest`), 6.0.3 (branche 6.x) | **6.0.x** : `typescript-eslint` exige `typescript >=4.8.4 <6.1.0` |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.5 | Retenus (compatible Vite 8) |
| `zustand` | 5.1.0 | Retenu |
| `react-router` | 8.5.2 | Retenu |
| `lucide-react` | 1.77.0 | Retenu |
| `@tiptap/react` | 3.35.0 | Phase 5 (compatible React 19) |
| `cytoscape` | 3.35.0 | Phase 8 |
| `pdfjs-dist` | 6.5.438 | Phase 4 |
| `vitest` | 5.1.1 | Retenu (compatible Vite 8) |
| `@testing-library/react` / `jsdom` | 16.3.3 / 31.0.1 | Retenus |
| `@playwright/test` | 1.65.1 | Voir C9 : navigateurs préinstallés en 1.63.0 |
| `eslint` / `eslint-plugin-react-hooks` | 10.15.0 / 7.1.1 | Retenus |
| `@tauri-apps/plugin-dialog` / `plugin-opener` | 2.8.4 / 2.7.3 | Retenus |
| `@fontsource-variable/{inter, space-grotesk, jetbrains-mono}` | 5.3.0 | Retenus |

### crates.io

| Crate | Dernière version | Usage prévu |
|---|---|---|
| `tauri` / `tauri-build` | 2.12.7 / 2.7.6 | Shell desktop (Phase 1) |
| `tauri-plugin-dialog` / `tauri-plugin-opener` | 2.8.4 / 2.7.3 | Sélecteur de fichiers, « Afficher dans l'Explorateur » |
| `rusqlite` (feature `bundled`) | 0.43.0 | SQLite + FTS5 (Phase 2) |
| `uuid` (feature `v7`) | 1.29.3 | Identifiants internes |
| `sha2` | 0.11.1 | Empreinte de contenu (anti-doublons) |
| `thiserror` / `serde_json` / `tokio` | 2.0.21 / 1.0.154 / 1.54.1 | Erreurs, sérialisation, asynchrone |
| `zip` / `quick-xml` | 9.8.1 / 0.42.0 | Extraction DOCX, sauvegardes |
| `pdf-extract` / `lopdf` | 0.12.1 / 0.47.0 | Alternative Rust pour l'extraction PDF (décision en Phase 4) |
| `keyring` | 4.2.0 | Gestionnaire d'identifiants Windows (Phase 9) |
| `reqwest` | 0.13.5 | Appels aux fournisseurs IA (Phase 9) |

Les versions exactes sont figées par `package-lock.json` et `Cargo.lock` dès leur création (Phase 1).

## 7. Sondes de faisabilité (projets jetables, hors dépôt)

### 7.1 SQLite FTS5 et français : **réussi**

Projet Rust minimal avec `rusqlite 0.43` (`bundled`), exécuté dans le conteneur :

```
SQLite (bundled) version: 3.54.1
ENABLE_FTS5 compiled in: true
match   electronique -> 1 row(s)      ← trouve « Électronique »
match       securite -> 1 row(s)      ← trouve « Sécurité »
match         génère -> 1 row(s)
match       monosta* -> 1 row(s)      ← requête par préfixe
match          NE555 -> 1 row(s)
snippet: Le circuit monostable du NE555 génère une [impulsion]…
trigram substring 'rrupt' -> 1 row(s) ← correspondance partielle (tokenizer trigram)
```

Conclusion : FTS5 est disponible dans le SQLite embarqué. Le tokenizer `unicode61 remove_diacritics 2`
rend la recherche insensible aux accents, et `snippet()` fournit les extraits surlignés. Le tokenizer
`trigram` permet la recherche de sous-chaînes. Les hypothèses de la Phase 6 sont validées.

### 7.2 Compilation Tauri 2 : **réussi**

Binaire minimal dépendant de `tauri 2.12` (build release) :

- Compilation complète en **1 min 57 s** sur 4 vCPU (dossier `target` : 1,1 Go).
- Édition de liens vérifiée avec `ldd` : `libwebkit2gtk-4.1.so.0`, `libgtk-3.so.0`, `libsoup-3.0.so.0`.

Conclusion : le conteneur peut compiler et lier Tauri 2 sous Linux.

## 8. Problèmes de compatibilité et contraintes

| # | Problème | Impact | Mesure retenue |
|---|---|---|---|
| C1 | Cible **Windows**, conteneur **Linux** | Le conteneur ne peut pas produire les installateurs `.msi` ou `.exe` | Les installateurs Windows sont construits par **GitHub Actions** sur `windows-latest`. Le conteneur sert au développement et aux tests. |
| C2 | Compilation croisée Windows impossible (§5) | Confirme C1 | Pas de `cargo-xwin` |
| C3 | Moteur web différent : WebKitGTK sous Linux, **WebView2 (Chromium)** sous Windows | Rendu, polices et API web peuvent différer | QA visuelle avec **Playwright + Chromium** (même moteur que WebView2) sur le frontend servi par Vite, avec IPC Tauri simulé. WebKitGTK sert aux tests de fumée natifs. |
| C4 | Pas d'affichage graphique | L'application native ne peut pas s'ouvrir directement | `xvfb-run` pour lancer l'application et les tests E2E (`tauri-driver` + `WebKitWebDriver`) |
| C5 | TypeScript 7 incompatible avec `typescript-eslint` | Lint typé impossible avec TS 7 | **TypeScript 6.0.x** épinglé ; passage à TS 7 réévalué quand l'écosystème le supportera |
| C6 | Pas de Secret Service (trousseau D-Bus) dans le conteneur | `keyring` inutilisable en test Linux | Abstraction `SecretStore` avec implémentation simulée pour les tests ; Windows Credential Manager validé sur CI Windows et sur poste réel |
| C7 | `gh` inutilisable, création de dépôt refusée | Le dépôt distant ne peut pas être créé depuis la session | Le porteur crée le dépôt vide `archive` sur GitHub, qui est ensuite rattaché à la session et poussé |
| C8 | Conteneur éphémère | Les dépendances système et les caches sont perdus | Script de configuration de l'environnement cloud ; commits et push fréquents |
| C9 | Playwright préinstallé en 1.63.0, `@playwright/test` en 1.65.1 | Navigateur attendu différent | Utiliser `executablePath: '/opt/pw-browsers/chromium'` quand il existe (sinon navigateur géré par Playwright, par exemple sur la CI). **Ne jamais lancer `playwright install` dans le conteneur.** |
| C10 | Quota GitHub Actions des dépôts privés, minutes Windows décomptées plus vite | Coût et quota | CI Linux à chaque push. Build Windows **à la demande** (`workflow_dispatch`) et sur tags de version. |
| C11 | Comportements propres à Windows invérifiables dans le conteneur : verrous de fichiers, noms réservés (`CON`, `NUL`…), longueur des chemins, insensibilité à la casse, Explorateur, Credential Manager | Risques de bugs propres à Windows | Code défensif (assainissement des noms à l'export, chemins internes courts), tests sur la CI Windows, recette finale sur un poste Windows 11 réel |
| C12 | Machine cible : Intel Core, 16 Go, Iris Xe, sans GPU dédié | Contraintes de performance (spec §4.2) | Rendu 2D Canvas (pas de WebGL), virtualisation des listes, traitements en arrière-plan. Les mesures faites dans le conteneur ne sont qu'indicatives. |

### Vérification rapide en début de session

```bash
node --version && cargo --version && pkg-config --modversion webkit2gtk-4.1
```

Si `webkit2gtk-4.1` est introuvable, réinstaller les paquets du §4.
