# One List - Complete Application Documentation

A sophisticated cross-platform todo application built with **Next.js 16 + Electron + AI**.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    TodoApp (Orchestrator)               │
│   Manages state, coordinates views, handles AI input    │
└──────────────────────────┬──────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
 TodoTextEditor      TodoKanbanView        TodoInput
   (List View)        (Board View)        (AI + Voice)
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                     Zustand Store
                           │
              ┌────────────┴────────────┐
              │                         │
        Electron IPC              Web In-Memory
        (Desktop DB)               (Browser)
```

---

## Project Structure

```
one-list/
├── app/                          # Next.js App Router directory
│   ├── api/                      # API routes (server-side)
│   │   ├── process-todo-text/    # AI text processing for todos
│   │   ├── find-similar-tasks/   # Task deduplication/merge suggestions
│   │   ├── transcribe/           # Audio transcription via Whisper
│   │   ├── enrich-todos/         # Batch todo enrichment endpoint
│   │   ├── agent-prompts/        # Agent system prompts management
│   │   └── agent-config/         # OpenAI API key management
│   ├── page.tsx                  # Main entry point
│   ├── layout.tsx                # Root layout with theme provider
│   └── globals.css               # Global styles
├── components/                   # React components
│   ├── layout/                   # Application layout components
│   │   ├── main-layout.tsx       # Main layout wrapper
│   │   ├── main-sidebar.tsx      # Navigation sidebar
│   │   ├── sidebar.tsx           # Sidebar utilities
│   │   ├── theme-switcher.tsx    # Theme toggle component
│   │   ├── user-button.tsx       # User menu button
│   │   └── user-profile.tsx      # User profile display
│   ├── todo-app.tsx              # Main app container (orchestrator)
│   ├── todo-text-editor.tsx      # List view with drag-and-drop
│   ├── todo-kanban-view.tsx      # Kanban board view
│   ├── todo-input.tsx            # AI input and voice recording interface
│   ├── todo-sidebar.tsx          # Detail sidebar and category manager
│   ├── todo-list.tsx             # Standalone todo list component
│   ├── changelog-dialog.tsx      # AI-proposed changes review interface
│   ├── focus-mode-overlay.tsx    # Distraction-free focus timer UI
│   ├── draggable-item.tsx        # Drag handle wrapper
│   ├── sortable-item.tsx         # dnd-kit sortable wrapper
│   ├── theme-provider.tsx        # next-themes integration
│   ├── update-notifier.tsx       # Auto-update notifications (Electron)
│   ├── update-dialog.tsx         # Update notification dialog
│   └── ui/                       # Radix UI component library
│       ├── task-item.tsx         # Reusable todo renderer
│       ├── kanban.tsx            # Kanban column/card components
│       ├── collapsible-header.tsx # Group headers for grouping
│       ├── metadata-badges.tsx   # Priority/category badges
│       ├── avatar.tsx            # Avatar component
│       ├── sidebar.tsx           # Sidebar UI primitives
│       └── [20+ other UI components]
├── hooks/                        # Custom React hooks
│   ├── use-focus-manager.ts      # Unified focus/navigation for lists
│   ├── use-focus-timer.ts        # Focus timer state + Electron sync
│   ├── use-mobile.ts             # Responsive design detection
│   ├── use-sidebar.ts            # Sidebar state hook
│   └── use-main-sidebar-store.ts # Main sidebar collapse state (Zustand)
├── lib/                          # Core business logic
│   ├── store.ts                  # Zustand state management (main app state)
│   ├── types.ts                  # TypeScript type definitions
│   ├── grouping.ts               # Centralized grouping engine
│   ├── format.ts                 # Date formatting and categorization
│   ├── utils.ts                  # Utility functions (cn for Tailwind merge)
│   ├── electron-api.ts           # Type-safe Electron IPC interface
│   ├── api-bridge.ts             # Client-side API request wrapper
│   ├── find-similar-tasks.ts     # Semantic task deduplication
│   ├── ai/                       # AI processing (consolidated)
│   │   ├── index.ts              # Central export point
│   │   ├── defaults.ts           # Default AI configuration
│   │   ├── server.ts             # Server-side AI utilities
│   │   ├── process-todos.ts      # AI text-to-todo conversion
│   │   ├── process-batch-todos.ts # Batch processing for efficiency
│   │   ├── process-single-todo.ts # Single todo enhancement
│   │   ├── ai-queue-manager.ts   # Queue & batch system for AI calls
│   │   ├── agent-prompts.ts      # Agent prompts management
│   │   └── agent-config.ts       # Agent configuration management
│   ├── electron/
│   │   └── database.ts           # Database abstraction layer (Electron/web)
│   └── hooks/
│       └── use-debounced-callback.ts
├── types/                        # Additional TypeScript definitions
│   ├── electron.d.ts             # Electron API TypeScript definitions
│   ├── agent-prompts.ts          # Agent prompt configuration types
│   └── agent-config.ts           # Agent API configuration types
├── package.json                  # Project dependencies and build config
├── tsconfig.json                 # TypeScript configuration
├── next.config.mjs               # Next.js configuration
├── postcss.config.mjs            # Tailwind + PostCSS setup
├── components.json               # shadcn/ui configuration
└── README.md                     # Project documentation
```

---

## Key Files & Purposes

| File | Purpose |
|------|---------|
| `app/page.tsx` | Entry point - renders `<TodoApp />` |
| `components/todo-app.tsx` | Main orchestrator - loads data, manages views |
| `components/todo-text-editor.tsx` | List view with drag-drop, inline editing |
| `components/todo-kanban-view.tsx` | Kanban board with grouping strategies |
| `components/todo-input.tsx` | AI natural language input + voice recording |
| `components/todo-sidebar.tsx` | Detail panel for selected todo |
| `components/changelog-dialog.tsx` | Review AI-proposed changes before applying |
| `components/layout/main-layout.tsx` | Application layout wrapper |
| `components/layout/main-sidebar.tsx` | Navigation sidebar |
| `lib/store.ts` | **Zustand state management** - all app state |
| `lib/types.ts` | TypeScript definitions for Item, Todo, etc. |
| `lib/grouping.ts` | Centralized grouping engine |
| `lib/ai/index.ts` | Consolidated AI processing exports |
| `lib/electron/database.ts` | Database abstraction (Electron/Web) |
| `hooks/use-focus-manager.ts` | Keyboard navigation for lists |

---

## Design System

One List uses a centrally controlled semantic color system defined in `app/globals.css`. All colors use CSS custom properties with OKLCH color space for perceptual uniformity, supporting both light and dark modes.

### Color Palette

| Token | Usage | Light Mode | Dark Mode |
|-------|-------|------------|-----------|
| `--primary` | Brand/accent | Blue `oklch(0.62 0.23 250)` | Blue `oklch(0.62 0.23 250)` |
| `--destructive` | Error/danger | Red `oklch(0.577 0.245 27)` | Red `oklch(0.5 0.2 27)` |
| `--warning` | Warning/timeout | Orange `oklch(0.65 0.18 60)` | Orange `oklch(0.7 0.2 70)` |
| `--background` | Page background | Near white `oklch(0.98 0 0)` | Dark `oklch(0.12 0 0)` |
| `--foreground` | Primary text | Dark `oklch(0.15 0 0)` | Light `oklch(0.95 0 0)` |
| `--muted` | Muted backgrounds | Light gray `oklch(0.95 0 0)` | Dark gray `oklch(0.2 0 0)` |
| `--card` | Card backgrounds | White `oklch(1 0 0)` | Dark `oklch(0.16 0 0)` |

### Semantic Color Classes

**Text Colors:**
- `text-foreground` - Primary text
- `text-muted-foreground` - Secondary/disabled text
- `text-primary` - Brand/accent text
- `text-destructive` - Error/danger text
- `text-warning` - Warning text

**Background Colors:**
- `bg-background` - Page background
- `bg-card` - Card background
- `bg-primary` - Brand/accent background
- `bg-secondary` - Secondary background
- `bg-muted` - Muted/disabled background
- `bg-destructive` - Error/danger background

**Foreground Pairs:**
When using colored backgrounds, use corresponding foreground:
- `bg-primary` → `text-primary-foreground`
- `bg-secondary` → `text-secondary-foreground`
- `bg-destructive` → `text-destructive-foreground`
- `bg-warning` → `text-warning-foreground`

### Typography

| Token | Font |
|-------|------|
| `--font-sans` | Geist |
| `--font-mono` | Geist Mono |

### Spacing & Radius

| Token | Value |
|-------|-------|
| `--radius` | 0.75rem (12px) |
| `--radius-sm` | calc(var(--radius) - 4px) |
| `--radius-md` | calc(var(--radius) - 2px) |
| `--radius-lg` | var(--radius) |
| `--radius-xl` | calc(var(--radius) + 4px) |

### Sidebar-Specific Colors

Dedicated tokens for sidebar styling:
- `--sidebar` / `--sidebar-foreground`
- `--sidebar-primary` / `--sidebar-primary-foreground`
- `--sidebar-accent` / `--sidebar-accent-foreground`
- `--sidebar-border` / `--sidebar-ring`

### Component Variants

**Button variants:** `default`, `destructive`, `secondary`, `outline`, `ghost`

**Badge variants:** `default`, `destructive`, `secondary`, `outline`

### Design Guidelines

**DO use semantic colors:**
- `text-warning` for warning messages
- `bg-primary` for primary actions
- `text-destructive` for errors

**DON'T use hardcoded colors:**
- ~~`text-orange-500`~~
- ~~`bg-blue-600`~~
- ~~`#FF5733`~~

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | Next.js 16.0.7, React 19.2.0, TypeScript 5 |
| **State** | Zustand 5.0.9 with persistence |
| **UI** | Radix UI, shadcn/ui, Tailwind CSS 4.1.9 |
| **Drag & Drop** | @dnd-kit (core, sortable, utilities) |
| **AI** | Vercel AI SDK, OpenAI (gpt-4o-mini, Whisper) |
| **Desktop** | Electron 34, auto-updates |
| **Forms** | React Hook Form 7.60, Zod 3.25 validation |
| **Animation** | Motion 12.23 (framer-motion) |
| **Icons** | Lucide React 0.454, Phosphor Icons 2.1 |
| **Date** | date-fns 4.1, React Day Picker 9.8 |
| **Charts** | Recharts 2.15 |
| **Layout** | react-resizable-panels 2.1 |

