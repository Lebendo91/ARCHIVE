# ARCHIVE — Suivi de développement

> Document de continuité (spec §22). **Toute session commence par sa lecture**, puis par celle
> d'[ARCHITECTURE.md](ARCHITECTURE.md). Mettre à jour en continu et en fin de phase.

## Phase courante

**Phase 10 — Sauvegarde, sécurité, optimisation et packaging : en cours** (branche `phase/10-finalisation`, créée
depuis `main` à `350bf83`). La Phase 9 a été fusionnée dans `main` par la pull request Lebendo91/ARCHIVE#6 le
2026-11-23 (commit `350bf83` ; CI de la pull request au vert : run 45254927340 ; CI de `main` lancée : runs
45256167211 et 45256167237, à consigner une fois terminés). Le porteur du projet a demandé l'enchaînement autonome
des phases ; une reprise automatique est programmée après chaque réinitialisation de sa limite d'utilisation.

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Audit de l'environnement | ✅ Terminée |
| 1 | Fondation et design system | ✅ Terminée et validée |
| 2 | Base de données et stockage local | ✅ Terminée |
| 3 | Vue d'ensemble et espaces de travail | ✅ Terminée |
| 4 | Bibliothèque | ✅ Terminée |
| 5 | Notes | ✅ Terminée |
| 6 | Recherche intelligente | ✅ Terminée |
| 7 | Moteur de mémoire | ✅ Terminée |
| 8 | Graphe de connaissances et chronologie | ✅ Terminée |
| 9 | Assistant IA | ✅ Terminée |
| 10 | Sauvegarde, sécurité, optimisation et packaging | ▶ En cours |

---

## Actions en attente du porteur du projet

1. **Choisir l'identifiant d'application** avant toute diffusion. Il est provisoirement fixé à
   `io.github.lebendo91.archive` ; il détermine le dossier de données et ne pourra plus changer ensuite
   (ARCHITECTURE §16).
2. **Signature de marque** : garder « Everything you know. Nothing forgotten. » en anglais (choix actuel,
   affiché dans « À propos »), ou la traduire.

---

## Phase 9 — Assistant IA (terminée le 2026-11-23)

### Tâches réalisées

- [x] **9.1** Décisions et dépendances (ARCHITECTURE §11) : trait `AiProvider` « sans entrées-sorties », réseau
      dans un seul module (`reqwest`, rustls avec `ring`, vérificateur du système), clés dans le Gestionnaire
      d'identifiants de Windows (`keyring-core`), flux par `Channel`, journal sans clé ni contenu, build
      `test-endpoints` pour la validation native.
- [x] **9.2** Configuration et secrets : Réglages › Intelligence artificielle ; ajout, défaut, suppression ; clé
      saisie dans un champ masqué, rangée par le cœur, jamais relue par l'interface ; mémoire de session expliquée
      quand le coffre manque ; test de connexion sur demande ; modèle choisi dans la liste du compte ou saisi ;
      longueur maximale des réponses ; repli d'Anthropic ; préférences de confidentialité.
- [x] **9.3** Fournisseurs : Anthropic (Messages API 2026-10-21, refus, repli), OpenAI (Responses API,
      `store: false`), Gemini (`streamGenerateContent`, clé en en-tête) ; erreurs en catégories stables ; usage.
- [x] **9.4** Contexte : portée choisie (documents, notes, espace, rien) ; passages FTS5 classés sur leur texte puis
      les titres ; fenêtres et budgets ; aperçu exact avant l'envoi.
- [x] **9.5** Conversations (schéma v4) : historique, nouvelle, effacer, supprimer, arrêter, régénérer, copier,
      réponses interrompues à la fermeture marquées comme telles.
- [x] **9.6** Citations vérifiées : liens seulement vers les passages envoyés (PDF ouvert à la page citée),
      citations inventées signalées, paragraphes étiquetés ARCHIVE / connaissances générales / interprétation /
      non sourcé.
- [x] **9.7** Concepts par IA sur demande, vérifiés dans le texte ; nœuds « concept » dans le graphe.
- [x] **9.8** Validation (ci-dessous), documentation, captures `docs/screenshots/phase-9/`.

### Validation (critères de la spec §21, Phase 9)

| Critère | Résultat | Preuve |
|---|---|---|
| Abstraction des fournisseurs | ✅ | Trait `AiProvider` ; tests Rust par fournisseur sur réponses enregistrées et de bout en bout contre un serveur HTTP local (flux coupé à 7 octets, erreurs, réseau coupé, annulation) |
| Configuration de l'API | ✅ | Tests Rust (`config`), unitaires et de bout en bout (ajout, modèle de la liste, préférences, suppression) |
| Stockage sécurisé des clés | ✅ | **Gestionnaire d'identifiants réel** testé sur `windows-latest` (run 45245455899 : `the_windows_credential_manager_keeps_and_forgets_a_key ... ok`) ; repli de session testé ; **natif** : clé absente de la base et du journal |
| Test de connexion | ✅ | Seulement sur action ; **natif** : liste des modèles du serveur local, clé dans l'en-tête `x-api-key` |
| Conversations | ✅ | Tests Rust (enregistrement, reprise, historique sans anciennes citations, interruption) ; unitaires et de bout en bout |
| Sélection du contexte | ✅ | Tests Rust (portée, corbeille, budgets, syntaxe FTS5 neutralisée) ; **natif** : seul le passage de la fiche partagée part, numéroté S1 |
| Récupération des documents | ✅ | Classement sur le texte des passages (défaut corrigé), début des éléments choisis, fenêtres autour des mots |
| Citations | ✅ | Unitaires (vérification, étiquettes), de bout en bout (lien vers la page 2 du PDF, citation inventée signalée) ; **natif** : citation S1 vérifiée dans le vrai binaire |
| Gestion des erreurs | ✅ | Clé refusée, quota, débit (avec délai), surcharge, modèle inconnu, réseau, délai, réponse illisible, flux interrompu, refus, filtres : tests Rust et unitaires |
| Réponses en flux | ✅ | Canal Tauri ; **natif** : réponse affichée au fil de l'eau dans la WebView puis enregistrée complète avec son usage |

### Tests exécutés

| Suite | Résultat |
|---|---|
| Rust (`cargo test`) | 336 réussis, 3 ignorés (mesures de performance) ; `cargo clippy -D warnings` et `cargo fmt --check` propres |
| Unitaires (Vitest) | 188 réussis (26 fichiers) |
| De bout en bout (Playwright, axe) | 83 réussis, dont 3 nouveaux avec audits d'accessibilité |
| Audit visuel | Scénario « assistant et réglages IA » aux 3 tailles (5 captures chacune), relu |
| Validation native (`scripts/validate-native-phase9.py`) | **19/19** contrôles réussis (binaire `test-endpoints` sous Xvfb, faux fournisseur local, aucune clé réelle) |
| CI Windows | Installateurs construits, démarrage vérifié, coffre réel testé (run 45245455899) |

### Défauts corrigés en cours de phase

- Le titre étant répété sur chaque passage de l'index, des passages sans rapport partaient pour leur seul titre :
  classement séparé sur le texte, puis sur les titres (trouvé par un test Rust).
- 86 espaces insécables brutes dans `fr.ts` (17 lignes venues de la Phase 8) : remplacées par `\u00a0`, et règle
  ESLint `no-irregular-whitespace` étendue aux chaînes pour l'empêcher à l'avenir.
