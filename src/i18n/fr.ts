/**
 * French dictionary: the reference for every other language (see ./types.ts).
 * Typography: typographic apostrophes and a non-breaking space (\u00a0) before high punctuation.
 */
export const fr = {
  app: {
    name: 'ARCHIVE',
    designation: 'Votre second cerveau',
    tagline: 'Everything you know. Nothing forgotten.',
  },
  common: {
    comingSoon: 'Bientôt disponible',
    available: 'Disponible',
    close: 'Fermer',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    retry: 'Réessayer',
    loading: 'Chargement…',
    unavailable: 'Indisponible',
    backToOverview: 'Retour à la vue d’ensemble',
  },
  a11y: {
    skipToContent: 'Aller au contenu principal',
    pageAnnouncement: 'Page affichée\u00a0: {title}',
  },
  nav: {
    mainLabel: 'Navigation principale',
    overview: 'Vue d’ensemble',
    library: 'Bibliothèque',
    notes: 'Notes',
    graph: 'Graphe de connaissances',
    timeline: 'Chronologie',
    assistant: 'Assistant IA',
    workspacesSection: 'Espaces de travail',
    allWorkspaces: 'Tous les espaces',
    createWorkspace: 'Nouvel espace',
    personalSection: 'Personnel',
    favorites: 'Favoris',
    recent: 'Récemment ouverts',
    archived: 'Archives',
    settings: 'Paramètres',
    help: 'Aide',
  },
  sidebar: {
    collapse: 'Replier la barre latérale',
    expand: 'Déplier la barre latérale',
    storage: 'Stockage local',
    storageUsed: '{size} utilisés',
  },
  boot: {
    loading: 'Chargement d’ARCHIVE…',
  },
  safeMode: {
    title: 'ARCHIVE n’a pas pu ouvrir vos données',
    reassurance: 'Vos données n’ont pas été modifiées.',
    causes: {
      databaseTooNew:
        'Votre base de données a été créée par une version plus récente d’ARCHIVE. Installez la dernière version pour y accéder.',
      migrationFailed:
        'La mise à jour de la structure de la base de données a échoué. La copie de sécurité prise juste avant se trouve dans le dossier des sauvegardes.',
      other:
        'La base de données est inaccessible. Elle est peut-être utilisée par un autre programme ou endommagée, ou le disque est plein.',
    },
    retry: 'Réessayer',
    openDataFolder: 'Ouvrir le dossier des données',
    dataDir: 'Dossier des données',
    stillUnavailable: 'La base de données est toujours inaccessible.',
  },
  topbar: {
    breadcrumb: 'Fil d’Ariane',
    search: 'Rechercher dans ARCHIVE…',
    searchUnavailable:
      'La recherche globale sera disponible dès que vous pourrez ajouter des documents et des notes.',
  },
  profile: {
    menuLabel: 'Menu du profil',
    name: 'Profil local',
    hint: 'Données sur cet appareil',
    description: 'Vos données restent sur cet appareil. Aucun compte n’est nécessaire.',
    settings: 'Paramètres',
    help: 'Aide et raccourcis',
    about: 'À propos d’ARCHIVE',
  },
  dashboard: {
    greeting: {
      morning: 'Bonjour',
      afternoon: 'Bon après-midi',
      evening: 'Bonsoir',
    },
    welcome: '{greeting}. Bienvenue dans ARCHIVE.',
    subtitle: 'Vos connaissances, organisées en un seul endroit.',
    localFirst: {
      description:
        'ARCHIVE stocke tout sur cet appareil. Aucun compte, aucune synchronisation imposée, aucun envoi sans action de votre part.',
    },
    stats: {
      title: 'Votre base de connaissances',
      documents: 'Documents',
      notes: 'Notes',
      workspaces: 'Espaces de travail',
      storage: 'Stockage utilisé',
      indexed: 'Indexés en 7 jours',
    },
    actionsTitle: 'Actions rapides',
    openAssistant: 'Ouvrir l’assistant IA',
    recentActivity: 'Activité récente',
    noActivity: 'Votre activité (imports, notes, espaces de travail) apparaîtra ici.',
    recentlyOpened: 'Récemment ouverts',
    noRecentlyOpened: 'Les documents et les notes que vous ouvrirez apparaîtront ici.',
    favorites: 'Favoris',
    noFavorites:
      'Marquez vos documents et vos notes essentiels comme favoris pour les retrouver ici.',
    storageTitle: 'Stockage local',
    storageSummary: 'ARCHIVE occupe {used} sur cet appareil.',
    storageFree: '{free} restent libres sur le disque.',
    storageLink: 'Détails du stockage',
    storageFiles: { one: '{count} fichier stocké', other: '{count} fichiers stockés' },
    onboarding: {
      title: 'Commencez par créer un espace de travail',
      description:
        'Un espace regroupe les documents et les notes d’un même contexte\u00a0: vos études, un projet, votre activité professionnelle…',
      action: 'Créer un espace de travail',
      upcoming: 'L’import de documents et l’éditeur de notes arrivent prochainement.',
      readyTitle: 'Vos espaces de travail sont prêts',
      readyDescription:
        'Ils accueilleront bientôt vos documents et vos notes. D’ici là, vous pouvez les organiser et les personnaliser.',
      viewWorkspaces: 'Voir les espaces de travail',
      exampleLabel: 'Exemple d’organisation',
      exampleWorkspace: 'Électronique',
      exampleFolders: ['Cours', 'Projets'],
      exampleItems: ['Cours NE555.pdf', 'Lois de Kirchhoff'],
    },
  },
  modules: {
    capabilitiesTitle: 'Ce que vous pourrez faire ici',
    library: {
      title: 'Aucun document pour l’instant',
      description:
        'Les documents que vous importerez apparaîtront ici, avec leur aperçu, leur texte extrait et leurs étiquettes.',
      capabilities: [
        'Importer des PDF, des documents Word, du texte, du Markdown, du CSV, du JSON et des images',
        'Classer par espace de travail, dossier et étiquette',
        'Prévisualiser chaque document et consulter son texte extrait',
      ],
    },
    notes: {
      title: 'Aucune note pour l’instant',
      description:
        'Vos notes apparaîtront ici. L’éditeur enregistrera automatiquement votre travail.',
      capabilities: [
        'Rédiger avec titres, listes, tableaux, code et cases à cocher',
        'Relier vos notes entre elles et à vos documents',
        'Importer et exporter en Markdown',
      ],
    },
    graph: {
      title: 'Aucune relation pour l’instant',
      description:
        'Le graphe montrera les liens entre vos documents, vos notes et vos concepts dès qu’ils existeront.',
      capabilities: [
        'Explorer les relations sur une carte en deux dimensions',
        'Filtrer par type d’élément et de relation',
        'Accepter ou rejeter les relations suggérées',
      ],
    },
    timeline: {
      title: 'La chronologie complète arrive bientôt',
      description:
        'Votre activité est déjà consignée\u00a0: ses derniers événements figurent sur la vue d’ensemble. Cette page permettra de la parcourir en entier.',
      capabilities: [
        'Parcourir votre activité jour par jour',
        'Filtrer par type d’événement, espace de travail et période',
        'Effacer l’historique quand vous le souhaitez',
      ],
    },
    assistant: {
      title: 'Aucun fournisseur IA configuré',
      description:
        'L’assistant est facultatif. Il répondra à partir des documents et des notes que vous choisirez, en citant ses sources.',
      capabilities: [
        'Utiliser Anthropic, OpenAI ou Google Gemini avec votre propre clé',
        'Choisir précisément ce qui est partagé avec le fournisseur',
        'Vérifier chaque réponse grâce aux citations',
      ],
    },
    favorites: {
      title: 'Aucun favori',
      description: 'Les documents et les notes que vous marquerez comme favoris apparaîtront ici.',
      capabilities: [
        'Accéder en un clic à vos ressources essentielles',
        'Retrouver vos favoris depuis la vue d’ensemble',
      ],
    },
    recent: {
      title: 'Rien d’ouvert récemment',
      description:
        'Les documents et les notes que vous ouvrirez apparaîtront ici, du plus récent au plus ancien.',
      capabilities: [
        'Reprendre votre travail là où vous l’avez laissé',
        'Retrouver une ressource consultée sans la rechercher',
      ],
    },
    archived: {
      title: 'Aucun élément archivé',
      workspacesTitle: 'Espaces de travail archivés',
      workspacesHint:
        'Restaurez un espace pour le retrouver dans la barre latérale. Les documents et les notes archivés apparaîtront aussi ici.',
      description:
        'Les éléments archivés quittent les vues principales sans être supprimés. Vous les retrouverez ici.',
      capabilities: [
        'Alléger vos vues sans rien perdre',
        'Restaurer un élément archivé à tout moment',
      ],
    },
  },
  workspaces: {
    intro:
      'Organisez vos connaissances par contexte\u00a0: études, travail, recherche, projets personnels…',
    create: 'Nouvel espace de travail',
    showArchived: 'Afficher les espaces archivés',
    archivedBadge: 'Archivé',
    activeTitle: 'Espaces actifs',
    archivedTitle: 'Espaces archivés',
    counts: {
      documents: { one: '{count} document', other: '{count} documents' },
      notes: { one: '{count} note', other: '{count} notes' },
      folders: { one: '{count} dossier', other: '{count} dossiers' },
    },
    actions: {
      menu: 'Actions de l’espace «\u00a0{name}\u00a0»',
      edit: 'Modifier',
      archive: 'Archiver',
      restore: 'Restaurer',
      delete: 'Supprimer',
    },
    empty: {
      title: 'Aucun espace de travail pour l’instant',
      description:
        'Créez un premier espace pour organiser vos documents et vos notes par contexte\u00a0: vos études, un projet, votre activité professionnelle…',
      action: 'Créer un espace de travail',
    },
    emptyActive: {
      title: 'Aucun espace actif',
      description:
        'Tous vos espaces sont archivés. Affichez-les pour les consulter ou les restaurer.',
    },
    form: {
      createTitle: 'Nouvel espace de travail',
      editTitle: 'Modifier l’espace de travail',
      name: 'Nom',
      namePlaceholder: 'Ex. Électronique',
      nameRequired: 'Le nom est obligatoire.',
      nameTaken: 'Un espace de travail, peut-être archivé, porte déjà ce nom.',
      description: 'Description',
      descriptionPlaceholder: 'À quoi sert cet espace\u00a0?',
      descriptionHint: 'Facultative.',
      color: 'Couleur',
      icon: 'Icône',
      submitCreate: 'Créer l’espace',
      submitSave: 'Enregistrer',
    },
    colors: {
      amber: 'Ambre',
      blue: 'Bleu',
      cyan: 'Cyan',
      purple: 'Violet',
      success: 'Vert',
      warning: 'Jaune',
      danger: 'Rouge',
      neutral: 'Gris',
    },
    icons: {
      folder: 'Dossier',
      'book-open': 'Livre',
      'graduation-cap': 'Études',
      briefcase: 'Travail',
      cpu: 'Électronique',
      'flask-conical': 'Laboratoire',
      code: 'Programmation',
      lightbulb: 'Idées',
      rocket: 'Projet',
      landmark: 'Institution',
      wrench: 'Technique',
      globe: 'Monde',
      palette: 'Création',
      heart: 'Personnel',
      house: 'Maison',
      music: 'Musique',
    },
    toasts: {
      created: 'Espace «\u00a0{name}\u00a0» créé.',
      saved: 'Modifications enregistrées.',
      archived: 'Espace «\u00a0{name}\u00a0» archivé.',
      restored: 'Espace «\u00a0{name}\u00a0» restauré.',
      deleted: 'Espace «\u00a0{name}\u00a0» supprimé.',
      moved:
        'Son contenu a été déplacé dans «\u00a0{target}\u00a0», dossier «\u00a0{folder}\u00a0».',
      unassigned: 'Ses documents et ses notes ont été conservés sans espace de travail.',
    },
    delete: {
      title: 'Supprimer «\u00a0{name}\u00a0»\u00a0?',
      emptyDescription: 'Cet espace est vide. Sa suppression est définitive.',
      strategy: 'Que devient son contenu\u00a0?',
      contentDescription:
        'Cet espace contient {content}. Rien de ce contenu ne sera supprimé\u00a0: choisissez ce qu’il devient.',
      moveOption: 'Le déplacer vers un autre espace',
      moveHint:
        'Tout sera regroupé dans un dossier «\u00a0{name}\u00a0» de l’espace choisi, avec ses sous-dossiers.',
      target: 'Espace de destination',
      noTarget: 'Aucun autre espace n’est disponible.',
      unassignOption: 'Le conserver sans espace de travail',
      unassignHint:
        'Les documents et les notes restent dans votre bibliothèque\u00a0; seuls les dossiers sont retirés.',
      confirm: 'Supprimer l’espace',
    },
    detail: {
      fallbackTitle: 'Espace de travail',
      createdOn: 'Créé le {date}',
      stats: {
        title: 'Contenu de l’espace',
        documents: 'Documents',
        notes: 'Notes',
        folders: 'Dossiers',
      },
      actionsTitle: 'Actions rapides',
      upcoming: 'Vous pourrez bientôt importer des documents et rédiger des notes dans cet espace.',
      activity: 'Activité récente',
      favorites: 'Favoris',
      noActivity: 'Aucune activité dans cet espace pour l’instant.',
      noFavorites: 'Les documents et les notes favoris de cet espace apparaîtront ici.',
      notFoundTitle: 'Espace introuvable',
      notFoundDescription: 'Cet espace de travail n’existe plus.',
      back: 'Retour aux espaces de travail',
    },
  },
  quickCreate: {
    label: 'Créer',
  },
  activity: {
    events: {
      document_imported: 'Document importé',
      note_created: 'Note créée',
      note_modified: 'Note modifiée',
      resource_favorited: 'Ajouté aux favoris',
      workspace_created: 'Espace créé',
      relation_accepted: 'Relation acceptée',
      resource_archived: 'Archivé',
      resource_restored: 'Restauré',
    },
    kinds: {
      document: 'Document',
      note: 'Note',
      concept: 'Concept',
      workspace: 'Espace de travail',
      tag: 'Étiquette',
      relation: 'Relation',
    },
    untitled: 'Sans titre',
  },
  settings: {
    sectionsLabel: 'Sections des paramètres',
    sections: {
      general: 'Général',
      appearance: 'Apparence',
      storage: 'Stockage',
      ai: 'Intelligence artificielle',
      shortcuts: 'Raccourcis clavier',
      about: 'À propos',
    },
    currentTitle: 'Configuration actuelle',
    upcomingTitle: 'Réglages à venir',
    general: {
      description: 'Préférences générales de l’application.',
      languageTitle: 'Langue de l’interface',
      languageDescription:
        'La langue s’applique immédiatement et reste en place lors des prochains démarrages.',
      languages: {
        fr: 'Français',
        en: 'English',
      },
      languageSaved: 'Langue de l’interface mise à jour.',
      upcoming: [
        'Comportement au démarrage',
        'Espace de travail par défaut',
        'Préférences de notification',
      ],
    },
    appearance: {
      description: 'Thème et confort visuel.',
      current: {
        theme: 'Thème',
        themeValue: 'Obsidian (sombre)',
        motion: 'Animations',
        motionValue: 'Réduites automatiquement si le système le demande',
      },
      upcoming: ['Thèmes clair et système', 'Personnalisation limitée de l’accent'],
    },
    storage: {
      description: 'Emplacement et protection de vos données locales.',
      locationsTitle: 'Emplacements',
      locations: {
        data: 'Dossier des données',
        database: 'Base de données',
        files: 'Fichiers importés',
        backups: 'Sauvegardes',
        logs: 'Journaux',
      },
      open: 'Ouvrir',
      openLabel: 'Ouvrir le dossier «\u00a0{folder}\u00a0»',
      usageTitle: 'Espace utilisé',
      usage: {
        database: 'Base de données',
        files: 'Fichiers importés',
        filesCount: '{count} fichier(s)',
        backups: 'Sauvegardes',
        logs: 'Journaux',
        total: 'Total utilisé par ARCHIVE',
        diskFree: 'Espace libre sur le disque',
        diskFreeValue: '{free} sur {total}',
        unknown: 'Information indisponible',
      },
      integrityTitle: 'Intégrité de la base de données',
      integrityDescription:
        'Vérifie la structure de la base et la cohérence des liens entre les éléments.',
      integrityRun: 'Vérifier l’intégrité',
      integrityOk: 'Aucun problème détecté.',
      integrityProblems: 'Problèmes détectés\u00a0: {count}',
      integrityCheckedAt: 'Vérification effectuée le {date}.',
      backupsTitle: 'Sauvegardes',
      backupsAutomatic:
        'Avant chaque mise à jour de la structure de la base, ARCHIVE en dépose automatiquement une copie dans le dossier des sauvegardes.',
      backupsUpcoming:
        'La sauvegarde complète, la restauration et l’export arrivent avec un prochain module.',
      unavailable:
        'Les informations de stockage ne sont disponibles que dans l’application de bureau.',
    },
    ai: {
      description: 'Fournisseur d’intelligence artificielle facultatif.',
      current: {
        provider: 'Fournisseur',
        providerValue: 'Aucun. ARCHIVE fonctionne entièrement sans IA.',
      },
      upcoming: [
        'Choix du fournisseur et du modèle',
        'Clé API conservée dans le gestionnaire d’identifiants de Windows',
        'Test de connexion sur demande uniquement',
        'Préférences de confidentialité',
      ],
    },
  },
  about: {
    version: 'Version',
    commit: 'Commit',
    buildProfile: 'Compilation',
    profileDebug: 'Développement',
    profileRelease: 'Production',
    platform: 'Plateforme',
    runtime: 'Tauri',
    buildTitle: 'Informations de build',
    unavailable:
      'Les informations de version ne sont disponibles que dans l’application de bureau.',
    creditsTitle: 'Crédits',
    creditsIntro: 'ARCHIVE s’appuie sur des logiciels et des polices libres.',
    documentationTitle: 'Documentation',
    documentationLink: 'Aide et raccourcis clavier',
  },
  help: {
    intro: 'Raccourcis clavier et informations utiles pour prendre ARCHIVE en main.',
    shortcutsTitle: 'Raccourcis clavier',
    shortcutsDescription:
      'Les raccourcis marqués «\u00a0Bientôt disponible\u00a0» s’activeront avec les modules correspondants.',
    guideTitle: 'Guide d’utilisation',
    guideDescription:
      'Le guide détaillé (import, notes, recherche, sauvegarde) sera intégré ici au fil des modules.',
    aboutTitle: 'À propos',
    aboutDescription: 'Version, informations de build et crédits.',
    aboutLink: 'Ouvrir «\u00a0À propos d’ARCHIVE\u00a0»',
  },
  keys: {
    ctrl: 'Ctrl',
    shift: 'Maj',
    alt: 'Alt',
    escape: 'Échap',
  },
  shortcuts: {
    tableCaption: 'Raccourcis clavier d’ARCHIVE',
    action: 'Action',
    keys: 'Raccourci',
    status: 'Disponibilité',
    openSearch: 'Recherche globale',
    newNote: 'Nouvelle note',
    importDocument: 'Importer un document',
    newWorkspace: 'Nouvel espace de travail',
    save: 'Enregistrer le contenu en cours',
    openSettings: 'Ouvrir les paramètres',
    closeOverlay: 'Fermer une fenêtre ou un menu',
  },
  errors: {
    boundaryTitle: 'Un problème est survenu dans l’interface',
    boundaryDescription: 'Vos données ne sont pas affectées. Rechargez l’interface pour continuer.',
    reload: 'Recharger l’interface',
    details: 'Détails techniques',
    loadTitle: 'Impossible d’afficher ces informations',
    notFoundTitle: 'Page introuvable',
    notFoundDescription: 'Cette page n’existe pas ou a été déplacée.',
    codes: {
      invalid_input: 'Certaines informations saisies ne sont pas valides.',
      not_found: 'Cet élément n’existe plus.',
      name_taken: 'Ce nom est déjà utilisé.',
      in_use: 'Cet élément est encore utilisé et ne peut pas être supprimé.',
      stale_revision: 'Ce contenu a été modifié entre-temps. Rechargez-le avant d’enregistrer.',
      duplicate_content: 'Un document identique existe déjà dans votre bibliothèque.',
      database_unavailable: 'La base de données est indisponible.',
      database_too_new: 'Votre base de données provient d’une version plus récente d’ARCHIVE.',
      migration_failed: 'La mise à jour de la base de données a échoué.',
      storage: 'Une opération sur les fichiers a échoué.',
      database: 'Une opération sur la base de données a échoué.',
      io: 'Un fichier ou un dossier est inaccessible.',
      internal: 'Une erreur inattendue s’est produite.',
      native_runtime_unavailable:
        'Cette fonction n’est disponible que dans l’application de bureau.',
      unknown: 'Une erreur inattendue s’est produite.',
    },
  },
  toasts: {
    region: 'Notifications',
    dismiss: 'Fermer la notification',
  },
  dev: {
    gallery: 'Galerie de composants',
  },
} as const;
