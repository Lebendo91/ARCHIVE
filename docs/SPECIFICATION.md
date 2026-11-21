<!--
  Cahier des charges maître d'ARCHIVE, fourni par le porteur du projet le 2026-11-21.
  Document de référence conservé à l'identique. Toute évolution du périmètre doit être
  décidée explicitement par le porteur du projet et tracée dans DEVELOPMENT_PROGRESS.md.
-->

# ARCHIVE
# MASTER PRODUCT, BRAND IDENTITY & ENGINEERING SPECIFICATION

**Version : 1.0 — Master Development Brief**  
**Product codename : ARCHIVE**  
**Product category : Personal Knowledge Management System / Second Brain**  
**Target platform : Windows Desktop**  
**Development environment : Claude Code**  
**Primary language : French, with architecture ready for internationalization**  
**Development methodology : Strict sequential implementation**

---

# 00 — YOUR ROLE AND RESPONSIBILITIES

You are not acting as a simple code generator.

You are the complete multidisciplinary product team responsible for designing, architecting, developing, testing and delivering ARCHIVE.

You must simultaneously operate as:

- A Senior Product Designer.
- A Senior UI/UX Designer.
- A Brand Identity Designer.
- A Senior Software Architect.
- A Senior React and TypeScript Engineer.
- A Desktop Application Engineer.
- A Database Architect.
- A Security Engineer.
- A Quality Assurance Engineer.
- A Performance Optimization Engineer.

Your mission is to transform the following specification into a real, functional, polished and reliable desktop application.

You must think like a professional software company developing a commercial product.

Do not produce a superficial prototype.

Do not build a static mockup.

Do not create buttons that do nothing.

Do not simulate functionality that has not actually been implemented.

Do not replace functional features with decorative UI elements.

Every feature must have a clearly defined purpose, implementation and validation criteria.

**Your priority is quality, consistency, maintainability and functionality — not simply the number of features.**

---

# 01 — PRODUCT VISION

## 1.1 Product name

ARCHIVE

Official product designation:

**ARCHIVE — Your Second Brain.**

Product tagline:

**Everything you know. Nothing forgotten.**

Brand promise:

ARCHIVE transforms scattered information into a structured, searchable, interconnected and intelligent personal knowledge system.

It is designed to become the user's external memory.

## 1.2 The problem

Modern users accumulate information across many different locations:

- PDF documents.
- Word documents.
- Personal notes.
- Academic courses.
- Technical documentation.
- Research papers.
- Code snippets.
- Project files.
- Web resources.
- Personal ideas.
- Business documents.
- Meeting notes.
- Technical specifications.

The problem is not simply storing this information.

The real problem is finding, understanding, connecting and reusing it.

Traditional file managers organize files by location.

Traditional note-taking applications organize information by pages.

ARCHIVE must go further.

It must organize information according to its content, meaning, relationships and context.

## 1.3 Product philosophy

ARCHIVE follows five fundamental principles.

**1. Centralization**

All important knowledge must be accessible from one unified environment.

**2. Organization**

The user must be able to structure information according to their own logic.

**3. Intelligence**

The system must help identify concepts, relationships and relevant information.

**4. Accessibility**

Information must be easy to retrieve, even when the user does not remember its exact name or location.

**5. Ownership**

The user's information belongs to the user.

Local storage must be the default. Cloud services must never be mandatory.

## 1.4 Target users

ARCHIVE is designed for:

- Students.
- Engineers.
- Developers.
- Researchers.
- Entrepreneurs.
- Professionals.
- People managing large amounts of information.
- Users who want a structured personal knowledge base.

The interface must remain understandable for beginners while offering advanced functionality for experienced users.

---

# 02 — BRAND IDENTITY

The brand must have a strong and recognizable identity.

Do not create a generic productivity application.

Do not use generic AI dashboard aesthetics.

ARCHIVE must look like a mature, premium, professional knowledge-management product.

## 2.1 Brand personality

The brand should communicate:

- Intelligence.
- Precision.
- Reliability.
- Clarity.
- Structure.
- Discretion.
- Technological sophistication.
- Professionalism.

ARCHIVE should feel calm and powerful rather than futuristic and aggressive.

## 2.2 Visual direction

Official art direction:

**OBSIDIAN KNOWLEDGE SYSTEMS**

Keywords:

- Editorial minimalism.
- Precision engineering.
- Dark professional software.
- Architectural layouts.
- Refined typography.
- Structured information.
- Restrained visual hierarchy.
- Subtle technical details.

Visual references for inspiration:

- Linear for interface discipline.
- Notion for content organization.
- Obsidian for interconnected knowledge.
- Raycast for interaction quality.
- Apple for visual consistency and restraint.

These are references for design quality, not templates to copy.

Do not reproduce their interfaces.

## 2.3 Official color palette

The following colors are mandatory design tokens.

### Primary surfaces

| Token | Hexadecimal | Purpose |
|---|---|---|
| Obsidian | #090B0F | Main application background |
| Carbon | #10141A | Sidebar and secondary surfaces |
| Graphite | #171D25 | Cards and panels |
| Steel | #222B36 | Hover and elevated surfaces |
| Border | #2A3441 | Dividers and borders |
| Border subtle | #202833 | Subtle separation |

### Typography colors

| Token | Hexadecimal | Purpose |
|---|---|---|
| Primary text | #F1F4F8 | Main content |
| Secondary text | #A3ADBA | Secondary information |
| Muted text | #6F7B89 | Metadata and placeholders |
| Disabled text | #4D5865 | Disabled elements |

### Brand accents

| Token | Hexadecimal | Purpose |
|---|---|---|
| Archive Amber | #D6A45D | Primary brand accent |
| Electric Blue | #67A9E8 | Interactive elements |
| Soft Cyan | #6FCBC7 | Intelligence features |
| Purple | #A995E8 | Knowledge relationships |

### Semantic colors