- Le double du cœur renvoyait ses propres objets, modifiés ensuite sur place : le cache de requêtes ne voyait pas
  les changements ; il renvoie désormais des copies, comme le vrai cœur (JSON).
- Nom accessible des conversations sans leur texte visible (axe) ; zone de saisie qui glissait sous la fenêtre et
  boutons désalignés des champs (audit visuel) : corrigés.

### Dépendances ajoutées

- Rust : `reqwest` 0.13.5 (déjà présent via Tauri ; TLS rustls sans fournisseur par défaut), `rustls` 0.23 avec
  `ring`, `tokio` (macros, sync, time), `keyring-core` =1.0.1, `windows-native-keyring-store` 1.1 (Windows
  seulement), `zeroize` 1.8.
- Frontend : `marked` 17.0.6 (exacte, déjà installée via `@tiptap/markdown`).

### Éléments reportés (volontairement, sans simulation)

- Recherche sémantique par embeddings (prévue « s'ils sont activés ») : la récupération reste FTS5.
- Outils de la spec §14.7 (résumés, fiches, quiz…) : à n'ajouter qu'une fois l'assistant de base éprouvé.
- Coûts en euros : les tarifs changent ; seuls les jetons comptés par le fournisseur sont affichés.

### Limites restantes

- Les documentations d'OpenAI et de Google n'étaient pas joignables depuis l'environnement (réseau restreint) :
  leurs formats suivent leurs API publiques connues, testés sur des réponses enregistrées. À vérifier avec une
  vraie clé ; autoriser `platform.openai.com` et `ai.google.dev` dans le réseau de l'environnement permettrait de
  les confronter à la documentation actuelle.
- Hors Windows, pas de coffre : clés pour la session seulement (ARCHIVE vise Windows).
- Extraction de concepts limitée aux 24 000 premiers caractères ; historique limité à 12 messages.

---

## Phase 8 — Graphe de connaissances et chronologie (terminée le 2026-11-23)

### Tâches réalisées

- [x] **8.1** Décisions et dépendances (ARCHITECTURE §2, §10 et §16) : SVG dessiné par React et disposition par
      `d3-force` 3.0.1 (version exacte, examinée avant adoption) au lieu de Cytoscape.js ; plafonds de nœuds et
      chargement progressif ; vue en liste comme alternative accessible.
- [x] **8.2** Cœur du graphe (`graph_load`) : documents, notes, espaces et étiquettes ; liens des notes, relations
      décidées, suggestions sur demande (jamais les rejetées), appartenances et étiquettes ; filtres appliqués avant
      envoi ; les plus reliés d'abord ou le voisinage d'un élément ; éléments dépliés jusqu'à 500 nœuds ; tests Rust.
- [x] **8.3** Interface du graphe : carte SVG (zoom, déplacement, nœuds déplaçables, sélection d'un nœud ou d'un
      lien, légende), détails chargés à la demande, ouverture de l'élément, décision sur une suggestion, recherche
      parmi les éléments affichés, filtres, « Partir d'un élément », « Afficher les voisins », navigation au clavier,
      vue en liste, états vides qui expliquent comment naissent les relations ; « Voir dans le graphe » depuis la
      carte Relations ; disposition dans un Web Worker.
- [x] **8.4** Chronologie : `timeline_list` filtré par types d'événement, types de ressource, espace et période,
      paginé par curseur `(date, identifiant)`, avec la ressource où mène chaque événement et son titre actuel ;
      `timeline_clear` ; un test Rust vérifie, par les vrais services et le vrai pipeline d'import, que les huit
      événements de la spec §13.1 sont enregistrés.
- [x] **8.5** Interface de la chronologie : regroupement par jour, type, format importé, origine d'une relation,
      espace, heure ; filtres (dont des dates choisies, vérifiées) ; événements plus anciens à la demande ;
      effacement après confirmation.
- [x] **8.6** Validation (ci-dessous), mesures, documentation, captures `docs/screenshots/phase-8/`.

### Validation (critères de la spec §21, Phase 8)

| Critère | Résultat | Preuve |
|---|---|---|
| Graphe en deux dimensions | ✅ | SVG sans WebGL ; tests de bout en bout dans Chromium (moteur de WebView2) ; **natif** (WebKitGTK sous Xvfb) : la carte dessine les suggestions puis la relation acceptée, disposée par son worker sous la CSP de production |
| Nœuds | ✅ | Tests Rust (types, degré, archivés, couleur et icône des espaces, élément de départ montré même seul, corbeille exclue) ; formes distinctes par type ; nom accessible complet |
| Arêtes | ✅ | Tests Rust : liens des notes, relations décidées, suggestions sur demande, jamais les rejetées, appartenances, étiquettes, plafond de 4 000 arêtes ; flèches pour les relations orientées, arcs pour les liens parallèles |
| Filtres | ✅ | Tests Rust (types, espace, suggestions) ; unitaires et de bout en bout : types d'élément et de relation, suggestions, espace, réinitialisation ; le dernier type d'élément ne peut être décoché |
| Sélection | ✅ | De bout en bout : clic sur un nœud ou un lien (test de distance), clavier (flèches, Entrée, Échap), glisser sans perdre la sélection, voisinage mis en évidence |
| Navigation | ✅ | Ouverture depuis les détails et par double clic ; « Partir d'un élément » et « Afficher les voisins » (tests Rust des plafonds, de bout en bout) ; « Voir dans le graphe » depuis la carte Relations |
| Détails des relations | ✅ | Panneau d'un lien : phrase, origine, justification et confiance d'une suggestion, décision. **Natif** : suggestion acceptée depuis le graphe, au clavier seulement, enregistrée et inscrite dans la chronologie |
| Suivi des événements | ✅ | Test Rust de bout en bout sur les huit événements ; **natif** : les 8 imports et la note créée sont inscrits par le cœur réel |
| Filtres de la chronologie | ✅ | Tests Rust (espace, types, ressource, période, pagination sans doublon ni saut) ; unitaires et de bout en bout (dont période impossible signalée) ; **natif** : effacement seulement après confirmation, ressources intactes |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` | ✅ 262/262 (+ 3 mesures de performance ignorées par défaut) |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 174/174 (24 fichiers, dont 11 tests du graphe et de la chronologie, 7 de la disposition, du zoom et de l'adresse, 3 des périodes) |
| `npm run test:e2e` (dont axe-core sur la carte avec sélection et recherche, les filtres, la légende, la liste, le dialogue de départ, le graphe sans relation, la chronologie filtrée et le dialogue d'effacement) | ✅ 80/80 |
| `npm run test:visual` (42 scénarios, 3 résolutions) | ✅ captures revues |
| `scripts/validate-native-phase8.py` : binaire de production, vraie base SQLite, imports réels, note tapée, deux lancements sous Xvfb | ✅ 16/16 vérifications |
| `cargo test --release --lib perf::graph_on_a_generated_corpus -- --ignored --nocapture` et `npm run test:perf` (mesures indicatives) | ✅ chiffres dans ARCHITECTURE §10 |
| CI GitHub (Linux et Windows) | ✅ pull request Lebendo91/ARCHIVE#5 : CI 45185064651 (Windows 45183053852 sur `602d24b`) ; `main` après fusion (`b5b73c1`) : CI 45187531267 et Windows 45187531587 |

### Défauts corrigés en cours de phase

- **Accessibilité** (axe) : l'étiquette raccourcie d'un nœud (« … ») était dans son bouton, dont le nom accessible
  porte le titre complet (WCAG 2.5.3) ; les étiquettes sont désormais dans un calque à part.
- **Ergonomie** (tests de bout en bout) : l'ouverture du panneau de détails au premier clic d'un double clic
  décalait la carte, et le second clic manquait l'élément ; la carte se rétrécit désormais par la droite.
- **Performance** (mesure dans Chromium) : la disposition de 300 nœuds prenait 0,9 s sur le fil de l'interface ;
  elle part désormais de positions lisibles, s'arrête plus tôt et tourne dans un Web Worker (0,34 s, hors
  interface).
- **Lisibilité** (audit visuel) : groupes déconnectés entremêlés, étiquettes voisines superposées, nouveau voisin
  éloigné de son élément après une expansion, filtres de la chronologie désalignés à 1100 px quand une période est
  impossible.
- **Chronologie** (validation native) : une note créée par Ctrl+N puis nommée apparaissait « Sans titre » ;
  l'interface montre désormais le titre actuel d'une ressource qui existe encore.

### Dépendances ajoutées

| Paquet | Version | Rôle |
|---|---|---|
| `d3-force` (avec `d3-dispatch`, `d3-quadtree`, `d3-timer` 3.0.2) | 3.0.1 (exacte) | Disposition par forces du graphe |
| `@types/d3-force` (développement) | 3.0.10 (exacte) | Types |

Les versions de novembre 2026 ont été examinées avant adoption : publiées par l'intégration continue du projet d3
avec attestation de provenance, sans script d'installation, et identiques à celles de 2021 au code près (une
optimisation de `quadtree.addAll`, un arrondi de `d3-timer`). `npm audit signatures` n'a pas pu joindre le dépôt de
confiance Sigstore depuis le conteneur.

### Éléments reportés (volontairement, sans simulation)

- **Nœuds de concepts et « concepts partagés »** (spec §11.1) : les tables existent depuis la Phase 7, mais aucun
  concept n'est extrait sans fournisseur d'IA → Phase 9.
- **Filtre « favoris » et statut de traitement dans le graphe** : non demandés par la spec ; à évaluer selon l'usage.

### Limites restantes

- Le graphe montre au plus 500 nœuds à la fois ; au-delà, l'utilisateur filtre ou part d'un élément.
- Les titres de plus de 26 caractères sont raccourcis sur la carte (complets dans les détails, la liste et le nom
  accessible) ; la largeur des étiquettes est estimée pour les écarter.
- Au clavier, les flèches mènent au nœud le plus proche dans une direction : dans une zone dense, la cible peut
  surprendre ; la vue en liste reste l'alternative.
- Les événements « relation acceptée » ne sont rattachés à aucun espace : le filtre par espace ne les montre pas.
- Les champs de date suivent le format du système (celui de WebView2 sous Windows).

---

## Phase 7 — Moteur de mémoire (terminée le 2026-11-23)

### Tâches réalisées

- [x] **7.1** Schéma et décisions (ARCHITECTURE §8 et §16) : migration 3 avec la file `processing_jobs`, les
      profils de contenu, les termes caractéristiques, le vocabulaire de l'index, les concepts et leurs mentions,
      la version du moteur.
- [x] **7.2** File persistante et worker d'arrière-plan : mise en file dans la transaction qui modifie
      l'élément (notes après une pause de la frappe), génération de chaque travail, nouveaux essais espacés puis
      « À vérifier », reprise après un arrêt, nouveau traitement complet quand les règles changent, événements
      `memory:changed` ; statut de chaque étape (import, extraction, normalisation, indexation, analyse,
      relations) et relance.
- [x] **7.3** Normalisation et analyse sans IA : titre, auteur, dates et langue déclarés (propriétés Word,
      informations PDF lues par pdf.js), pages, mots et caractères, langue reconnue seulement quand le texte le
      dit clairement ; termes caractéristiques pondérés par leur rareté dans l'index.
- [x] **7.4** Relations suggérées par des règles : termes partagés, étiquettes communes, même espace ; provenance
      et confiance ; jamais acceptées d'office, jamais reproposées après un rejet.
- [x] **7.5** Contrôle par l'utilisateur : cartes « Relations » et « Analyse » sur chaque document et chaque note
      (accepter, rejeter, rétablir, ajouter, changer le type, retirer ; relance d'une étape en échec) ; vue
      d'ensemble des traitements dans Paramètres › Stockage.
- [x] **7.6** Extraction de concepts derrière une interface indépendante du fournisseur, indisponible et expliquée
      tant qu'aucun fournisseur d'IA n'est configuré ; stockage séparé avec la source de chaque mention.
- [x] **7.7** Validation (ci-dessous), documentation, captures `docs/screenshots/phase-7/`.

### Validation (critères de la spec §21, Phase 7)

| Critère | Résultat | Preuve |
|---|---|---|
| File de traitement | ✅ | Tests Rust : étapes enchaînées, note traitée après la pause de la frappe, nouvelle demande pendant un traitement, échecs retentés puis « À vérifier », relance, reprise après un arrêt, nouveau traitement quand la version change, purge. **Natif** : sans aucune action, le worker de l'application termine les 27 travaux des 9 éléments importés ou écrits ; un travail interrompu reprend au lancement suivant ; après un changement de règles, les 9 éléments sont traités à nouveau |
| Analyse des documents | ✅ | Tests Rust : termes fréquents dans l'élément et rares ailleurs, mots courants écartés. **Natif** : termes de la note issus de son texte ; carte « Analyse » du PDF avec ses six étapes terminées |
| Normalisation des métadonnées | ✅ | Tests Rust : dates ISO 8601, langue déclarée prioritaire, rien d'inventé. **Natif** : titre et auteur du document Word ; titre, auteur, dates et langue d'un PDF lus par pdf.js ; rien pour un PDF qui ne déclare rien |
| Interface d'extraction de concepts | ✅ | Tests Rust avec un extracteur de test : stockage séparé, source et provenance gardées, contenu intact, concepts orphelins retirés ; sans fournisseur : indisponible, et l'interface l'explique |
| Stockage des relations, suggestions, validation | ✅ | Tests Rust (moteur et service) ; unitaires et de bout en bout : accepter, rejeter, rétablir, ajouter, changer le type, retirer, relation vue de l'autre côté. **Natif** : suggestion entre la note et le PDF sur le NE555, jamais acceptée d'office ; rejet maintenu après un nouveau traitement complet |
| Traçabilité de la provenance | ✅ | Termes partagés, étiquettes, espace commun et confiance enregistrés et affichés ; origine de chaque relation (vous, règle, IA) ; acceptation inscrite dans la chronologie |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` | ✅ 247/247 (+ 2 mesures de performance ignorées par défaut) |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 155/155 (21 fichiers, dont 8 tests des relations, de l'analyse et de la vue d'ensemble) |
| `npm run test:e2e` (dont axe-core sur les cartes « Relations » et « Analyse » d'une note et d'un document, les deux dialogues et la vue d'ensemble) | ✅ 72/72 ; les 5 tests de la phase répétés deux fois sans échec |
| `npm run test:visual` (36 scénarios, 3 résolutions) | ✅ captures revues |
| `scripts/validate-native-phase7.py` : binaire de production, vraie base SQLite, imports réels, note tapée, trois lancements sous Xvfb | ✅ 17/17 vérifications |
| `cargo test --release --lib perf:: -- --ignored --nocapture` (mesures indicatives) | ✅ chiffres dans ARCHITECTURE §8 et §9 |
| CI GitHub (Linux et Windows) | ✅ frontend, bout en bout et accessibilité, cœur natif (run 45125392326 et, sur la pull request, 45125397626, commit `122dea8`) ; build Windows MSI et NSIS avec test de démarrage (run 45124157664, commit `31a0d39`, dernière modification native) ; `main` après fusion (`48dd2ed`, pull request Lebendo91/ARCHIVE#4) : runs 45125704392 et 45125704226 |

### Défauts corrigés en cours de phase

- **Performance** : l'étape « relations » lisait le texte complet de chaque élément candidat, et un mot présent
  partout faisait de chaque élément un candidat ; la comparaison détaillée est désormais limitée aux 200 éléments
  les plus proches, vérifiés sans lire leur texte (mesure : 22 ms par élément).
- **Accessibilité** (trouvés par les tests de bout en bout, invisibles sous jsdom) : après une décision, le focus
  était posé avant que la liste ne soit redessinée ; le dialogue de type était démonté au lieu d'être fermé, et
  le focus ne revenait pas au menu.
- **Textes** : la page d'un document promettait encore « les relations proposées automatiquement arriveront avec le
  moteur de mémoire » ; le problème d'extraction d'un document était répété dans deux cartes.
- **Méthode de validation** : ma chaîne de vérification filtrait la sortie de `npm run lint` par `tail -1`, qui
  masquait le code de sortie d'ESLint (sa dernière ligne est vide) ; deux erreurs de lint d'un test ont donc
  atteint la CI, rouge sur les commits `aef46ce` et `31a0d39` alors que je les croyais validés. Elles sont
  corrigées, et chaque commande de validation est désormais vérifiée par son code de sortie (`set -o pipefail`) ;
  la consigne est ajoutée à CLAUDE.md.

### Dépendances ajoutées

Aucune : la table `fts5vocab` est fournie par le SQLite embarqué ; pdf.js lisait déjà les informations des PDF.

### Éléments reportés (volontairement, sans simulation)

- **Extraction de concepts par IA** : l'interface et le stockage sont prêts ; il faut un fournisseur configuré
  avec sa clé, ce qui relève de la Phase 9.
- **Relations entre étiquettes, espaces et concepts** dans le graphe → Phase 8 (affichage), Phase 9 (concepts).
- **Statut de chaque étape dans la liste de la Bibliothèque** : il est visible sur chaque élément et dans la vue
  d'ensemble ; un filtre par statut pourra venir en Phase 10.

### Limites restantes

- Les suggestions reposent sur des mots partagés, sans racinisation ni synonymes : « interruption » et
  « interruptions » sont deux termes, « relais » et « contacteur » ne se rapprochent pas.
- La langue n'est reconnue qu'en français et en anglais, et seulement pour un texte assez long ; les autres restent
  « Non déterminée » sauf si le fichier les déclare.
- Les seuils des règles (deux termes, similarité de 0,12, 200 candidats) sont fixés ; ils pourront devenir
  réglables si l'usage le demande.
- Le traitement initial d'une grande bibliothèque prend du temps en arrière-plan (environ 45 éléments par seconde
  dans le conteneur cloud) ; l'application reste utilisable pendant ce temps.

---

## Phase 6 — Recherche intelligente (terminée le 2026-11-22)

### Tâches réalisées

- [x] **6.1** Schéma et décisions (ARCHITECTURE §9) : migration 2 avec l'index FTS5 par passage
      (`unicode61 remove_diacritics 2`), les trigrammes des titres, la correspondance élément → lignes, la
      version de l'index et l'historique des recherches.
- [x] **6.2** Indexation dans la transaction qui écrit les données : documents (import, texte extrait par
      pdf.js page par page, renommage, métadonnées, étiquettes, déplacement, corbeille, restauration, purge),
      notes, espaces de travail, étiquettes ; reconstruction au démarrage quand la version de l'index change.
- [x] **6.3** Requêtes sûres : mots entre guillemets, préfixe sur le dernier mot, expressions, exclusions, mots
      vides, ligatures ; filtres (types, espace, étiquette, date et période, favoris), comptes par type,
      pagination ; classement `bm25()` pondéré avec un bonus pour les favoris et les éléments récents ;
      extraits et titres surlignés convertis en segments, numéro de page du passage.
- [x] **6.4** Recherche globale `Ctrl+K` : palette depuis la barre supérieure, résultats groupés par type,
      navigation au clavier, ouverture de la bonne ressource, recherches récentes, états vides honnêtes.
- [x] **6.5** Page `/search` : chaque résultat avec son titre, son type (et son format), son espace et son
      dossier, sa page, sa date, son extrait, les termes trouvés et les étiquettes correspondantes ; types avec
      leurs comptes, filtres en puces conservés dans l'adresse, tri, « Afficher plus » ; historique effaçable.
      Les résultats en cache sont rafraîchis après toute modification des données.
- [x] **6.6** Dates et types reconnus par des règles explicites, affichés comme filtres (« Compris : … »), avec
      « Chercher le texte tel quel » ; l'absence de recherche sémantique est expliquée.
- [x] **6.7** Validation (ci-dessous), documentation, captures `docs/screenshots/phase-6/`.

### Validation (critères de la spec §21, Phase 6)

| Critère | Résultat | Preuve |
|---|---|---|
| SQLite FTS5 et chaîne d'indexation | ✅ | Tests Rust : ce qui est écrit est trouvé, chaque modification atteint l'index dans la même transaction, une opération annulée ne laisse rien dans l'index, reconstruction quand la version change. **Natif** : après un vrai import, l'index contient chaque document et la note, le texte du PDF page par page ; vidé et marqué périmé, il est reconstruit au lancement suivant (« search index built: 8 entries » dans le journal) |
| Interface de recherche, `Ctrl+K` | ✅ | **Natif** : `Ctrl+K` puis Entrée ouvre le PDF trouvé par le texte de sa page 2, le document Word trouvé sans accents, la note, puis la note par des mots ajoutés à l'instant (ouvertures relues en base). De bout en bout : groupes, flèches, Entrée, `Ctrl+Entrée` |
| Filtres | ✅ | Unitaires et de bout en bout : type, espace, étiquette, période, favoris, puces, réinitialisation, conservation dans l'adresse après un rechargement |
| Classement | ✅ | Tests Rust : le titre passe avant le texte, un favori avant un élément comparable, les mots entiers avant les parties de titre ; tri par date |
| Extraits et surlignage | ✅ | Tests Rust (segments, pages) ; de bout en bout : mots surlignés dans la palette et sur la page, numéro de page |
| Historique de recherche | ✅ | Unitaires et de bout en bout : enregistrement à l'ouverture d'un résultat ou à la validation, suppression d'une entrée (le focus passe à la suivante), effacement complet. **Natif** : historique relu en base, conservé après un redémarrage |
| Sécurité de la saisie | ✅ | Tests Rust : guillemets, `NEAR`, `*`, `^`, deux-points, parenthèses et colonnes tapés par l'utilisateur ne sont jamais interprétés comme syntaxe FTS5 |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` | ✅ 213/213 (+ 1 mesure de performance ignorée par défaut) |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 147/147 (20 fichiers, dont 11 tests de la page de recherche, de l'historique et de la palette, et 4 de l'interprétation des dates et des types) |
| `npm run test:e2e` (dont axe-core sur la palette et la page de recherche : historique, résultats, filtres, aucun résultat ; `/search` rejoint les écrans contrôlés un par un) | ✅ 67/67 ; les 9 tests de la phase répétés 3 fois sans échec |
| `npm run test:visual` (33 scénarios, 3 résolutions) | ✅ captures revues |
| `scripts/validate-native-phase6.py` : binaire de production, vraie base SQLite, sélecteur GTK, trois lancements sous Xvfb | ✅ 22/22 vérifications |
| `cargo test --release --lib perf::search -- --ignored --nocapture` (mesure indicative) | ✅ chiffres dans ARCHITECTURE §9 |
| CI GitHub (Linux et Windows) | ✅ frontend, bout en bout et accessibilité, cœur natif (runs 45059433938 et, sur la pull request, 45059438139, commit `084e84f`) ; build Windows MSI et NSIS avec test de démarrage (run 45059035040, commit `1f2a446`, dernière modification native) ; `main` après fusion : runs 45059954952 et 45059954866 |

### Défauts corrigés en cours de phase

- **Cœur** :
  - `bm25()` refusé par SQLite dans une sous-requête (« unable to use function bm25 in the requested
    context ») : les correspondances passent par une expression de table matérialisée ;
  - une exclusion seule (« -mot ») produisait une expression FTS5 invalide ;
  - deux recherches enregistrées dans la même milliseconde pouvaient s'inverser dans l'historique.
- **Interface** :
  - une note sans titre apparaissait sans nom dans les résultats ; elle est désormais « Sans titre » ;
  - sur la page de recherche, le champ pouvait reprendre une ancienne saisie quand l'adresse se mettait à jour
    en retard sur la frappe (trouvé par les tests de bout en bout) ;
  - le scénario d'audit visuel attendait encore l'info-bulle « recherche indisponible » de la Phase 1.

### Dépendances ajoutées

Aucune : FTS5 et le tokenizer `trigram` sont fournis par le SQLite embarqué de `rusqlite` (version 3.53).

### Éléments reportés (volontairement, sans simulation)

- **Recherche sémantique** (optionnelle, spec §9.4) : elle dépend d'un fournisseur d'IA configuré (Phase 9) ;
  l'interface dit qu'elle n'est pas activée.
- **Ouverture d'un PDF à la page trouvée** : le résultat indique la page, mais l'aperçu s'ouvre au début du
  document → Phase 10 (amélioration de l'aperçu).
- **File de traitement persistante** (`processing_jobs`) → Phase 7, avec l'analyse ; l'indexation n'en a pas
  besoin.

### Limites restantes

- Les mots d'une recherche doivent figurer dans un même passage (une page de PDF, ou environ 2 000 octets), ou
  dans le titre, les étiquettes et les métadonnées, répétés sur chaque passage.
- Pas de racinisation : « interruption » ne trouve pas « interruptions », sauf pour le dernier mot tapé, qui
  est un préfixe.
- Le texte est stocké deux fois (contenu du document et index) : la base pèse environ 3,7 fois le texte indexé
  (151 Mo pour 41 Mo). Une table FTS5 à contenu externe pourra être étudiée en Phase 10.
- Un mot présent dans presque tous les éléments prend environ 100 ms sur 5 000 éléments (mesure dans le
  conteneur cloud) ; la palette attend 150 ms après la dernière touche.
- Les expressions de date reconnues forment une liste fixe, en français et en anglais ; les autres sont
  cherchées comme du texte.
- Le double de test de l'interface classe plus simplement que le cœur : le classement est vérifié par les tests
  Rust et la validation native.

---

## Phase 5 — Notes (terminée le 2026-11-22)

### Tâches réalisées

- [x] **5.1** Dépendances et décisions (ARCHITECTURE §16) :
  - TipTap 3.33.1 en versions exactes ;
  - contenu en JSON TipTap accompagné de son texte brut ;
  - Markdown converti dans l'interface avec le schéma de l'éditeur ;
  - liens internes `archive://note/<id>` et `archive://document/<id>`.
- [x] **5.2** Cœur natif :
  - commandes des notes : liste filtrée et triée, lecture avec liens et rétroliens, création, enregistrement
    par révision (refus `stale_revision`), renommage, duplication (étiquettes et liens, jamais l'état),
    déplacement, favori, archivage, étiquettes, corbeille, restauration, suppression définitive, ouverture ;
  - relations `links_to` ;
  - événements `note_created` et `note_modified`, ce dernier au plus une fois par heure ;
  - ouverture vérifiée des adresses web et électroniques (`app_open_url`).
- [x] **5.3** Éditeur :
  - barre d'outils et tous les formats de la spec §8.1, raccourcis clavier et raccourcis Markdown ;
  - enregistrement automatique (800 ms après la dernière modification, 5 s au plus) avec état visible ;
  - conflit de révision (recharger ou garder sa version), échec signalé avec nouvel essai ;
  - brouillon de récupération ; fermeture de la fenêtre qui attend l'enregistrement.
- [x] **5.4** Liens internes : sélecteur avec recherche, ouverture au clic, liens et rétroliens de chaque note,
      notes qui citent un document sur la page de celui-ci.
- [x] **5.5** Liste et intégration :
  - liste des notes : recherche dans le titre et le texte, filtres en puces conservés dans l'adresse, tris,
    dossiers, archives, corbeille, menu d'actions et menu contextuel ;
  - « Nouvelle note » : `Ctrl+N`, menu « Créer », vue d'ensemble, espaces de travail ;
  - Favoris, Récemment ouverts et Archives affichent aussi les notes.
- [x] **5.6** Markdown :
  - import par le sélecteur natif (fichiers lus et vérifiés par le cœur) ;
  - export par le dialogue d'enregistrement natif ;
  - aperçu mis en page des documents Markdown de la Bibliothèque.
- [x] **5.7** Gestionnaire d'étiquettes commun aux documents et aux notes (renommage partout, suppression
      annonçant son effet) ; déplacement des dossiers avec leur contenu.
- [x] **5.8** Validation (ci-dessous), documentation, captures `docs/screenshots/phase-5/`.

### Validation (critères de la spec §21, Phase 5)

| Critère | Résultat | Preuve |
|---|---|---|
| Éditeur TipTap, mise en forme riche | ✅ | **Natif** : titre, gras (`Ctrl+B`), liste et tâche tapés au clavier avec les raccourcis Markdown, relus dans SQLite (JSON TipTap, marque `bold`, blocs `heading`, `bulletList`, `taskList`) ; de bout en bout dans Chromium : même saisie, structure conservée après rechargement |
| Création et modification | ✅ | `Ctrl+N` ouvre une note dans son titre (unitaire, bout en bout, natif) ; chaque enregistrement fait monter la révision |
| Enregistrement automatique | ✅ | « Enregistré » seulement après la réponse du cœur (unitaire). **Natif** : une fermeture demandée (`WM_DELETE_WINDOW`) juste après la frappe arrive pendant l'enregistrement en attente (journal), puis la fenêtre se ferme et le texte est en base. Échec, nouvel essai, conflit de révision et brouillon après un rechargement : unitaire et bout en bout |
| Liste, étiquettes, espaces, favoris | ✅ | Unitaire et bout en bout : recherche, filtres conservés dans l'adresse, tris, archives, corbeille, actions jusqu'à la suppression définitive, pages Favoris et Récemment ouverts |
| Import et export Markdown | ✅ | **Natif** : un vrai `.md` choisi dans le sélecteur GTK devient une note (titre, paragraphe, tableau, tâches), le `.txt` n'est pas proposé, l'original est intact (SHA-256 et date), l'export passe par le dialogue d'enregistrement et garde la structure. Unitaire : aller-retour stable, liens dangereux, images et HTML écartés |
| Liens internes et rétroliens | ✅ | **Natif** : le lien choisi dans le sélecteur est enregistré en relation `links_to` et la note cible l'affiche dans ses rétroliens ; bout en bout : liens suivis vers une note et vers un document |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` | ✅ 188/188 |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 132/132 (18 fichiers, dont 16 tests des notes et 3 de la conversion Markdown) |
| `npm run test:e2e` (dont axe-core sur la liste, l'éditeur, ses menus et dialogues, le gestionnaire d'étiquettes, le déplacement de dossier, l'aperçu Markdown et les pages personnelles) | ✅ 57/57 |
| `npm run test:visual` (30 scénarios, 3 résolutions) | ✅ captures revues ; défauts corrigés listés ci-dessous |
| `scripts/validate-native-phase5.py` : binaire de production, vraie base SQLite, sélecteur et dialogue d'enregistrement GTK, vraie demande de fermeture, quatre lancements sous Xvfb | ✅ 23/23 vérifications |
| CI GitHub (Linux et Windows) | ✅ frontend, bout en bout et accessibilité, cœur natif (run 45020946150 et, sur la pull request, 45020972116) ; build Windows MSI et NSIS avec test de démarrage (run 45020946186), commit `17dfd8e` |

### Défauts corrigés en cours de phase

- **Accessibilité** :
  - le focus se perdait quand un bandeau de l'éditeur disparaissait, ou quand une étiquette était renommée ou
    supprimée ; il revient désormais au texte ou au bon contrôle ;
  - les dialogues de formulaire s'ouvraient sur « Fermer » au lieu de leur premier champ (depuis la Phase 4) ;
  - les cases des tâches faisaient 16 px (WCAG 2.5.8) et portaient un nom anglais ;
  - le titre d'une note n'avait pas d'anneau de focus visible ;
  - une note de la corbeille n'était pas annoncée en lecture seule.
- **Échap** : dans un dialogue resté ouvert, une notification prenait la touche au dialogue ; le gestionnaire
  d'étiquettes affiche désormais ses retours en lui-même.
- **Sécurité** : un fichier Markdown pouvait laisser dans la note un lien `javascript:` ou `file:` (jamais
  ouvert, mais stocké et réexporté) ; ces adresses sont retirées à la conversion et au chargement.
- **Brouillon de récupération** : différé, il n'était jamais écrit pendant une saisie continue (l'enregistrement
  passait avant lui) ; il suit désormais les modifications avec au plus une seconde de retard.
- **Textes** :
  - un fichier Markdown trop volumineux annonçait la limite des documents (512 Mo) au lieu de 16 Mo ;
  - la suppression d'une étiquette inutilisée annonçait « 0 élément » ;
  - la légende des étiquettes d'une note parlait d'un document.
- **Divers** : indentation des dossiers invisible dans les listes déroulantes ; liste de résultats du sélecteur
  de liens qui clignotait pendant une recherche ; texte brut d'une note encombré de lignes vides ; liens
  internes en ambre (couleur de marque) au lieu du violet des relations.
- **Double de test** : renommer une étiquette vers un nom déjà pris réussissait, contrairement au cœur.

### Dépendances ajoutées

- npm : `@tiptap/react`, `@tiptap/pm`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-list`,
  `@tiptap/extension-table`, `@tiptap/extensions`, `@tiptap/markdown` (3.33.1, versions exactes) et `marked`
  17.0.6.
- Validation native : `python-xlib` (envoi d'une vraie demande de fermeture), en plus de Xvfb, xdotool et
  ImageMagick.

### Éléments reportés (volontairement, sans simulation)

- **Recherche plein texte** dans les notes et les documents (FTS5, surlignage) → Phase 6 ; la liste des notes
  cherche déjà dans leur texte.
- **Images dans les notes** : non prises en charge par l'éditeur ; à l'import, une image Markdown garde son texte
  alternatif et n'est jamais chargée depuis le réseau.
- **Relations proposées automatiquement** entre notes et documents → Phase 7 ; seuls les liens posés par
  l'utilisateur sont des relations.

### Limites restantes

- Sous Xvfb sans gestionnaire de fenêtres, une demande de fermeture est parfois perdue avant d'atteindre
  l'application (aucune trace dans le journal). Le script le détecte, recommence (trois tentatives au plus) et ne
  compte jamais ce cas comme une réussite. Cet artefact ne concerne pas Windows.
- Le brouillon de récupération vit dans le stockage local de la WebView : il protège d'un arrêt brutal, pas d'une
  réinstallation.
- Le dialogue d'enregistrement natif s'ouvre sur le dossier proposé par le système (sous Linux, le dossier
  courant) ; sous Windows, le dernier dossier utilisé.

---

## Phase 4 — Bibliothèque (terminée le 2026-11-22)

### Tâches réalisées

- [x] **4.1** Dépendances et décisions (ARCHITECTURE §16) : sélecteur de fichiers natif appelé côté Rust, sans
      permission accordée à l'interface ; DOCX lu avec `zip` et `quick-xml` ; PDF affiché et extrait par pdf.js,
      sans WebAssembly, ressources servies par l'application (CSP : `connect-src 'self'` ajouté).
- [x] **4.2** Pipeline d'import natif : fichier ordinaire, extension autorisée, 512 Mo au plus, signature des
      octets cohérente avec l'extension ; copie atomique avec empreinte SHA-256, doublons refusés ; extraction du
      texte (TXT et MD avec détection UTF-8, UTF-16 ou Windows-1252, CSV, JSON aplati avec le chemin des valeurs,
      DOCX avec titre, auteur et dates), dimensions des images ; une transaction par fichier, événement
      `document_imported`. Progression par `Channel`, annulation, rapport par fichier, nouvel essai des échecs
      temporaires. Glisser-déposer : le cœur mémorise les chemins du dépôt natif, l'interface n'en envoie aucun.
- [x] **4.3** Commandes documents : liste paginée, filtrée (format, espace, dossier, étiquette, dates d'ajout et
      de modification, favoris, état du texte) et triée (titre, ajout, modification, taille, ouverture) ; détail,
      renommage, déplacement, favori, archivage, corbeille, restauration, suppression définitive (l'entrée puis la
      copie gérée), export sous un nom assaini, « Afficher dans l'Explorateur », ouverture avec l'application par
      défaut, lecture par plages pour les aperçus, enregistrement du texte extrait par pdf.js.
- [x] **4.4** Dossiers (arborescence par espace, création, renommage, suppression refusée tant qu'il reste un
      document ou un sous-dossier) et étiquettes (création, affectation, filtre).
- [x] **4.5** Interface Bibliothèque : vues liste et grille, recherche sans tenir compte de la casse ni des
      accents, panneau de filtres avec puces retirables, tris, menu d'actions et menu contextuel, corbeille et
      archives, dépôt de fichiers sur la fenêtre, panneau de progression, `Ctrl+O` ; filtres conservés dans
      l'adresse.
- [x] **4.6** Page d'un document : aperçu PDF (pages, zoom, ajustement à la largeur), images, CSV en tableau, JSON
      mis en forme (contenu brut s'il est invalide), texte extrait, métadonnées réelles, emplacement, étiquettes,
      ouverture externe, export, favori ; l'ouverture est enregistrée (« Récemment ouverts »).
- [x] **4.7** Intégration : accueil d'une première installation tourné vers l'import, actions rapides, import
      dans l'espace affiché, pages Favoris, Récemment ouverts et Archives, création rapide « Importer un
      document », liens de la chronologie vers les documents qui existent encore.
- [x] **4.8** Validation (ci-dessous), documentation, captures `docs/screenshots/phase-4/`.

### Validation (critères de la spec §21, Phase 4)

| Critère | Résultat | Preuve |
|---|---|---|
| Import de vrais fichiers de test | ✅ | `scripts/make-library-fixtures.py` génère un fichier réel par format (PDF de deux pages, DOCX, PNG, TXT, CSV, JSON), un JSON mal formé et un exécutable renommé `.pdf` ; **natif** : sélection multiple dans le sélecteur GTK, 7 fichiers importés, l'exécutable refusé |
| Contenu extrait vérifié | ✅ | **Natif**, relu dans SQLite : texte et CSV tels quels, JSON aplati (`broches[0].nom: VCC`), DOCX (paragraphes, titre déclaré, auteur), image (48 × 32 px, aucun texte revendiqué), PDF extrait par pdf.js dans la WebView de production sous la CSP réelle (deux pages) ; JSON invalide conservé avec son problème signalé |
| Originaux intacts | ✅ | Empreinte SHA-256 et date de modification identiques avant et après les imports ; chaque copie gérée a l'empreinte de son original |
| Doublons | ✅ | Second import du même dossier : 7 doublons signalés avec un lien vers le document existant, 1 refus, aucun ajout |
| Import multiple, détection du format, métadonnées, stockage | ✅ | Tests Rust du pipeline (signatures, limites, encodages, archives DOCX piégées), import natif ci-dessus |
| Liste, grille, filtres, tris, favoris, étiquettes, dossiers | ✅ | Tests unitaires et de bout en bout (filtres conservés après rechargement, dossier non vide jamais supprimé) |
| Aperçu des documents | ✅ | pdf.js réel dans Chromium (bout en bout : pages, zoom, texte extrait) et dans la WebView native (capture) |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` | ✅ 165/165 (dont la partie DOCX démesurée lue jusqu’à la borne et le fichier de plus de 512 Mo refusé avant toute copie) |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 113/113 (16 fichiers) |
| `npm run test:e2e` (dont axe-core sur chaque écran, dialogue et panneau de la Bibliothèque) | ✅ 49/49 |
| `npm run test:visual` (24 scénarios, 3 résolutions) | ✅ captures revues ; défauts corrigés listés ci-dessous |
| `scripts/validate-native-phase4.py` : binaire de production, vraie base SQLite, sélecteur de fichiers GTK, trois lancements sous Xvfb | ✅ 18/18 vérifications |
| CI GitHub (Linux et Windows) | ✅ frontend, bout en bout, cœur natif (run 44993052398 et, sur la pull request, 44993057175, commit `78c293d`) ; build Windows MSI et NSIS avec test de démarrage (run 44991641331, commit `0220ea4`, dernier changement du code applicatif) |

### Défauts corrigés en cours de phase

- **Audit visuel** : filtres tronqués (regroupés dans un panneau, filtres actifs en puces) ; colonne du titre trop
  étroite à 1100 px ; titre d'un document coupé lettre par lettre par les boutons d'action ; superposition de
  dépôt illisible ; « Texte extrait » affiché pour une image (désormais « Sans texte »).
- **Contrôles segmentés** (depuis la Phase 1) : le bouton radio invisible était placé hors de son segment ; un clic
  ciblant son centre (contrôle vocal, automatisation) touchait l'option voisine. Il couvre désormais son segment,
  comme dans le formulaire d'espace de travail.
- **Filtres** : deux changements rapprochés écrasaient le premier.
- **Page d'un document** : la vue choisie (aperçu ou texte) persistait d'un document à l'autre.
- Une espace insécable brute dans un test de la Phase 3, remplacée par la séquence d'échappement (règle de
  CLAUDE.md).
- **CI** : axe-core mesurait le contraste des dialogues pendant leur fondu d'ouverture (échec intermittent, même
  sur un test de la Phase 1). L'audit, désormais partagé par toutes les suites, attend la fin des animations ;
  128 exécutions répétées sous charge sans échec. Clippy 1.100 refusait `chunks_exact` : remplacé par
  `as_chunks`. Le test du choix de la langue (Phase 2) exigeait un changement d'état immédiat alors que le
  bouton n'est coché qu'après l'enregistrement par le cœur : il attend désormais cet état. Suite complète répétée
  trois fois sous charge : 147 exécutions sans échec.

### Dépendances ajoutées

- Rust : `tauri-plugin-dialog` 2.8, `zip` 9.8 (décompression *deflate* seule), `quick-xml` 0.42 ; fonctionnalité
  `functions` de `rusqlite` (fonction SQL `archive_fold`).
- npm : `pdfjs-dist` 6.5.438.

### Éléments reportés (volontairement, sans simulation)

- **Renommage et suppression des étiquettes** : commandes natives prêtes et testées ; leur interface viendra avec
  les notes (Phase 5), qui partagent les mêmes étiquettes, pour que la confirmation annonce l'effet réel sur les
  documents et les notes.
- **Déplacement d'un dossier dans l'arborescence** → Phase 5, avec l'organisation commune des documents et des
  notes.
- **Rendu du Markdown** dans l'aperçu (affiché en texte brut) → Phase 5, avec l'import et l'export Markdown.
- **Recherche dans le contenu** des documents → Phase 6 (FTS5) ; la Bibliothèque cherche dans les titres et les
  noms de fichiers.
- **Ressources liées** d'un document → Phase 7 ; la page l'annonce sans rien inventer.
- **Reconnaissance de caractères (OCR)** : non intégrée ; les images et les PDF numérisés le disent clairement
  (spec §7.1).

### Limites restantes

- Le texte d'un PDF est extrait par pdf.js dans l'interface : un PDF reste « en attente » si l'application est
  fermée avant la fin, et l'extraction reprend au lancement suivant. Le texte conservé est limité à 16 Mo.
- La validation native s'exécute sous Linux (WebKitGTK) ; sous Windows (WebView2), le build est vérifié par la CI
  et un test de démarrage, l'aperçu PDF par les tests de bout en bout dans Chromium.
- La validation native pilote le sélecteur GTK et l'interface par coordonnées et au clavier (xdotool), sans
  gestionnaire de fenêtres : fiable à 1440 × 900, à adapter si la mise en page change.
- La CI suit la dernière version stable de Rust : la 1.100 a ajouté une règle clippy (`chunks_exact_to_as_chunks`)
  qui a fait échouer la CI de la branche sans changement de code. Le conteneur est désormais aligné
  (`rustup update stable`, consigne ajoutée à CLAUDE.md) et le code corrigé.

---

## Phase 3 — Vue d'ensemble et espaces de travail (terminée le 2026-11-21)

### Tâches réalisées

- [x] **3.1** Cœur natif : commandes `workspaces_list` (compteurs réels), `workspaces_get` (tableau de bord d'un
      espace), `workspaces_create`, `workspaces_update`, `workspaces_set_archived`, `workspaces_delete` avec trois
      stratégies explicites (`empty`, `move_to`, `unassign`), `dashboard_overview`, `timeline_list` ; événements
      `workspace_created`, `resource_archived`, `resource_restored`.
- [x] **3.2** Écran « Espaces de travail » : grille avec compteurs, création et modification (nom, description,
      couleur, icône), archivage et restauration, affichage des espaces archivés, suppression protégée.
- [x] **3.3** Tableau de bord d'un espace (`/workspaces/:id`) : nom dans le titre et le fil d'Ariane, description,
      date de création, contenu (documents, notes, dossiers), activité récente, favoris, actions à venir.
- [x] **3.4** Navigation : raccourcis des espaces actifs et « Nouvel espace » dans la barre latérale (repliée ou
      non), menu « Créer » dans la barre supérieure, `Ctrl+Maj+N` disponible ; page « Archives » alimentée par les
      espaces archivés.
- [x] **3.5** Vue d'ensemble réelle : statistiques issues de la base, actions rapides, activité récente,
      récemment ouverts, favoris, stockage local ; accueil d'une première installation avec un exemple
      d'organisation clairement identifié, qui n'est jamais enregistré comme donnée.
- [x] **3.6** Validation (ci-dessous), documentation, captures `docs/screenshots/phase-3/`.

### Validation (critères de la spec §21, Phase 3)

| Critère | Résultat | Preuve |
|---|---|---|
| Vue d'ensemble | ✅ | Chiffres et listes calculés par `dashboard_overview` (tests Rust, unitaires, bout en bout) ; accueil de première installation sans donnée fictive |
| Création d'un espace | ✅ | Au clavier seul (`Ctrl+Maj+N`, saisie, `Entrée`) en bout en bout ; dans l'application native, deux espaces créés puis relus dans SQLite |
| Modification | ✅ | Seuls les champs modifiés sont envoyés ; nom déjà pris (même archivé, casse ignorée) signalé sur le champ |
| Garde-fous de suppression | ✅ | Explication du contenu, déplacement vers l'espace choisi (dans un dossier au nom de l'espace supprimé) ou conservation « sans espace », confirmation explicite, focus initial sur « Annuler » ; **natif** : notes et dossiers déplacés, aucun supprimé (vérifié dans la base) |
| Tableau de bord d'un espace | ✅ | Tests unitaires et de bout en bout, capture native |
| Compteurs de ressources | ✅ | Comptages SQL (corbeille exclue) dans les cartes, le tableau de bord d'un espace et la vue d'ensemble |
| Structure de l'activité récente | ✅ | Chronologie réelle (création, archivage, restauration), liens vers les espaces existants, dates relatives |