---

## Data Model

### Core Item Type

The unified **Item** type is the single source of truth for all entities:

```typescript
interface Item {
  id: string
  type: "todo" | "separator"           // ItemType (title removed)
  position: number                      // Ordering
  parentId?: string                     // For sub-tasks/projects

  // Todo-specific
  title?: string
  details?: string
  completed?: boolean
  status?: "due" | "in-progress" | "done" | "archived"
  priority?: "low" | "medium" | "high"
  dueDate?: string                      // ISO format
  category?: string                     // Tag
  indent?: number                       // Nesting level
  isNow?: boolean                       // Focus group marker
  aiProcessingStatus?: "pending" | "processing" | "enhanced" | "failed"

  // Metadata
  createdAt: string
  updatedAt?: string
  completedAt?: string                  // When completed
}
```

### AI Processing Types

```typescript
interface ProposedChange {
  id: string
  type: "add" | "update" | "delete" | "merge" | "complete" | "uncomplete"
  newTodo?: Todo
  existingTodo?: Todo
  updates?: Partial<Todo>
  mergeGroup?: {
    sourceTodos: Todo[]
    mergedResult: Todo
    similarityReason: string
    confidenceScore: number
  }
  deleteTodo?: Todo
  reason?: string
}

interface ChangelogSession {
  id: string
  source: "ai-input" | "merge-button" | "manual"
  inputText?: string
  changes: ProposedChange[]
  createdAt: string
}
```