| Token | Hexadecimal | Purpose |
|---|---|---|
| Success | #43B989 | Successful operations |
| Warning | #E8B45B | Warnings |
| Danger | #E46C72 | Errors |
| Information | #67A9E8 | Informational states |

### Color usage rules

- Obsidian is the dominant background.
- Carbon structures the main navigation.
- Graphite separates content areas.
- Archive Amber is the main brand accent.
- Electric Blue identifies interactive controls.
- Soft Cyan is reserved for intelligence-related features.
- Semantic colors must only communicate meaningful states.

Do not use gradients everywhere.

Do not use excessive glow effects.

Do not use neon borders.

Do not use glassmorphism as the default visual language.

Do not make the application look like a gaming interface.

## 2.4 Typography

Use a carefully selected typographic system.

### Primary typeface

**Inter**

Use for:
- General interface.
- Body text.
- Buttons.
- Navigation.
- Form labels.
- Document metadata.

### Display typeface

**Space Grotesk**

Use for:
- Main page titles.
- Brand identity.
- Important headings.
- Dashboard statistics.

### Monospace typeface

**JetBrains Mono**

Use for:
- Technical identifiers.
- File paths.
- Code snippets.
- Technical metadata.
- Debug information.

Use local font files when possible.

Provide appropriate fallbacks.

Avoid loading unnecessary external font resources at runtime.

## 2.5 Logo and visual identity

Create an original ARCHIVE logo.

Concept:

A geometric symbol representing a structured collection of knowledge.

Possible visual direction:

- A series of precisely aligned layers.
- A modular archive structure.
- A simplified combination of a document and a connected node.
- A distinctive abstract geometric mark.

The logo must work:

- In the application sidebar.
- In the Windows application icon.
- On loading screens.
- In documentation.
- On the product website if one is created later.

Create a clean SVG logo.

Do not use emojis as logos.

Do not use generic AI brain symbols.

Do not use stock icons as the primary brand mark.

The wordmark must display:

ARCHIVE

The tagline may appear in onboarding and the About section.

## 2.6 Iconography

Use Lucide icons consistently.

All icons must have:

- Consistent stroke width.
- Consistent visual weight.
- Consistent dimensions.
- Clear meaning.

Default icon sizes:

- 14 px: compact metadata.
- 16 px: standard controls.
- 18 px: navigation.
- 20 px: primary actions.
- 24 px: empty states and feature illustrations.

Never mix random icon libraries.

Never use emojis in the main interface.

---

# 03 — DESIGN SYSTEM AND INTERFACE SPECIFICATIONS

The interface must be designed as a coherent desktop application.

## 3.1 Reference viewport

Primary design reference:

1440 × 900 px.

Secondary validation viewport:

1280 × 800 px.

The application must adapt to smaller window sizes without breaking.

Minimum supported application window:

1100 × 700 px.

If the window becomes smaller, use controlled scrolling and responsive panel behavior.

Do not allow content to overlap.

## 3.2 Global layout

Use the following initial reference dimensions.

| Element | Dimension |
|---|---:|
| Sidebar | 248 px |
| Top navigation bar | 64 px |
| Main content horizontal padding | 32 px |
| Main content vertical padding | 28 px |
| Standard card radius | 10 px |
| Main modal radius | 12 px |
| Button radius | 7 px |
| Input radius | 7 px |

These dimensions are design references, not rigid constraints when responsive behavior requires adjustments.

## 3.3 Sidebar structure

The sidebar must contain:

**Brand area**
- ARCHIVE logo.
- Product name.
- Collapse/expand control.

**Main navigation**
- Overview.
- Library.
- Notes.
- Knowledge Graph.
- Timeline.
- AI Assistant.

**Workspace section**
- All Workspaces.
- Individual workspace shortcuts.
- Create Workspace action.

**Personal section**
- Favorites.
- Recently Opened.
- Archived Items.

**Bottom section**
- Storage indicator.
- Settings.
- Help.
- User profile or local profile.

The sidebar must support:

- Active state.
- Hover state.
- Collapsed mode.
- Tooltips.
- Smooth transitions.
- Scrollable navigation when necessary.

## 3.4 Topbar

The topbar must contain:

- Current section title.
- Breadcrumb navigation when relevant.
- Global search entry point.
- Quick Create action.
- Notifications or operation status when useful.
- User menu.

Do not overcrowd the topbar.

## 3.5 Spacing system

Use a consistent 4 px spacing scale.

Allowed spacing values:

4, 8, 12, 16, 20, 24, 32, 40, 48 and 64 px.

Do not introduce arbitrary spacing values without a reason.

## 3.6 Motion and transitions

Use subtle motion only.

Recommended duration:

- Hover: 120–150 ms.
- Standard transitions: 150–200 ms.
- Modal appearance: 180–220 ms.
- Page transitions: 180–220 ms.

Use restrained easing curves.

Respect the operating system's reduced-motion preference.

Avoid animations that consume unnecessary CPU resources.

## 3.7 Component states

Every interactive component must define:

- Default.
- Hover.
- Focus.
- Active.
- Disabled.
- Loading.
- Error.
- Success, where relevant.

Use consistent component variants.

Do not create visually different versions of the same component without justification.

## 3.8 Accessibility

The application must provide:

- Keyboard navigation.
- Visible focus indicators.
- Appropriate contrast.
- Accessible labels.
- Semantic HTML.
- Screen-reader-friendly controls.
- Keyboard shortcuts.
- Reduced-motion support.

---

# 04 — PRODUCT ARCHITECTURE

ARCHIVE is a local-first desktop application.

The user must retain control of their information.

## 4.1 Main technology stack

Use the following stack unless an actual technical incompatibility is discovered.

### Desktop

- Tauri 2.
- Rust for native integration.
- Windows desktop target.

### Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Lucide React.

### Application state

Use Zustand when global state management is necessary.

Do not overcomplicate state management.

Use React local state for isolated component behavior.

### Database

- SQLite.
- Appropriate migrations.
- Indexed and optimized queries.
- Transactional operations.

