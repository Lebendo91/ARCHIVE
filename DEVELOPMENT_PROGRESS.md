# ARCHIVE — Suivi de développement

> Document de continuité (spec §22). **Toute session commence par sa lecture**, puis par celle
> d'[ARCHITECTURE.md](ARCHITECTURE.md). Mettre à jour en continu et en fin de phase.

## Phase courante

**Phase 5 — Notes : validée localement** (branche `phase/5-notes`) : tests Rust, unitaires, de bout en bout,
accessibilité, audit visuel et validation native au vert. Restent la CI GitHub, la pull request et la fusion
dans `main`.
La Phase 4 est terminée : validée localement (tests, application native, audit visuel), CI Linux et build Windows
au vert (run 44993052398, commit `78c293d` ; run 44991641331, commit `0220ea4`), fusionnée dans `main` par la
pull request Lebendo91/ARCHIVE#1 le 2026-11-22. Le porteur du projet a demandé l'enchaînement autonome des phases ; une reprise automatique est
programmée après chaque réinitialisation de sa limite d'utilisation.

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Audit de l'environnement | ✅ Terminée |
| 1 | Fondation et design system | ✅ Terminée et validée |
| 2 | Base de données et stockage local | ✅ Terminée |
| 3 | Vue d'ensemble et espaces de travail | ✅ Terminée |
| 4 | Bibliothèque | ✅ Terminée |
| 5 | Notes | ▶ Validée localement, CI et fusion en cours |
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
| CI GitHub (Linux et Windows) | ⏳ à exécuter sur la pull request |

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

**Phase 5 — Notes** (spec §8), branche `phase/5-notes`. Tâches 5.1 à 5.7 réalisées et poussées
(commits `07ada80`, `89f43d1`, `2cb54db`, `f122d27`) ; validation déjà exécutée sur ces commits : 188 tests
Rust, 112 tests unitaires, 49 tests de bout en bout, clippy, formatage. Prochaine tâche : **5.8**, dans cet ordre :

1. Tests unitaires des notes (`src/app/Phase5.test.tsx`) : création (`Ctrl+N`), enregistrement automatique et
   état, conflit de révision (`stale_revision`), brouillon de récupération, liens et rétroliens, sélecteur de
   liens, filtres de la liste, actions (dupliquer, renommer, déplacer, étiquettes, corbeille, purge), import et
   export Markdown (`markdownPicks`, `exports` du double), gestionnaire d'étiquettes, déplacement de dossier,
   pages personnelles, notes liées d'un document, aperçu Markdown (images et HTML écartés).
2. Tests de bout en bout `tests/e2e/phase5.spec.ts` avec axe sur les écrans des notes et les nouvelles boîtes
   de dialogue ; scénarios visuels complémentaires (gestionnaire d'étiquettes, déplacement de dossier, aperçu
   Markdown) dans `tests/e2e/visual.spec.ts`, puis relecture des captures.
3. Validation native `scripts/validate-native-phase5.py` (Xvfb + xdotool, comme `validate-native-phase4.py`) :
   saisie réelle dans l'éditeur, enregistrement automatique vérifié dans SQLite, liens et relations, import
   d'un vrai `.md` par le sélecteur GTK, export par la boîte d'enregistrement, relance.
4. Documentation (section Phase 5 ici, ARCHITECTURE, CHANGELOG, README, `docs/screenshots/phase-5`), CI,
   pull request par l'API REST, fusion par commit de fusion.

| # | Tâche |
|---|---|
| **5.1** | Dépendances et décisions : TipTap 3 (StarterKit, soulignement, listes de tâches, tableaux, liens), format de stockage (JSON TipTap et texte brut pour la recherche), conversion Markdown fidèle dans les deux sens, assainissement des liens |
| 5.2 | Cœur natif : commandes notes (liste filtrée et triée, lecture, création, enregistrement avec révision pour refuser une écriture fondée sur une version périmée, renommage, duplication, archivage, favori, déplacement, corbeille, restauration, suppression définitive confirmée), étiquettes, liens entre notes et vers des documents, rétroliens, événements de chronologie |
| 5.3 | Éditeur : barre d'outils sobre, tous les formats de la spec §8.1, enregistrement automatique différé avec état visible (« Enregistré » seulement après la réussite de l'écriture), récupération après redémarrage |
| 5.4 | Liens internes : insertion d'un lien vers une note, ouverture directe, panneau des rétroliens |
| 5.5 | Liste des notes, filtres, étiquettes, favoris, espaces ; « Nouvelle note » dans la création rapide, la vue d'ensemble et les espaces ; `Ctrl+N` |
| 5.6 | Import et export Markdown (sélecteur et enregistrement natifs) ; rendu Markdown dans l'aperçu des documents |
| 5.7 | Gestion des étiquettes (renommage, suppression avec effet annoncé) et déplacement des dossiers, communs aux documents et aux notes |
| 5.8 | Validation (spec §21) : tests Rust, unitaires, de bout en bout, accessibilité, validation native, audit visuel, documentation, CI, fusion |