### Grouping Types

```typescript
type ListGroupBy = "dueDate" | "project"
type KanbanGroupBy = "dueDate" | "priority" | "category" | "project" | "status"
type ViewMode = "list" | "kanban"

interface ItemGroup {
  key: string
  label: string
  items: Item[]
  totalCount?: number
  metadata?: {
    color?: string
    isCollapsible?: boolean
    showEmpty?: boolean
    titleItem?: Item
  }
}
```

---

## API Routes

### `/api/process-todo-text`

**Purpose:** Parse natural language into structured todos

**Method:** POST

**Request Body:**
```typescript
{
  input: string           // User's text input
  existingTodos: Todo[]   // Current todos for context
}
```

**Response:**
```typescript
{
  newTodos: Todo[]        // New todos to create
  updates: Array<{        // Updates to existing todos
    id: string
    updates: Partial<Todo>
  }>
}
```

**Details:**
- Uses Vercel AI SDK + OpenAI gpt-4o-mini
- Max duration: 60 seconds
- Input truncation: 4000 characters max
- Extracts actionable items from meeting transcripts, conversations, notes
- Matches against existing todos semantically
- Detects completion (past tense → completed:true)

---

### `/api/find-similar-tasks`

**Purpose:** Find duplicate/similar tasks for merging