### Search

- SQLite FTS5 for full-text search.
- Optional semantic search through embeddings.

### Rich text editor

- TipTap.
- Markdown support.
- Structured content blocks.

### Knowledge graph

- Cytoscape.js or another lightweight 2D graph library.

### Document processing

Choose lightweight and reliable parsers for:

- PDF.
- DOCX.
- TXT.
- Markdown.
- CSV.
- JSON.

Support other formats only after the core import pipeline is reliable.

### Testing

- Vitest.
- React Testing Library.
- Playwright where compatible with the chosen Tauri setup.
- Additional Rust tests for native functionality.

## 4.2 Performance constraints

This application must run comfortably on:

- Intel Core-class laptop processors.
- 16 GB RAM.
- Integrated Intel Iris Xe graphics.
- SSD storage.
- Windows 11.

Do not assume a dedicated GPU exists.

Do not require CUDA.

Do not require a local LLM.

Do not require a 3D engine.

Do not introduce heavyweight dependencies without a concrete reason.

Avoid unnecessary background processing.

Large document imports must be processed asynchronously.

Use pagination or virtualization for large lists.

Avoid loading entire document collections into memory.

Use lazy loading for large content.

Do not calculate expensive graph layouts on every render.

## 4.3 Local-first architecture

The local application must remain useful without an internet connection.

The following features must work offline:

- Navigation.
- Library browsing.
- Local document storage.
- Notes.
- Basic search.
- Tags.
- Workspaces.
- Favorites.
- Timeline.
- Local settings.
- Export and backup.

The following features may require internet access:

- External AI providers.
- Remote embeddings.
- Optional cloud synchronization.
- Online documentation.

If internet access is unavailable, the application must continue working.

Display clear status messages when a connected service is unavailable.

## 4.4 Separation of concerns

Use a modular architecture.

Suggested structure:

```text
archive/
│
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router/
│   │   └── providers/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── documents/
│   │   ├── notes/
│   │   └── feedback/
│   │
│   ├── modules/
│   │   ├── dashboard/
│   │   ├── library/
│   │   ├── notes/
│   │   ├── search/
│   │   ├── knowledge-graph/
│   │   ├── workspaces/
│   │   ├── timeline/
│   │   ├── assistant/
│   │   └── settings/
│   │
│   ├── services/
│   │   ├── documents/
│   │   ├── search/
│   │   ├── database/
│   │   ├── ai/
│   │   ├── backup/
│   │   └── indexing/
│   │
│   ├── stores/
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   └── styles/
│
├── src-tauri/
│   ├── src/
│   ├── capabilities/
│   └── tauri.conf.json
│
├── database/
│   └── migrations/
│
├── tests/
│
├── docs/
│
├── assets/
│
├── DEVELOPMENT_PROGRESS.md
├── ARCHITECTURE.md
├── CHANGELOG.md
└── README.md
```

This is a proposed structure.

Adjust it when technically justified, but preserve clear separation between modules.

Do not create unnecessary files just to make the architecture look sophisticated.

---

# 05 — DATABASE DESIGN

The database must be designed before implementing the features that depend on it.

Use SQLite with migrations.

Create a normalized and maintainable schema.

## 5.1 Core entities

### Documents

Suggested fields:

- id.
- title.
- original_filename.
- stored_filename.
- file_extension.
- mime_type.
- file_size.
- content_text.
- content_hash.
- workspace_id.
- folder_id.
- created_at.
- updated_at.
- imported_at.
- last_opened_at.
- indexing_status.
- metadata_json.
- is_favorite.
- is_archived.

### Notes

- id.
- title.
- content.
- content_format.
- workspace_id.
- folder_id.
- created_at.
- updated_at.
- last_opened_at.
- is_favorite.
- is_archived.

### Workspaces

- id.
- name.
- description.
- color.
- icon.
- created_at.
- updated_at.

### Folders

- id.
- name.
- parent_id.
- workspace_id.
- created_at.
- updated_at.

### Tags

- id.
- name.
- color.
- created_at.

### Document tags

- document_id.
- tag_id.

### Note tags

- note_id.
- tag_id.

### Knowledge relations

- id.
- source_type.
- source_id.
- target_type.
- target_id.
- relation_type.
- confidence.
- created_at.

### Timeline events

- id.
- event_type.
- entity_type.
- entity_id.
- description.
- created_at.
- metadata_json.

### AI settings

Store provider configuration references and non-secret preferences.

Do not store API secrets in ordinary database fields.

### Application settings

- id.
- setting_key.
- setting_value.
- updated_at.

## 5.2 Database requirements

- Foreign keys must be enabled.
- Use transactions for related operations.
- Use appropriate indexes.
- Add migration version tracking.
- Handle migration failures safely.
- Avoid duplicate document imports when content hashes match.
- Support database integrity checks.
- Define deletion behavior carefully.
- Never silently delete user data.

## 5.3 File storage

The original documents must remain accessible.

Use an application-managed storage directory.

Organize imported files by stable internal identifiers rather than relying only on original filenames.

The database must reference the actual stored files.

Keep original filenames as metadata.

Provide a clear option to reveal a document in Windows Explorer.

Do not move or modify the user's original source file without explicit permission.

---

# 06 — MODULE 01: DASHBOARD / OVERVIEW

The dashboard is the main entry point.

It must provide an immediate overview of the user's knowledge system.

## 6.1 Dashboard structure

Header:

**Good morning. Welcome to ARCHIVE.**

Use a contextual greeting based on local time.

Subtitle:

"Your knowledge, organized in one place."

Main sections:

### Quick actions

- Import Document.
- Create Note.
- Create Workspace.
- Open AI Assistant.

### Statistics

Display:

- Total documents.
- Total notes.
- Number of workspaces.
- Storage used.
- Recently indexed items.

These values must come from real database queries.

Do not hardcode statistics.

### Recent activity

Display the latest:

- Imported documents.
- Modified notes.
- Opened resources.
- Created workspaces.