### Tests exécutés

| Suite | Résultat |
|---|---|
| `cargo test` | ✅ 117/117 |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | ✅ |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | ✅ |
| `npm test` | ✅ 100/100 (14 fichiers) |
| `npm run test:e2e` (dont axe-core sur les nouveaux écrans, dialogues et menus) | ✅ 43/43 |
| `npm run test:visual` (15 scénarios, 3 résolutions) | ✅ captures revues ; deux défauts corrigés : actions rapides tronquées à 1100 px (passées en tuiles), valeurs des statistiques désalignées quand un libellé passe sur deux lignes |
| `scripts/validate-native-phase3.py` : binaire de production, vraie base SQLite, trois lancements sous Xvfb pilotés par xdotool | ✅ 9/9 vérifications (création, chronologie, suppression avec déplacement, persistance, journal sans erreur ni violation de CSP) |
| CI GitHub (Linux et Windows) | ✅ frontend, bout en bout, cœur natif, build Windows MSI et NSIS avec test de fumée (run 44942226134 et 44942224957, commit `ff9dd96`) |

### Défaut corrigé en cours de phase

- **Barre latérale repliée** (présent depuis la Phase 1) : le déclencheur d'infobulle (Radix `Slot`) fusionne les
  classes en texte et transformait la fonction `className` de `NavLink` en chaîne. Les liens perdaient leur style :
  icônes décentrées, cibles de 39×18 px. Le test axe `target-size` l'a révélé. L'état actif est désormais calculé
  avec `useMatch`.