**Method:** POST

**Request Body:**
```typescript
{ todos: Todo[] }
```

**Response:**
```typescript
{
  groups: Array<{
    taskIds: string[]              // IDs of similar tasks
    primaryTaskId: string          // Most complete task
    similarityReason: string       // Why grouped
    confidenceScore: number        // 0-100
    suggestedMerge: {              // Merged result
      title: string
      details?: string
      priority?: Priority
      dueDate?: string
      category?: string
    }
  }>
}
```

**Details:**
- Uses gpt-4o-mini for semantic analysis
- Only groups tasks with confidence > 70%
- Combines all unique information from grouped tasks

---

### `/api/transcribe`

**Purpose:** Convert audio to text

**Method:** POST (multipart/form-data)

**Request:** `audio` file (FormData)

**Response:** `{ text: string }`

**Details:**
- Uses OpenAI Whisper v1
- Direct file streaming

---

### `/api/enrich-todos`

**Purpose:** Batch enrich short todos with metadata

**Method:** POST

**Request Body:**
```typescript
{ todos: Todo[] }
```

**Response:**
```typescript
{ enrichedTodos: Todo[] }
```

**Details:**
- Uses `processBatchTodos` from `lib/ai/server`
- Adds priority, due dates, categories to sparse todos
- Part of the AI queue system for efficient processing

---

### `/api/agent-prompts`

**Purpose:** Manage AI agent system prompts

**Methods:** GET, PUT

**GET Response:**
```typescript
{
  processTodoText: string
  processBatchTodos: string
  processSingleTodo: string
  findSimilarTasks: string
}
```

**PUT Request:** Same structure to update prompts

---

### `/api/agent-config`

**Purpose:** Manage OpenAI API key configuration

**Methods:** GET, PUT

**Details:**
- Allows manual API key management
- Used by the agent settings dashboard

---

## State Management

### Zustand Store (`lib/store.ts`)

**Single Source of Truth for:**
- All items (todos, separators) - `items: Item[]`
- Selection state - `activeItemId`, `pendingFocusId`
- UI preferences - `viewMode`, `kanbanGroupBy`, `showMetadata`, `showCompleted`, `listGroupBy`
- Focus mode state - `isFocusMode`, `focusTimeRemaining`, `focusTimerRunning`, `distractionNotes`
- Changelog/AI state - `changelogSession`, `showChangelog`

**Persistence:**
- Uses Zustand `persist` middleware
- Only persists UI preferences (not items - handled by database)
- localStorage key: `"todo-app-ui-preferences"`
- Version 2 with migration from old `listGroupBy: "position"` → `"project"`

**Key Actions:**

| Action | Purpose |
|--------|---------|
| `loadItems()` | Load all items from database |
| `addItem()` | Create a new item |
| `updateItem()` | Update an existing item |
| `updateItemDebounced()` | Update with 300ms debounce |
| `deleteItem()` | Delete an item |
| `toggleItem()` | Toggle todo completion |
| `reorderItems()` | Update positions after drag |
| `setActiveItem()` | Set active item (selection) |
| `setActiveItemAndFocus()` | Set active item and schedule focus |
| `setPendingFocus()` | Schedule focus for next render |
| `clearPendingFocus()` | Clear scheduled focus |
| `applyChanges()` | Apply AI-proposed changes |
| `setFocusMode()` | Enter/exit focus mode |
| `toggleNow()` | Toggle isNow flag on todo |
| `clearNowItems()` | Clear all "now" items |
| `archiveOldDoneTasks()` | Auto-archive completed tasks (24h) |
| `insertItemAfter()` | Insert new item after specified item |

**Derived State (Hooks):**

| Hook | Purpose |
|------|---------|
| `useTodos()` | Filtered, converted todo items (excludes archived) |
| `useActiveItem()` | Current active/selected todo |
| `useSelectedTodo()` | Alias for useActiveItem (compatibility) |
| `useSortedItems()` | Items sorted by position |
| `useCategories()` | Unique categories |
| `useNowTodos()` | Todos marked with isNow |