### Recently opened

Show a compact list of recently accessed resources.

### Favorites

Show frequently used or manually favorited content.

### Storage overview

Display:

- Used storage.
- Number of stored files.
- Estimated available application storage where possible.

Do not invent disk capacity information.

## 6.2 Empty state

A new installation must have a polished onboarding experience.

If no documents exist:

- Explain what ARCHIVE does.
- Provide a primary Import Document action.
- Provide a secondary Create Note action.
- Show a small example of an organized knowledge base.

Do not populate the database with fake user documents.

Use clearly identified demo content only if the user explicitly activates a demonstration mode.

---

# 07 — MODULE 02: LIBRARY

The Library is the central document-management module.

It must be fully functional.

## 7.1 Supported formats

Initial supported formats:

- PDF.
- DOCX.
- TXT.
- MD.
- CSV.
- JSON.

Additional image support may include:

- PNG.
- JPG.
- JPEG.
- WEBP.

Images can be stored and previewed.

OCR must be treated as a separate optional capability. Do not claim to extract text from images unless an OCR engine has actually been integrated.

## 7.2 Import system

Implement:

- File picker.
- Drag and drop.
- Multi-file import.
- Import progress.
- File validation.
- Duplicate detection.
- Import error reporting.
- Retry for failed operations.
- Import cancellation where technically possible.

For each imported file:

1. Validate the file.
2. Identify its type.
3. Read metadata.
4. Generate a stable internal identifier.
5. Calculate a content hash when appropriate.
6. Copy it into managed storage.
7. Extract text when supported.
8. Save metadata in SQLite.
9. Add the document to the indexing queue.
10. Record a timeline event.

The original file must not be deleted or modified.

## 7.3 Library interface

Provide:

- List view.
- Grid view.
- Search.
- Filters.
- Sorting.
- Folder navigation.
- Tags.
- Favorites.
- Archive state.
- Context menu.

Available filters:

- File type.
- Workspace.
- Folder.
- Tag.
- Import date.
- Modification date.
- Favorites.
- Indexing status.

Sorting:

- Name.
- Date added.
- Last modified.
- File size.
- Last opened.

## 7.4 Document preview

When opening a document:

- Display its title.
- Display file metadata.
- Display its original format.
- Display the document preview when supported.
- Provide access to extracted text.
- Provide tag management.
- Provide workspace assignment.
- Provide related resources.
- Provide an option to open the original file externally.

For PDF files, use PDF.js or an equivalent lightweight viewer.

Provide page navigation and zoom.

For formats without an integrated preview, display a clear fallback interface.

## 7.5 Document operations

Implement:

- Rename display title.
- Add tags.
- Change workspace.
- Move between folders.
- Favorite.
- Archive.
- Restore.
- Export.
- Reveal in Explorer.
- Delete with confirmation.

Deleting a document must have explicit and understandable behavior.

Distinguish between removing a database entry and deleting its managed file.

Never silently remove the original file from the user's computer.

---

# 08 — MODULE 03: NOTES

Notes are one of the most important modules.

The editing experience must be excellent.

## 8.1 Editor

Use TipTap or a suitable rich-text editor.

Support:

- Paragraphs.
- Headings H1, H2 and H3.
- Bold.
- Italic.
- Underline.
- Strikethrough.
- Bullet lists.
- Numbered lists.
- Checklists.
- Blockquotes.
- Code blocks.
- Inline code.
- Links.
- Tables.
- Horizontal dividers.

Use a restrained formatting toolbar.

The editor must not look like an overloaded word processor.

## 8.2 Note management

Users must be able to:

- Create notes.
- Edit notes.
- Rename notes.
- Duplicate notes.
- Delete notes.
- Archive notes.
- Favorite notes.
- Move notes.
- Assign tags.
- Assign workspaces.
- Link notes to documents.

## 8.3 Automatic saving

Implement robust automatic saving.

Requirements:

- Debounced saving.
- Visible save status.
- Saved indicator.
- Unsaved changes indicator.
- Recovery after application restart where possible.
- Conflict-safe updates.

Do not display "Saved" before the database operation succeeds.

## 8.4 Note linking

Allow internal links between notes.

Example:

A note about electrical circuits can link to another note about Kirchhoff's laws.

When a linked note is clicked, open it directly.

Display backlinks.

## 8.5 Markdown

Support Markdown import and export.

Preserve content structure when converting.

Avoid losing formatting during export.

---

# 09 — MODULE 04: INTELLIGENT SEARCH

Search is a core differentiator of ARCHIVE.

The user must be able to retrieve information without remembering the exact filename.

## 9.1 Global search

Provide a global search interface accessible from the topbar.

Keyboard shortcut:

Ctrl + K.

Search across:

- Document titles.
- Extracted document content.
- Note titles.
- Note content.
- Tags.
- Workspace names.
- Relevant metadata.

## 9.2 Full-text search

Implement SQLite FTS5.

Features:

- Text matching.
- Partial matching where appropriate.
- Search result ranking.
- Highlighted matching excerpts.
- Filters.
- Search history.
- Recent queries.

Do not implement a fake search interface.

Search must query real indexed content.

## 9.3 Search result design

Each result should display:

- Title.
- Type.
- Workspace.
- Relevant excerpt.
- Matching terms.
- Date.
- Location or source reference.

Clicking a result must open the correct resource.

## 9.4 Semantic search

Implement semantic search as an optional enhancement.

The system may use embeddings generated through an external provider.

Do not make semantic search mandatory.

If embeddings are unavailable:

- Continue using full-text search.
- Display an understandable explanation.
- Do not break the search experience.

## 9.5 Search examples

The user should be able to search:

- "Documents about Arduino interrupts."
- "Notes concerning industrial automation."
- "Everything related to the NE555."
- "Documents imported last week."
- "My notes about electrical safety."

Natural-language search must not pretend to understand meaning unless the underlying semantic or AI capability is actually available.

---