### Dépendances ajoutées

Aucune.

### Éléments reportés (volontairement, sans simulation)

- **Gestion des dossiers** et affectation de documents et de notes (spec §12.1) → Phases 4 et 5 : elles exigent
  la Bibliothèque et l'éditeur. Les compteurs et la suppression protégée les prennent déjà en charge.
- **Notes liées** du tableau de bord d'un espace (spec §12.2) → Phase 5.
- **Actions « Importer un document », « Nouvelle note », « Ouvrir l'assistant IA »** : visibles, désactivées et
  marquées « Bientôt disponible » jusqu'aux Phases 4, 5 et 9.
- **Chronologie complète** (filtres, regroupement par date, effacement) → Phase 8 ; la page l'annonce sans
  prétendre qu'il n'y a aucune activité.

### Limites restantes

- La validation native pilote l'interface par coordonnées et par le clavier (xdotool) : elle est fiable à
  1440×900 mais doit être adaptée si la mise en page change.
- xdotool n'est pas installé par le script de l'environnement cloud : `apt-get install -y xdotool` avant la
  validation native (le script vérifie ses prérequis et l'indique).
- xdotool ne sait pas taper une majuscule accentuée (« É » devient « é ») : le scénario natif utilise des noms à
  accents minuscules. L'interface et la base traitent correctement les majuscules accentuées (tests unitaires et
  de bout en bout).

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

