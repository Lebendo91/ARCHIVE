import type { Dictionary } from './types';

/** English dictionary. Its shape is checked against the French reference at compile time. */
export const en: Dictionary = {
  app: {
    name: 'ARCHIVE',
    designation: 'Your Second Brain',
    tagline: 'Everything you know. Nothing forgotten.',
  },
  common: {
    comingSoon: 'Coming soon',
    available: 'Available',
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    retry: 'Try again',
    loading: 'Loading…',
    backToOverview: 'Back to overview',
  },
  a11y: {
    skipToContent: 'Skip to main content',
    pageAnnouncement: 'Current page: {title}',
  },
  nav: {
    mainLabel: 'Main navigation',
    overview: 'Overview',
    library: 'Library',
    notes: 'Notes',
    graph: 'Knowledge Graph',
    timeline: 'Timeline',
    assistant: 'AI Assistant',
    workspacesSection: 'Workspaces',
    allWorkspaces: 'All workspaces',
    personalSection: 'Personal',
    favorites: 'Favorites',
    recent: 'Recently opened',
    archived: 'Archived items',
    settings: 'Settings',
    help: 'Help',
  },
  sidebar: {
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
  },
  topbar: {
    breadcrumb: 'Breadcrumb',
    search: 'Search ARCHIVE…',
    searchUnavailable: 'Global search will be available once you can add documents and notes.',
  },
  profile: {
    menuLabel: 'Profile menu',
    name: 'Local profile',
    hint: 'Data on this device',
    description: 'Your data stays on this device. No account is required.',
    settings: 'Settings',
    help: 'Help and shortcuts',
    about: 'About ARCHIVE',
  },
  dashboard: {
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    welcome: '{greeting}. Welcome to ARCHIVE.',
    subtitle: 'Your knowledge, organized in one place.',
    pillarsTitle: 'What ARCHIVE will bring together here',
    pillars: {
      centralize: {
        title: 'Centralize',
        description:
          'PDFs, Word documents, notes, text files and data: all your sources in one environment.',
      },
      retrieve: {
        title: 'Retrieve',
        description:
          'Search inside your documents and notes without having to remember any file name.',
      },
      connect: {
        title: 'Connect',
        description:
          'Links between your documents, notes and concepts, explorable in a knowledge graph.',
      },
      understand: {
        title: 'Understand',
        description:
          'An optional AI assistant that answers from the sources you choose, with verifiable citations.',
      },
    },
    localFirst: {
      title: 'Your data belongs to you',
      description:
        'ARCHIVE stores everything on this device. No account, no forced synchronization, nothing sent without your action.',
    },
  },
  modules: {
    capabilitiesTitle: 'What you will be able to do here',
    library: {
      title: 'No documents yet',
      description:
        'Documents you import will appear here, with their preview, extracted text and tags.',
      capabilities: [
        'Import PDF, Word, text, Markdown, CSV, JSON and image files',
        'Organize by workspace, folder and tag',
        'Preview each document and read its extracted text',
      ],
    },
    notes: {
      title: 'No notes yet',
      description: 'Your notes will appear here. The editor will save your work automatically.',
      capabilities: [
        'Write with headings, lists, tables, code and checklists',
        'Link notes to each other and to your documents',
        'Import and export Markdown',
      ],
    },
    graph: {
      title: 'No relationships yet',
      description:
        'The graph will show the links between your documents, notes and concepts as soon as they exist.',
      capabilities: [
        'Explore relationships on a two-dimensional map',
        'Filter by item and relationship type',
        'Accept or reject suggested relationships',
      ],
    },
    timeline: {
      title: 'No activity yet',
      description:
        'The timeline will trace your imports, notes and workspaces as they are created.',
      capabilities: [
        'Browse your activity day by day',
        'Filter by event type, workspace and period',
        'Clear the history whenever you want',
      ],
    },
    assistant: {
      title: 'No AI provider configured',
      description:
        'The assistant is optional. It will answer from the documents and notes you select, citing its sources.',
      capabilities: [
        'Use Anthropic, OpenAI or Google Gemini with your own key',
        'Choose exactly what is shared with the provider',
        'Verify every answer through its citations',
      ],
    },
    workspaces: {
      title: 'No workspaces yet',
      description:
        'Workspaces organize your knowledge by context: studies, work, research, personal projects…',
      capabilities: [
        'Create workspaces with their own icon, color and description',
        'Store documents, notes and folders in them',
        'Follow the recent activity of each workspace',
      ],
    },
    favorites: {
      title: 'No favorites',
      description: 'Documents and notes you mark as favorites will appear here.',
      capabilities: [
        'Reach your essential resources in one click',
        'Find your favorites from the overview',
      ],
    },
    recent: {
      title: 'Nothing opened recently',
      description: 'Documents and notes you open will appear here, most recent first.',
      capabilities: [
        'Pick up your work where you left it',
        'Find a resource you viewed without searching for it',
      ],
    },
    archived: {
      title: 'No archived items',
      description:
        'Archived items leave the main views without being deleted. You will find them here.',
      capabilities: [
        'Lighten your views without losing anything',
        'Restore an archived item at any time',
      ],
    },
  },
  settings: {
    sectionsLabel: 'Settings sections',
    sections: {
      general: 'General',
      appearance: 'Appearance',
      storage: 'Storage',
      ai: 'Artificial intelligence',
      shortcuts: 'Keyboard shortcuts',
      about: 'About',
    },
    currentTitle: 'Current configuration',
    upcomingTitle: 'Upcoming settings',
    general: {
      description: 'General application preferences.',
      current: {
        language: 'Interface language',
        languageValue: 'English',
      },
      upcoming: [
        'Interface language',
        'Startup behavior',
        'Default workspace',
        'Notification preferences',
      ],
    },
    appearance: {
      description: 'Theme and visual comfort.',
      current: {
        theme: 'Theme',
        themeValue: 'Obsidian (dark)',
        motion: 'Animations',
        motionValue: 'Reduced automatically when the system asks for it',
      },
      upcoming: ['Light and system themes', 'Limited accent customization'],
    },
    storage: {
      description: 'Location and protection of your local data.',
      upcoming: [
        'Data, file and backup folders',
        'Space used by ARCHIVE',
        'Opening folders in File Explorer',
        'Backup, restore and export',
      ],
    },
    ai: {
      description: 'Optional artificial intelligence provider.',
      current: {
        provider: 'Provider',
        providerValue: 'None. ARCHIVE works entirely without AI.',
      },
      upcoming: [
        'Provider and model selection',
        'API key kept in the Windows Credential Manager',
        'Connection test on request only',
        'Privacy preferences',
      ],
    },
  },
  about: {
    version: 'Version',
    commit: 'Commit',
    buildProfile: 'Build',
    profileDebug: 'Development',
    profileRelease: 'Production',
    platform: 'Platform',
    runtime: 'Tauri',
    buildTitle: 'Build information',
    unavailable: 'Version information is only available in the desktop application.',
    creditsTitle: 'Credits',
    creditsIntro: 'ARCHIVE is built on open-source software and typefaces.',
    documentationTitle: 'Documentation',
    documentationLink: 'Help and keyboard shortcuts',
  },
  help: {
    intro: 'Keyboard shortcuts and useful information to get started with ARCHIVE.',
    shortcutsTitle: 'Keyboard shortcuts',
    shortcutsDescription:
      'Shortcuts marked “Coming soon” will become active with their corresponding modules.',
    guideTitle: 'User guide',
    guideDescription:
      'The detailed guide (import, notes, search, backup) will be added here as modules are delivered.',
    aboutTitle: 'About',
    aboutDescription: 'Version, build information and credits.',
    aboutLink: 'Open “About ARCHIVE”',
  },
  keys: {
    ctrl: 'Ctrl',
    shift: 'Shift',
    alt: 'Alt',
    escape: 'Esc',
  },
  shortcuts: {
    tableCaption: 'ARCHIVE keyboard shortcuts',
    action: 'Action',
    keys: 'Shortcut',
    status: 'Availability',
    openSearch: 'Global search',
    newNote: 'New note',
    importDocument: 'Import a document',
    newWorkspace: 'New workspace',
    save: 'Save current content',
    openSettings: 'Open settings',
    closeOverlay: 'Close a dialog or menu',
  },
  errors: {
    boundaryTitle: 'Something went wrong in the interface',
    boundaryDescription: 'Your data is not affected. Reload the interface to continue.',
    reload: 'Reload the interface',
    details: 'Technical details',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'This page does not exist or has been moved.',
  },
  toasts: {
    region: 'Notifications',
    dismiss: 'Dismiss notification',
  },
  dev: {
    gallery: 'Component gallery',
  },
};
