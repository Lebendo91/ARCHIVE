# Changelog

Toutes les évolutions notables d'ARCHIVE sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Le projet adoptera le
[versionnage sémantique](https://semver.org/lang/fr/) dès la première version distribuable.

## [Non publié]

### Ajouté — Phase 5 : Notes (2026-11-22)

- Éditeur de notes riche :
  - titres, gras, italique, souligné, barré, code, liens, listes à puces, numérotées et de tâches, citations,
    blocs de code, tableaux et séparateurs, par la barre d'outils, les raccourcis clavier et les raccourcis
    Markdown (`## `, `- `, `[ ] `, `> `…) ;
  - enregistrement automatique avec un état toujours visible ; « Enregistré » ne s'affiche qu'une fois
    l'écriture confirmée ;
  - aucune perte silencieuse :
    - une note modifiée ailleurs entre-temps n'est jamais écrasée : on choisit de recharger la version
      enregistrée ou de garder la sienne ;
    - un échec d'enregistrement le dit et propose de réessayer ;
    - les modifications non enregistrées d'une session interrompue sont proposées au lancement suivant ;
    - fermer la fenêtre attend la fin de l'enregistrement en cours.
- Liens internes vers une note ou un document, choisis dans un sélecteur avec recherche ; un clic ouvre la cible.
  Chaque note affiche ses liens et ses rétroliens, et la page d'un document liste les notes qui le citent. Les
  liens web et électroniques s'ouvrent dans l'application par défaut, après vérification par le cœur.
- Liste des notes : recherche dans les titres et le texte, filtres (espace de travail, étiquette, date,
  favoris), tris, dossiers, notes archivées et corbeille. Actions : dupliquer, renommer, déplacer, étiquettes,
  favori, archiver, mettre à la corbeille, restaurer, supprimer définitivement après confirmation.
- « Nouvelle note » (`Ctrl+N`) depuis la liste, le menu « Créer », la vue d'ensemble et chaque espace de
  travail ; les notes apparaissent dans la vue d'ensemble, les favoris, les récemment ouverts et les archives.
- Markdown :
  - import de fichiers `.md` par le sélecteur natif, chaque fichier devenant une note à son nom ;
  - export d'une note à l'endroit choisi, en gardant sa structure ;
  - aperçu mis en page des documents Markdown de la Bibliothèque, sans image distante ni HTML exécuté.
- Gestion des étiquettes, communes aux documents et aux notes :
  - renommage partout à la fois ;
  - suppression qui annonce le nombre d'éléments concernés et ne supprime jamais l'élément lui-même.
- Déplacement d'un dossier avec son contenu, jamais à l'intérieur de lui-même.

### Corrigé — Phase 5

- Dialogues de renommage, de déplacement, d'étiquettes et de dossier : le focus s'ouvrait sur le bouton
  « Fermer » ; il va désormais au premier champ, texte sélectionné.
- Indentation des dossiers dans les listes déroulantes : invisible, car les espaces ordinaires étaient fusionnés.
- Liens d'un fichier Markdown importé : les adresses `javascript:` ou `file:` étaient conservées dans la note
  (sans jamais pouvoir s'ouvrir) ; elles sont désormais retirées, et leur texte est gardé.
- Cases à cocher des tâches : cible portée à 24 px (WCAG 2.5.8), nom accessible en français, désactivées en
  lecture seule.

### Ajouté — Phase 4 : Bibliothèque (2026-11-22)

- Import de documents : PDF, Word (DOCX), texte, Markdown, CSV, JSON et images (PNG, JPEG, WebP).
  - Par le sélecteur de fichiers (`Ctrl+O`, bouton « Importer », création rapide), plusieurs fichiers à la fois,
    ou en déposant des fichiers sur la fenêtre ; dans l'espace de travail affiché, le cas échéant.
  - Chaque fichier est vérifié (taille, extension, contenu réel) puis **copié** : l'original n'est jamais
    modifié ni déplacé.
  - Panneau de progression fichier par fichier : importé, doublon (avec un lien vers le document existant),
    refusé avec la raison, ou importé sans texte ; annulation et nouvel essai des échecs temporaires.
  - Texte extrait pour la recherche : texte et Markdown (UTF-8, UTF-16 ou Windows-1252), CSV, JSON, Word (avec
    titre et auteur) et PDF (pages comprises). Les images n'ont pas de texte : aucune reconnaissance de
    caractères n'est prétendue.
- Bibliothèque :
  - vues liste et grille, recherche dans les titres et les noms de fichiers sans tenir compte de la casse ni des
    accents, tris (titre, ajout, modification, taille, dernière ouverture) ;
  - filtres par format, espace de travail, dossier, étiquette, dates, favoris et état du texte, affichés en puces
    retirables et conservés dans l'adresse ;
  - dossiers par espace de travail (création, renommage, suppression d'un dossier vide seulement) et étiquettes ;
  - actions par menu ou clic droit : ouvrir, ouvrir avec l'application par défaut, afficher dans l'Explorateur,
    exporter une copie, renommer, déplacer, étiquettes, favori, archiver, mettre à la corbeille ;
  - corbeille avec restauration et suppression définitive confirmée, qui efface la copie gérée et jamais le
    fichier d'origine.
- Page d'un document : aperçu PDF (pages, zoom, ajustement à la largeur), images, CSV en tableau, JSON mis en
  forme, texte extrait, informations (format, taille, pages, dimensions, auteur, dates, empreinte SHA-256),
  emplacement et étiquettes.
- Vue d'ensemble, espaces de travail, Favoris, Récemment ouverts et Archives affichent désormais les documents.

### Corrigé — Phase 4

- Contrôles segmentés : un clic visant le centre d'une option (contrôle vocal) pouvait sélectionner sa voisine.
- Bibliothèque : deux changements de filtre rapprochés pouvaient s'annuler.

### Ajouté — Phase 3 : vue d'ensemble et espaces de travail (2026-11-21)

- Espaces de travail :
  - création, modification (nom, description, couleur d'accent, icône), archivage et restauration ;
  - grille avec le nombre réel de documents, de notes et de dossiers, et affichage des espaces archivés ;
  - noms uniques sans tenir compte de la casse, même parmi les espaces archivés, signalés sur le champ.
- Suppression protégée : le dialogue explique ce que contient l'espace et propose de déplacer ce contenu vers un
  autre espace (regroupé dans un dossier à son nom) ou de le conserver sans espace. Rien n'est jamais supprimé,
  et une confirmation explicite est demandée.
- Tableau de bord de chaque espace : description, contenu, activité récente, favoris et actions à venir.
- Navigation : raccourcis des espaces actifs et « Nouvel espace » dans la barre latérale, menu « Créer » dans la
  barre supérieure, raccourci `Ctrl+Maj+N`. La page Archives liste les espaces archivés.
- Vue d'ensemble réelle :
  - statistiques calculées depuis la base (documents, notes, espaces, stockage, éléments indexés) ;
  - actions rapides, activité récente, récemment ouverts, favoris et stockage local ;
  - accueil d'une première installation avec un exemple d'organisation clairement identifié, jamais enregistré.
- Pluriels corrects en français et en anglais (« 0 document », « 2 notes »), formats de nombres, de listes et de
  dates relatives selon la langue.
- Accessibilité : focus placé sur le nom à l'ouverture du formulaire et sur « Annuler » pour une suppression,
  rendu à l'élément d'origine à la fermeture, ou au contenu principal si cet élément a disparu.

### Corrigé — Phase 3

- Barre latérale repliée : les liens perdaient leur style (icônes décentrées, cibles trop petites).
- Chronologie : la page n'annonce plus « aucune activité » alors que des événements sont enregistrés.

### Ajouté — Phase 2 : base de données et stockage local (2026-11-21)

- Base SQLite locale (mode WAL) dans le dossier local de l'application, avec des migrations versionnées :
  - copie de sécurité automatique avant chaque migration ;
  - détection des migrations modifiées ;
  - annulation complète en cas d'échec ;
  - refus de toucher une base créée par une version plus récente.
- Schéma des entités cœur : espaces de travail, dossiers, documents et texte extrait, notes, étiquettes,
  relations avec provenance, événements de chronologie, fournisseurs IA et paramètres. Il comprend des noms
  uniques insensibles à la casse (lettres accentuées comprises) et aux espaces multiples, une corbeille réversible pour les documents et les notes, et
  des notes protégées contre l'écrasement d'une version plus récente.
- Couche d'accès aux données validée, avec des règles de suppression sûres : un espace ou un dossier non vide
  ne se supprime jamais implicitement.
- Stockage géré des fichiers : copie atomique sans jamais modifier l'original, empreinte SHA-256, chemins
  protégés contre la traversée de répertoires.
- Mode sans échec : si la base ne peut pas être ouverte, ARCHIVE démarre quand même, explique la cause,
  rassure sur l'intégrité des données et propose de réessayer ou d'ouvrir le dossier des données.
- Paramètres persistés : la langue de l'interface (français ou anglais) s'applique immédiatement et est
  conservée.
- Paramètres › Stockage : emplacements réels, espace utilisé, espace disque libre, ouverture des dossiers et
  vérification de l'intégrité de la base. Indicateur de stockage dans la barre latérale.
- Journal applicatif rotatif (`logs/archive.log`), sans contenu de document ni secret.
- Messages d'erreur traduits pour chaque code d'erreur du cœur natif.
- Types TypeScript générés depuis Rust (`ts-rs`) et vérifiés par la CI.
- Qualité : 98 tests Rust, 86 tests unitaires et d'intégration, 37 tests de bout en bout et d'accessibilité.

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