---

## Grouping System

The centralized grouping engine (`lib/grouping.ts`) supports multiple strategies:

### 1. Project (Default for List View)
- Groups todos by indent level and position
- Creates visual hierarchy based on indentation
- Collapsible sections

### 2. Due Date
Categories: `now`, `overdue`, `today`, `tomorrow`, `this-week`, `later`, `no-date`
- Uses `getDueDateCategory()` to classify
- Supports "Now" group via `isNow` flag
- Empty groups always shown: now, today, tomorrow

### 3. Priority
Categories: `high`, `medium`, `low`, `none`
- Colors: red, amber, green, gray

### 4. Status
Categories: `due`, `in-progress`, `done`, `archived`
- Derived from `completed` flag if `status` not set

### 5. Category (Tags)
- Dynamic columns from unique category values
- "Uncategorized" group for todos without category

**API:**
```typescript
function groupItems(items: Item[], groupBy: GroupBy, options?: GroupingOptions): ItemGroup[]
function useGroupedItems(items: Item[], groupBy: GroupBy, options?: GroupingOptions): ItemGroup[]
```

---

## Component Hierarchy

### TodoApp (Main Orchestrator)
- Loads initial data via `loadItems()`
- Manages UI state (viewMode, hideCompleted, kanbanGroupBy)
- Handles focus mode timer
- Coordinates AI input, changelog, and merge operations

### Layout Components
- **MainLayout** - Application shell with sidebar
- **MainSidebar** - Navigation and quick actions
- **ThemeSwitcher** - Light/dark mode toggle
- **UserButton/UserProfile** - User information display

### TodoTextEditor (List View)
- Uses `@dnd-kit` for drag-and-drop sorting
- Groups items via `useGroupedItems`
- Renders SortableItem wrappers containing TaskItem components
- Supports inline editing and keyboard navigation
- Accesses Zustand store directly for state

### TodoKanbanView (Board View)
- Renders columns based on groupBy strategy
- Reuses same `useGroupedItems` hook
- Maps groups to KanbanColumn components
- Supports add-todo-to-column and drag between columns

### TodoInput (AI Interface)
- Text input with optional voice recording
- Calls `/api/process-todo-text` to parse natural language
- Shows audio visualization while recording
- Proposes changes through ChangelogDialog

### ChangelogDialog (Review Changes)
- Displays AI-proposed changes before applying
- Shows what will be created, updated, deleted, or merged
- User can approve/reject individual changes

### TodoSidebar (Details Panel)
- Shows selected todo's full details
- Allows inline editing of metadata
- Lists all categories with rename/delete capabilities

### FocusModeOverlay (Focus Mode)
- Full-screen overlay with countdown timer
- Text area for distraction notes
- Can pause/resume/reset timer

---

## Database & Persistence

### Dual-Mode Architecture

**Electron Mode:** Delegates to `window.electronDB` (IPC calls to main process)

**Web Mode:** Falls back to `WebDatabase` (in-memory with sql.js)

### API Interface

```typescript
interface ElectronAPI {
  // Items
  getItems(): Promise<Item[]>
  createItem(item: Item): Promise<Item>
  createItems(items: Item[]): Promise<Item[]>
  updateItem(id: string, updates: Partial<Item>): Promise<void>
  updateItemPositions(updates: {id: string; position: number}[]): Promise<void>
  deleteItem(id: string): Promise<void>
  toggleItem(id: string): Promise<Item | null>
  getMaxPosition(): Promise<number>

  // AI Processing
  transcribeAudio(audioBuffer: ArrayBuffer): Promise<string>
  processTodoText(input: string, existingTodos: Todo[]): Promise<ProposedChange[]>
  findSimilarTasks(todos: Todo[]): Promise<ProposedChange[]>

  // Auto-updates (non-MAS builds only)
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>

  // Focus Timer
  startFocusTimer(duration?: number): Promise<{success: boolean; timeRemaining: number}>
  pauseFocusTimer(): Promise<{...}>
  resumeFocusTimer(): Promise<{...}>
  resetFocusTimer(): Promise<{...}>
  getFocusState(): Promise<{isRunning: boolean; timeRemaining: number}>

  // Agent Configuration
  getAgentPrompts(): Promise<AgentPrompts>
  setAgentPrompts(prompts: AgentPrompts): Promise<void>
  getAgentConfig(): Promise<AgentConfig>
  setAgentConfig(config: AgentConfig): Promise<void>
}
```