# 10 — MODULE 05: MEMORY ENGINE

This module is the intellectual core of ARCHIVE.

Its purpose is to transform stored content into structured knowledge.

## 10.1 Processing pipeline

Create a modular pipeline:

**Import → Extraction → Normalization → Indexing → Analysis → Relationships**

Each stage must have its own status.

Suggested statuses:

- Pending.
- Processing.
- Completed.
- Failed.
- Needs attention.

## 10.2 Metadata extraction

Extract useful metadata when available:

- Document title.
- Author.
- Creation date.
- Modification date.
- File type.
- Page count.
- Language.
- Content length.

Do not fabricate metadata.

If a field is unavailable, leave it empty or mark it as unknown.

## 10.3 Concept extraction

Use a provider-independent interface to extract concepts when an AI provider is configured.

Potential concepts:

- Technical terms.
- People.
- Organizations.
- Technologies.
- Subjects.
- Methods.
- Products.
- Projects.

Store the extraction results separately from the original document content.

Preserve the source reference for each extracted concept whenever possible.

## 10.4 Relationship detection

Identify potential relationships between resources.

Examples:

- Two documents discuss the same subject.
- A note references a document.
- A document contains a concept also present in another note.
- Two resources belong to the same workspace.

Distinguish:

- Explicit user-created relationships.
- Automatically detected relationships.
- AI-suggested relationships.

Never present uncertain AI-generated relationships as verified facts.

Provide confidence or provenance information where relevant.

## 10.5 User control

The user must be able to:

- Accept a suggested relationship.
- Reject a suggested relationship.
- Edit a relationship.
- Remove a relationship.
- Create a manual relationship.

The user remains in control of the knowledge graph.

---

# 11 — MODULE 06: KNOWLEDGE GRAPH

Create a two-dimensional interactive knowledge graph.

This module must remain lightweight.

Do not introduce WebGL or a complex 3D engine.

## 11.1 Graph entities

Nodes may represent:

- Documents.
- Notes.
- Concepts.
- Workspaces.
- Tags.

Edges may represent:

- References.
- Shared concepts.
- Manual links.
- Related resources.
- Workspace relationships.

## 11.2 Interface

Provide:

- Zoom.
- Pan.
- Node selection.
- Node details.
- Search within graph.
- Filtering.
- Relationship type filtering.
- Navigation to the selected resource.

## 11.3 Performance

Do not render thousands of complex nodes simultaneously.

Implement:

- Node limits or progressive loading.
- Efficient graph updates.
- Controlled layouts.
- Filtering before rendering.
- Lazy loading of details.

The graph must remain usable on an integrated graphics laptop.

## 11.4 Empty graph

If there are insufficient relationships:

Display a useful empty state explaining how relationships are created.

Do not display an invented graph.

---

# 12 — MODULE 07: WORKSPACES

Workspaces organize knowledge by context.

Examples:

- Studies.
- Engineering.
- Work.
- Entrepreneurship.
- Personal.
- Research.
- Programming.

## 12.1 Workspace management

Implement:

- Create.
- Rename.
- Delete.
- Archive.
- Change icon.
- Change accent color.
- Set description.
- Manage folders.
- Assign documents.
- Assign notes.

## 12.2 Workspace dashboard

Each workspace should have:

- Name.
- Description.
- Resource count.
- Recent activity.
- Favorite resources.
- Related notes.
- Quick actions.

## 12.3 Isolation and ownership

Deleting a workspace must not silently delete all its resources.

Before deleting:

- Explain what will happen.
- Offer a safe option to move resources to another workspace.
- Require explicit confirmation.

---

# 13 — MODULE 08: TIMELINE

The Timeline is the chronological history of the user's knowledge activity.

## 13.1 Events

Track meaningful operations:

- Document imported.
- Note created.
- Note modified.
- Resource favorited.
- Workspace created.
- Relationship accepted.
- Resource archived.
- Resource restored.

## 13.2 Timeline interface

Display:

- Date grouping.
- Event type.
- Resource title.
- Relevant metadata.
- Navigation to the resource.

Provide filters by:

- Event type.
- Workspace.
- Date range.
- Resource type.

Do not track unnecessary personal activity.

The user must be able to clear timeline history through an explicit action.

---

# 14 — MODULE 09: AI ASSISTANT

The AI Assistant must help users exploit their own knowledge base.

It must not become a generic chatbot disconnected from ARCHIVE.

## 14.1 AI philosophy

AI is optional.

The application must remain functional without an AI provider.

Never force the user to configure an API key during initial setup.

## 14.2 Provider architecture

Create a provider-independent service layer.

Potential providers:

- Anthropic.
- OpenAI.
- Google Gemini.

The application must be able to switch providers without rewriting the assistant module.

Define a common interface for:

- Sending prompts.
- Receiving responses.
- Streaming where supported.
- Handling errors.
- Managing usage metadata.
- Handling provider configuration.

Do not hardcode provider-specific logic throughout the application.

## 14.3 API security

API keys must never be:

- Committed to Git.
- Embedded in frontend source code.
- Exposed in browser logs.
- Stored in plain text in SQLite.

Use the operating system credential store through a secure native integration where possible.

If secure storage is unavailable, explain the limitation and provide a safer alternative.

Never log secrets.

## 14.4 Knowledge-grounded responses

The assistant must be able to answer questions about selected documents and notes.

Example:

"Explain the difference between a monostable and an astable NE555 circuit using my course materials."

Processing:

1. Identify relevant documents.
2. Retrieve relevant passages.
3. Build a context package.
4. Send only the necessary information to the configured provider.
5. Generate a response.
6. Attach references to the original sources.
7. Allow the user to open the source.

## 14.5 Citations and traceability

When the assistant uses document content:

- Display the source document.
- Display page number when available.
- Display the relevant excerpt.
- Make the citation clickable.

Never fabricate a source citation.

If the assistant cannot find supporting material, it must say so.

Clearly distinguish between:

