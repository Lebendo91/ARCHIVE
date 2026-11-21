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
    pillarsTitle: 'Ce qu’ARCHIVE réunira ici',
    pillars: {
      centralize: {
        title: 'Centraliser',
        description:
          'PDF, documents Word, notes, fichiers texte et données\u00a0: toutes vos sources dans un seul environnement.',
      },
      retrieve: {
        title: 'Retrouver',
        description:
          'Une recherche dans le contenu même de vos documents et de vos notes, sans avoir à vous souvenir du nom du fichier.',
      },
      connect: {
        title: 'Relier',
        description:
          'Des liens entre vos documents, vos notes et vos concepts, explorables dans un graphe de connaissances.',
      },
      understand: {
        title: 'Comprendre',
        description:
          'Un assistant IA facultatif, qui répond à partir des sources que vous choisissez, avec des citations vérifiables.',
      },
    },
    localFirst: {
      title: 'Vos données vous appartiennent',
      description:
        'ARCHIVE stocke tout sur cet appareil. Aucun compte, aucune synchronisation imposée, aucun envoi sans action de votre part.',
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
      title: 'Aucune activité pour l’instant',
      description:
        'La chronologie retracera vos imports, vos notes et vos espaces de travail, au fur et à mesure.',
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
    workspaces: {
      title: 'Aucun espace de travail pour l’instant',
      description:
        'Les espaces de travail organisent vos connaissances par contexte\u00a0: études, travail, recherche, projets personnels…',
      capabilities: [
        'Créer des espaces avec leur icône, leur couleur et leur description',
        'Y ranger documents, notes et dossiers',
        'Suivre l’activité récente de chaque espace',
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
      description:
        'Les éléments archivés quittent les vues principales sans être supprimés. Vous les retrouverez ici.',
      capabilities: [
        'Alléger vos vues sans rien perdre',
        'Restaurer un élément archivé à tout moment',
      ],
    },
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