---

## Custom Hooks

### `use-focus-manager.ts`
Unified keyboard navigation for lists:
- Focus by ID, prev/next, first/last
- Edit mode tracking
- Input ref registration for manual focus
- Pending focus scheduling for after re-renders

### `use-focus-timer.ts`
Focus mode timer management:
- Syncs with Electron main process
- Listens to timer ticks and completion events
- Start/pause/resume/reset/end methods
- Time formatting (MM:SS)

### `use-mobile.ts`
Responsive design detection for mobile layouts

### `use-sidebar.ts`
Sidebar state management hook

### `use-main-sidebar-store.ts`
Zustand store for main sidebar collapse state:
- `isCollapsed: boolean`
- `toggle(): void`

---

## Key Features

### Core Todo Management
- Create, read, update, delete todos
- Mark complete/incomplete with timestamps
- Drag-and-drop reordering
- Auto-archive completed tasks after 24 hours
- Undo/redo (via changelogSession)

### Metadata
- Priority (low/medium/high)
- Due date with smart categorization
- Category/tags
- Details/notes
- AI processing status
- Completion timestamp

### View Modes
- List view (document-based with indentation)
- Kanban board (5 grouping strategies)

### AI Features
- Natural language todo creation
- Meeting transcript parsing
- Duplicate detection & merge suggestions
- Voice-to-todo (via transcription)
- Batch todo enrichment
- Customizable agent system prompts
- Manual OpenAI API key management

### Focus Mode
- Distraction-free timer (25min Pomodoro default)
- Darkened overlay
- Capture distraction notes
- Timer synced with Electron main process
- "Now" items for focus prioritization

### Organization
- Group by due date, priority, status, category, project
- Collapse/expand groups
- Hide completed todos
- Indent-based hierarchy

### Cross-Platform
- Web app (Vercel deployment)
- Desktop app (Electron with auto-updates)
- Mac App Store support (MAS builds)

### Theme
- Light/dark mode (next-themes)
- System preference detection

---

## Dependencies

### Core
- `next` 16.0.7 - Full-stack React framework
- `react` 19.2.0 - UI library
- `typescript` 5.x - Type-safe JavaScript

### State Management
- `zustand` 5.0.9 - Lightweight state management

### UI Components
- `@radix-ui/*` - 20+ headless UI primitives
- `lucide-react` 0.454.0 - Icon library
- `@phosphor-icons/react` 2.1.10 - Alternative icons

### Styling
- `tailwindcss` 4.1.9 - Utility-first CSS
- `class-variance-authority` 0.7.1 - Component variants
- `tailwind-merge` 2.5.5 - Class merging

### Drag & Drop
- `@dnd-kit/core` 6.3.1
- `@dnd-kit/sortable` 10.0.0
- `@dnd-kit/utilities` 3.2.2

### Forms
- `react-hook-form` 7.60.0 - Form handling
- `zod` 3.25.76 - Schema validation
- `@hookform/resolvers` 3.10.0 - Validation resolvers

### AI
- `ai` latest - Vercel AI SDK
- `@ai-sdk/openai` 2.0.68 - OpenAI provider
- `openai` 6.9.1 - Official OpenAI client

### Desktop
- `electron` 34.0.0 - Desktop framework
- `electron-builder` 26.0.12 - App packaging
- `electron-store` 11.0.2 - Persistent storage
- `electron-updater` 6.6.2 - Auto-updates

### Layout & UI
- `react-resizable-panels` 2.1.7 - Resizable panel layout
- `embla-carousel-react` 8.5.1 - Carousel component
- `vaul` 0.9.9 - Drawer component
- `tunnel-rat` 0.1.2 - Portal/modal management

### Utilities
- `date-fns` 4.1.0 - Date manipulation
- `clsx` 2.1.1 - Conditional classes
- `cmdk` 1.0.4 - Command menu
- `sonner` 1.7.4 - Toast notifications
- `motion` 12.23.25 - Animations
- `sql.js` 1.13.0 - In-memory SQL database
- `form-data` 4.0.5 - Form data handling
- `node-fetch` 2.7.0 - Fetch polyfill