- Information retrieved from ARCHIVE.
- General model knowledge.
- AI-generated interpretation.

## 14.6 Assistant interface

Provide:

- Conversation history.
- New conversation.
- Context selection.
- Document selection.
- Workspace selection.
- Response streaming where supported.
- Copy response.
- Regenerate response.
- Clear conversation.
- Source references.

Do not send all user documents to an AI provider automatically.

The user must control what is shared.

## 14.7 AI tools

Potential future capabilities:

- Summarize selected documents.
- Generate study notes.
- Create flashcards.
- Compare documents.
- Extract key concepts.
- Generate revision questions.
- Explain technical concepts.
- Build a project summary.

Implement these only after the basic assistant is reliable.

---

# 15 — MODULE 10: SYSTEM AND SETTINGS

Create a complete settings section.

## 15.1 General

- Application language.
- Theme.
- Startup behavior.
- Default workspace.
- Keyboard shortcuts.
- Notification preferences.

## 15.2 Appearance

Initial theme:

Dark Obsidian.

Future themes may include:

- Light.
- Dark.
- System.

Allow limited customization without breaking brand consistency.

## 15.3 Storage

Display:

- Application data directory.
- Managed file directory.
- Database location.
- Storage usage.
- Backup location.
- Last backup date.

Provide clear actions to open the corresponding folders.

## 15.4 AI configuration

Allow:

- Provider selection.
- API key configuration.
- Model selection.
- Connection test.
- Default assistant settings.
- Privacy preferences.

Never test an API key without explicit user action.

## 15.5 About

Display:

- ARCHIVE logo.
- Product name.
- Version.
- Build information.
- Credits.
- Documentation access.

---

# 16 — BACKUP, RESTORE AND DATA PORTABILITY

Data protection is a fundamental product requirement.

## 16.1 Backup

Implement a backup system.

A backup must include:

- SQLite database.
- Managed document files.
- Notes.
- Workspace data.
- Relationships.
- Application metadata required for restoration.

Do not include API secrets in backups by default.

## 16.2 Backup interface

Allow the user to:

- Create a backup.
- Choose a destination.
- View backup history.
- Verify backup integrity.
- Restore a backup.
- Export selected data.

## 16.3 Restore

Before restoring:

- Validate the backup.
- Display its creation date.
- Display its contents.
- Explain that current data may be replaced or merged.
- Require confirmation.

Do not begin a destructive restore without confirmation.

## 16.4 Portability

Implement export formats where appropriate:

- Markdown.
- JSON.
- Original files.
- CSV metadata.

The user must never be locked into ARCHIVE.

---

# 17 — USER EXPERIENCE AND INTERACTION RULES

Every interaction must be considered.

## 17.1 Global principles

- No dead buttons.
- No fake loading states.
- No fake progress indicators.
- No meaningless animations.
- No silent failures.
- No destructive actions without confirmation.
- No unexpected navigation.
- No data loss during editing.

## 17.2 Feedback

Use consistent toast notifications for:

- Successful import.
- Successful save.
- Failed import.
- Deleted resource.
- Backup completion.
- AI connection errors.
- Search errors.

Use dialogs for important destructive operations.

## 17.3 Keyboard shortcuts

Implement:

| Shortcut | Action |
|---|---|
| Ctrl + K | Global search |
| Ctrl + N | New note |
| Ctrl + O | Import document |
| Ctrl + Shift + N | New workspace |
| Ctrl + S | Save current content |
| Ctrl + , | Settings |
| Esc | Close modal or overlay |

Avoid conflicting shortcuts.

Provide a shortcut reference page.

## 17.4 Empty states

Every module must have a designed empty state.

Examples:

- No documents yet.
- No notes yet.
- No search results.
- No relationships found.
- No timeline activity.
- No workspace created.
- No AI provider configured.

Each empty state must explain what the user can do next.

---

# 18 — SECURITY AND PRIVACY

Security is not optional.

## 18.1 Local data

Default behavior:

- Store user data locally.
- Do not upload documents automatically.
- Do not synchronize data automatically.
- Do not collect unnecessary telemetry.
- Do not transmit content without user action.

## 18.2 File security

Validate imported files.

Do not execute imported files.

Do not trust filenames or metadata.

Prevent path traversal.

Use safe file handling.

Limit file sizes where necessary.

Handle malformed documents without crashing the application.

## 18.3 Tauri security

Configure Tauri permissions carefully.

Use a minimal capability model.

Do not grant unrestricted filesystem access to the frontend.

Use explicit commands for file operations.

Validate all native command inputs.

Do not expose arbitrary shell execution.

## 18.4 Error handling

Provide centralized error handling.

Errors must:

- Be logged appropriately.
- Be understandable.
- Avoid exposing secrets.
- Avoid crashing the application.
- Preserve user data whenever possible.

---

# 19 — TESTING AND QUALITY ASSURANCE

Testing is mandatory.

Do not consider a feature complete simply because it appears on screen.

## 19.1 Unit tests

Test:

- Database services.
- Document metadata extraction.
- Search indexing.
- Search queries.
- Note saving.
- Tag operations.
- Workspace operations.
- Backup validation.
- Data transformations.

## 19.2 Integration tests

Test complete workflows:

- Import document → extract text → index → search.
- Create note → edit → save → reopen.
- Create workspace → assign resources → reopen.
- Create relationship → display in graph.
- Create backup → restore → verify data.
- Configure AI provider → connection test → assistant request.

## 19.3 UI tests

Validate:

- Navigation.
- Sidebar behavior.
- Modal behavior.
- Forms.
- Keyboard shortcuts.
- Search.
- Document preview.
- Responsive layout.

## 19.4 Performance tests

Test with realistic datasets:

- 100 documents.
- 500 documents.
- 1,000 documents.
- 1,000 notes.

Measure:

- Startup time.
- Search response time.
- Import performance.
- Memory consumption.
- UI responsiveness.

These are test datasets, not mandatory default content.