**Phase 10** (spec §16 et §21), branche `phase/10-finalisation`. Décisions de la tâche 10.1 consignées dans
ARCHITECTURE §7.1 (sauvegarde ZIP avec manifeste et empreintes, historique en table `backups` au schéma v5,
vérification stricte, restauration appliquée au démarrage avant l'ouverture de la base, export lisible). Prochaine
tâche : **10.2** (sauvegarde, vérification, historique et restauration, côté cœur puis Paramètres › Stockage).

| # | Tâche |
|---|---|
| **10.1** | Décisions : format de sauvegarde (base SQLite cohérente par l'API de sauvegarde, fichiers stockés, manifeste avec empreintes), restauration sans écraser les données courantes sans confirmation, exclusion des secrets (spec : aucune clé dans les sauvegardes par défaut) |
| 10.2 | Sauvegarde et restauration : commandes natives validées, sauvegarde manuelle, vérification d'intégrité, restauration après confirmation, tests Rust |
| 10.3 | Export : export complet lisible (Markdown des notes, fichiers d'origine, métadonnées JSON) |
| 10.4 | Validation des données et reprise après erreur : contrôle d'intégrité étendu, réparation guidée de l'index, messages clairs |
| 10.5 | Revue de sécurité (capabilities, CSP, entrées des commandes, chemins, journal, secrets) et corrections |
| 10.6 | Performances et mémoire : mesures sur corpus généré, optimisations mesurées |
| 10.7 | Packaging Windows : installateurs MSI et NSIS, métadonnées, icônes, identifiant d'application (validation du porteur) |
| 10.8 | Audit visuel final, documentation utilisateur, validation (spec §21), CI, fusion |