---

## Application Flow

```
User Input (Text or Voice)
         ↓
    TodoInput Component
         ↓
    /api/process-todo-text (or transcribe)
         ↓
    OpenAI gpt-4o-mini Processing
         ↓
    AI Queue Manager (batch collection)
         ↓
    ChangelogDialog (review proposals)
         ↓
    User Approval
         ↓
    store.applyChanges()
         ↓
    Update Zustand Store
         ↓
    Persist to Database (Electron IPC or Web)
         ↓
    UI Re-render
         ↓
    TodoTextEditor or TodoKanbanView
         ↓
    Display updated todos
```

---

## Development

### Package Manager
- **pnpm** 9.15.0 (enforced via `packageManager` field)

### Node Version
- **Node.js** 20.0.0+

### Scripts
```bash
pnpm dev              # Start Next.js dev server
pnpm build            # Build for production
pnpm electron:dev     # Start Electron in dev mode
pnpm electron:build:mac       # Build macOS app (dmg + zip)
pnpm electron:build:mac:mas   # Build Mac App Store version
pnpm electron:build:win       # Build Windows app
pnpm electron:build:linux     # Build Linux app
pnpm dev:all          # Run Next.js + Electron concurrently
```

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `next.config.mjs` | Next.js configuration |
| `postcss.config.mjs` | Tailwind CSS setup |
| `components.json` | shadcn/ui configuration |
| `electron-builder.yml` | Electron build config |
| `build/entitlements.*.plist` | macOS entitlements |

---

## Code Quality & Architecture Notes

### Recent Improvements

1. **Unified Item Type** - Single `Item` type; "title" item type removed (backward-compatible conversion)
2. **Simplified ItemType** - Now just `"todo" | "separator"`
3. **Added `archived` status** - Todos can be archived after completion
4. **Added `completedAt` field** - Tracks when todos were completed
5. **Consolidated AI files into `lib/ai/`** - All AI processing code in one directory with clean re-exports
6. **Added layout components** - New `components/layout/` directory for app shell
7. **New hooks** - `use-sidebar.ts` and `use-main-sidebar-store.ts` for sidebar state
8. **Unified selection** - `activeItemId` and `pendingFocusId` replace old selection model
9. **Store version 2** - Migration from `listGroupBy: "position"` to `"project"`
10. **Mac App Store support** - Conditional auto-updater loading for MAS builds

### TaskItem Mode System

The `TaskItem` component uses a `mode` prop for edit behavior:

```typescript
mode: "always" | "toggle" | "readonly"
```

- `"always"` - Input always visible (list view behavior)
- `"toggle"` - Input shown only when `isEditing=true` (kanban behavior)
- `"readonly"` - Display only, no editing

### Known Technical Debt

#### 1. Focus State Could Be Grouped
Five separate state fields for focus mode could be consolidated:

```typescript
// Current (5 fields)
isFocusMode: boolean
focusTimeRemaining: number
focusTimerRunning: boolean
distractionNotes: string
previousTheme: string | null

// Could become (1 field)
focusSession: {
  active: boolean
  timeRemaining: number
  running: boolean
  notes: string
  savedTheme: string | null
} | null
```

#### 2. moveToProject Placeholder
The `moveToProject` action is currently a placeholder with a warning log. Full hierarchy-based implementation pending.

### Type System Guidelines

1. **Use `Item` for storage/state** - Single source of truth
2. **Use `Todo` for component props** - Cleaner interfaces
3. **Use type guards** - `isTodo()`, `isSeparator()`
4. **Import grouping types from `lib/types.ts`** - `ListGroupBy`, `KanbanGroupBy`

### File Organization

```
lib/
├── store.ts          # Zustand store (state + actions)
├── types.ts          # Core type definitions
├── grouping.ts       # Grouping logic
├── format.ts         # Date formatting utilities
├── utils.ts          # General utilities (cn)
├── ai/               # AI processing (consolidated)
│   ├── index.ts      # Central exports
│   ├── defaults.ts   # Default configurations
│   ├── server.ts     # Server-side utilities
│   ├── process-*.ts  # Processing functions
│   ├── ai-queue-manager.ts
│   └── agent-*.ts    # Agent configuration
└── electron/         # Electron-specific code
    └── database.ts   # DB abstraction
```