Do not sacrifice correctness for arbitrary performance targets.

---

# 20 — VISUAL QUALITY ASSURANCE

The visual result is extremely important.

ARCHIVE must look like a polished commercial application.

## 20.1 Required screenshots

Capture and inspect screenshots of:

- Dashboard.
- Library grid view.
- Library list view.
- Document preview.
- Notes editor.
- Global search.
- Knowledge Graph.
- Workspace page.
- Timeline.
- AI Assistant.
- Settings.

Test at:

- 1440 × 900.
- 1280 × 800.

## 20.2 Visual audit

For every screenshot, inspect:

- Alignment.
- Spacing.
- Typography.
- Contrast.
- Component consistency.
- Overflow.
- Empty states.
- Visual hierarchy.
- Sidebar behavior.
- Modal positioning.

Fix visual problems before moving to the next major phase.

## 20.3 Design restrictions

Never use:

- Random gradients.
- Excessive shadows.
- Neon effects.
- Generic AI illustrations.
- Emoji-based navigation.
- Inconsistent border radii.
- Random typography.
- Overloaded cards.
- Fake statistics.
- Decorative elements that reduce readability.

The interface must prioritize content.

---

# 21 — DEVELOPMENT ROADMAP

This is one of the most important sections.

You MUST develop ARCHIVE progressively.

Do not attempt to build all modules in a single execution.

Do not generate the entire application at once.

Do not skip phases.

Do not start a new phase while the current one remains incomplete.

Each phase must be implemented, tested, validated and documented.

## PHASE 0 — ENVIRONMENT AUDIT

Before writing application code:

1. Inspect the current working directory.
2. Identify the existing project structure.
3. Identify the installed runtime versions.
4. Check Node.js.
5. Check npm or the available package manager.
6. Check Rust and Cargo.
7. Check Tauri prerequisites.
8. Identify the operating system.
9. Check available disk space if relevant.
10. Identify existing dependencies.
11. Identify existing source files.
12. Identify potential compatibility problems.

Important:

If the environment has already been audited during this project, read the existing audit and DEVELOPMENT_PROGRESS.md.

Do not repeat unnecessary investigations.

Do not overwrite existing work.

Do not delete files without understanding their purpose.

Create:

- DEVELOPMENT_PROGRESS.md
- ARCHITECTURE.md
- CHANGELOG.md

At the end of Phase 0:

- Record the environment.
- Record technical constraints.
- Confirm the proposed stack.
- Identify blockers.
- Define the exact first implementation task.

Do not start all modules.

## PHASE 1 — FOUNDATION AND DESIGN SYSTEM

Implement:

- Project architecture.
- Tauri desktop shell.
- React application.
- TypeScript configuration.
- Routing.
- Global design tokens.
- Typography.
- Color system.
- Sidebar.
- Topbar.
- Main content layout.
- Reusable buttons.
- Inputs.
- Cards.
- Dialogs.
- Toast notifications.
- Loading states.
- Empty states.

Deliverable:

A visually polished and navigable application shell.

At this stage, do not implement all business features.

Validation:

- Application starts.
- Application builds.
- Navigation works.
- Sidebar works.
- Layout works at both reference resolutions.
- No major visual defects.
- No critical console errors.

## PHASE 2 — DATABASE AND LOCAL STORAGE

Implement:

- SQLite integration.
- Database initialization.
- Migrations.
- Core schemas.
- Repository layer.
- File storage service.
- Application settings storage.
- Error handling.

Deliverable:

A reliable local data foundation.

Validation:

- Create records.
- Read records.
- Update records.
- Delete records safely.
- Restart application.
- Verify persistence.
- Test migration behavior.

## PHASE 3 — DASHBOARD AND WORKSPACES

Implement:

- Dashboard.
- Workspace creation.
- Workspace editing.
- Workspace deletion safeguards.
- Workspace overview.
- Resource counters.
- Recent activity structure.

Deliverable:

A functional application home and workspace management system.

## PHASE 4 — LIBRARY

Implement:

- Document import.
- Multi-file import.
- Supported format detection.
- Metadata extraction.
- File storage.
- Document list.
- Grid view.
- Filters.
- Sorting.
- Favorites.
- Tags.
- Folder management.
- Document preview.

Deliverable:

A functional document-management system.

Validation:

Import real test files.

Verify extracted content.

Verify original files remain intact.

Verify duplicate handling.

## PHASE 5 — NOTES

Implement:

- TipTap editor.
- Rich-text formatting.
- Note creation.
- Note editing.
- Automatic saving.
- Note list.
- Tags.
- Workspaces.
- Favorites.
- Markdown import and export.
- Internal note links.
- Backlinks.

Deliverable:

A fully functional note-taking system.

## PHASE 6 — INTELLIGENT SEARCH

Implement:

- SQLite FTS5.
- Indexing pipeline.
- Search interface.
- Global Ctrl + K search.
- Filters.
- Result ranking.
- Excerpts.
- Highlighting.
- Search history.

Deliverable:

A genuinely useful full-text search engine.

Semantic search is not required to validate this phase.

## PHASE 7 — MEMORY ENGINE

Implement:

- Processing queue.
- Document analysis.
- Metadata normalization.
- Concept extraction interface.
- Relationship storage.
- Suggested relationships.
- Relationship validation.
- Provenance tracking.

AI-powered extraction may require a configured provider.

Provide a functional non-AI foundation.

## PHASE 8 — KNOWLEDGE GRAPH AND TIMELINE

Implement:

- Two-dimensional graph.
- Nodes.
- Edges.
- Filters.
- Selection.
- Navigation.
- Relationship details.
- Timeline event tracking.
- Timeline filters.

Deliverable:

A visual and navigable representation of the knowledge base.

## PHASE 9 — AI ASSISTANT

Implement:

- Provider abstraction.
- API configuration.
- Secure credential storage.
- Connection testing.
- Conversations.
- Context selection.
- Document retrieval.
- Source citations.
- Error handling.
- Streaming where supported.

Deliverable:

A functional knowledge-grounded AI assistant.

## PHASE 10 — BACKUP, SECURITY AND OPTIMIZATION

Implement:

- Backup.
- Restore.
- Export.
- Data validation.
- Security review.
- Performance improvements.
- Memory optimization.
- Error recovery.
- Final visual audit.
- Documentation.
- Windows packaging.

Deliverable:

A stable and distributable ARCHIVE application.

---

# 22 — STRICT PHASE EXECUTION PROTOCOL

THIS SECTION IS MANDATORY.

You must follow a sequential development workflow.

Rules:

1. Work on ONE phase at a time.
2. Never implement every module in one execution.
3. Never skip a phase.
4. Never begin the next phase before validating the current one.
5. Never consider a feature complete without testing it.
6. Fix errors discovered during the current phase.
7. Update DEVELOPMENT_PROGRESS.md continuously.
8. Preserve project continuity between sessions.
9. Avoid unnecessary rewrites of validated modules.
10. Do not replace working implementations with mockups.

At the end of each phase, update DEVELOPMENT_PROGRESS.md.

The file must contain:

- Current phase.
- Completed tasks.
- Incomplete tasks.
- Files created.
- Files modified.
- Technical decisions.
- Dependencies added.
- Tests executed.
- Test results.
- Known bugs.
- Remaining limitations.
- Exact next action.

Also update CHANGELOG.md with meaningful changes.

When a session starts:

1. Read DEVELOPMENT_PROGRESS.md.
2. Read ARCHITECTURE.md.
3. Inspect the relevant existing files.
4. Identify the current validated phase.
5. Continue from the exact next incomplete task.

Do not restart the project.

Do not regenerate files unnecessarily.

Do not assume previous work is correct without checking it.

### Important execution rule

Do not interpret this protocol as permission to stop after writing a plan.

You must actively implement the current phase.

When you finish a phase, report its actual status and validation results.

Do not claim that a test passed if it was not executed.

If blocked by an environment limitation, explain the blocker and implement the best safe alternative without pretending the feature works.

**Only proceed to the next phase after the current phase has been validated.**

---

# 23 — CODE QUALITY RULES

All code must be:

- Typed.
- Readable.
- Modular.
- Maintainable.
- Documented where necessary.
- Consistent with the architecture.

Avoid:

- Giant components.
- Excessive prop drilling.
- Duplicate business logic.
- Unnecessary dependencies.
- Uncontrolled global state.
- Hardcoded fake data.
- Silent exceptions.
- Unhandled asynchronous operations.
- Temporary hacks presented as final solutions.

Use strict TypeScript where practical.

Avoid using `any` unless genuinely necessary and documented.

Keep business logic outside presentation components.

Create reusable components when repetition justifies them.

Do not create unnecessary abstractions.

Prefer simple, robust solutions.

---

# 24 — DOCUMENTATION REQUIREMENTS

Maintain the following documentation:

## README.md

Must explain:

- What ARCHIVE is.
- Main features.
- Requirements.
- Installation.
- Development commands.
- Build commands.
- Project structure.

## ARCHITECTURE.md

Must explain:

- Frontend architecture.
- Native integration.
- Database architecture.
- File storage.
- Search indexing.
- AI provider layer.
- Security model.
- Module dependencies.

## DEVELOPMENT_PROGRESS.md

Must maintain development continuity.

## CHANGELOG.md

Must document meaningful changes.

## USER_GUIDE.md

Must eventually explain:

- Importing documents.
- Creating notes.
- Searching knowledge.
- Managing workspaces.
- Using the AI assistant.
- Backing up data.
- Restoring data.

---

# 25 — FINAL PRODUCT ACCEPTANCE CRITERIA

ARCHIVE is not considered complete merely because all pages exist.

The product must satisfy the following requirements.

### Design

- Consistent brand identity.
- Complete design system.
- Polished desktop interface.
- No major layout defects.
- Consistent navigation.
- Functional responsive behavior.

### Functionality

- Documents can be imported.
- Documents can be searched.
- Notes can be created and saved.
- Workspaces can be managed.
- Relationships can be created and explored.
- Timeline events are real.
- AI can use selected knowledge sources when configured.
- Backups can be created and restored.

### Reliability

- Data survives application restarts.
- Errors are handled.
- Destructive actions are protected.
- Database migrations work.
- Imported files remain intact.
- No critical data-loss bugs.

### Performance

- Application remains responsive.
- Search is efficient.
- Large lists are handled properly.
- Background processing does not freeze the interface.
- Memory consumption remains reasonable.

### Privacy

- Local-first behavior.
- No automatic document uploads.
- Explicit control over AI context.
- Secure API credential handling.
- No unnecessary telemetry.

### Delivery

- Windows application can be built.
- Installation process is documented.
- Development commands work.
- User documentation exists.

---

# 26 — FIRST EXECUTION INSTRUCTION

You are now responsible for beginning the development of ARCHIVE.

Do not start by implementing the Dashboard, Library, Notes or AI Assistant.

Start with **PHASE 0 — ENVIRONMENT AUDIT**.

Inspect the existing environment carefully.

Determine whether the current directory already contains an existing project.

If it does, preserve it and understand its architecture before making changes.

If it does not, prepare a clean project structure.

Then:

1. Perform the environment audit.
2. Document the findings.
3. Create DEVELOPMENT_PROGRESS.md.
4. Create ARCHITECTURE.md.
5. Create CHANGELOG.md.
6. Confirm the technical stack.
7. Identify any blockers.
8. Define the precise first implementation task.

Do not implement future phases prematurely.

At the end of Phase 0, provide a concise technical report containing:

- Environment findings.
- Existing project status.
- Confirmed technology stack.
- Compatibility issues.
- Files created or modified.
- Validation performed.
- Exact next action.

**Your goal is not to produce the fastest prototype. Your goal is to build ARCHIVE as a real, reliable and commercially credible software product.**
