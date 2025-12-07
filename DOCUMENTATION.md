# Notes List - Complete Application Documentation

A sophisticated cross-platform todo application built with **Next.js 16 + Electron + AI**.

---

## 🏗️ Architecture Summary

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

## 📁 Project Structure

```
v0-intelligent-todo-app/
├── app/                          # Next.js App Router directory
│   ├── api/                      # API routes (server-side)
│   │   ├── process-todo-text/    # AI text processing for todos
│   │   ├── find-similar-tasks/   # Task deduplication/merge suggestions
│   │   └── transcribe/           # Audio transcription via Whisper
│   ├── page.tsx                  # Main entry point
│   ├── layout.tsx                # Root layout with theme provider
│   └── globals.css               # Global styles
├── components/                   # React components
│   ├── todo-app.tsx              # Main app container (orchestrator)
│   ├── todo-text-editor.tsx      # List view with drag-and-drop
│   ├── todo-kanban-view.tsx      # Kanban board view
│   ├── todo-input.tsx            # AI input and voice recording interface
│   ├── todo-sidebar.tsx          # Detail sidebar and category manager
│   ├── changelog-dialog.tsx      # AI-proposed changes review interface
│   ├── merge-button.tsx          # Duplicate detection/merge trigger
│   ├── focus-mode-overlay.tsx    # Distraction-free focus timer UI
│   ├── draggable-item.tsx        # Drag handle wrapper
│   ├── sortable-item.tsx         # dnd-kit sortable wrapper
│   ├── theme-provider.tsx        # next-themes integration
│   ├── update-notifier.tsx       # Auto-update notifications (Electron)
│   └── ui/                       # Radix UI component library
│       ├── task-item.tsx         # Reusable todo/title renderer
│       ├── kanban.tsx            # Kanban column/card components
│       ├── collapsible-header.tsx # Group headers for grouping
│       ├── metadata-badges.tsx   # Priority/category badges
│       └── [20+ other UI components]
├── hooks/                        # Custom React hooks
│   ├── use-focus-manager.ts      # Unified focus/navigation for lists
│   ├── use-focus-timer.ts        # Focus timer state + Electron sync
│   └── use-mobile.ts             # Responsive design detection
├── lib/                          # Core business logic
│   ├── store.ts                  # Zustand state management (main app state)
│   ├── types.ts                  # TypeScript type definitions
│   ├── electron/
│   │   └── database.ts           # Database abstraction layer (Electron/web)
│   ├── electron-api.ts           # Type-safe Electron IPC interface
│   ├── api-bridge.ts             # Client-side API request wrapper
│   ├── process-todos.ts          # AI text-to-todo conversion
│   ├── process-batch-todos.ts    # Batch processing for efficiency
│   ├── process-single-todo.ts    # Single todo enhancement
│   ├── find-similar-tasks.ts     # Semantic task deduplication
│   ├── ai-queue-manager.ts       # Queue & batch system for AI calls
│   ├── grouping.ts               # Centralized grouping engine (5 strategies)
│   ├── format.ts                 # Date formatting and categorization
│   ├── utils.ts                  # Utility functions (cn for Tailwind merge)
│   └── hooks/
│       └── use-debounced-callback.ts
├── styles/
│   └── globals.css               # Global Tailwind styles
├── types/
│   └── electron.d.ts             # Electron API TypeScript definitions
├── package.json                  # Project dependencies and build config
├── tsconfig.json                 # TypeScript configuration
├── next.config.mjs               # Next.js configuration
├── postcss.config.mjs            # Tailwind + PostCSS setup
├── components.json               # shadcn/ui configuration
└── README.md                     # Project documentation
```

---

## 📁 Key Files & Purposes

| File | Purpose |
|------|---------|
| `app/page.tsx` | Entry point - renders `<TodoApp />` |
| `components/todo-app.tsx` | Main orchestrator - loads data, manages views |
| `components/todo-text-editor.tsx` | List view with drag-drop, inline editing |
| `components/todo-kanban-view.tsx` | Kanban board with 5 grouping strategies |
| `components/todo-input.tsx` | AI natural language input + voice recording |
| `components/todo-sidebar.tsx` | Detail panel for selected todo |
| `components/changelog-dialog.tsx` | Review AI-proposed changes before applying |
| `lib/store.ts` | **Zustand state management** - all app state |
| `lib/types.ts` | TypeScript definitions for Item, Todo, etc. |
| `lib/grouping.ts` | Centralized grouping engine |
| `lib/electron/database.ts` | Database abstraction (Electron/Web) |
| `hooks/use-focus-manager.ts` | Keyboard navigation for lists |

---

## 🔧 Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | Next.js 16, React 19, TypeScript |
| **State** | Zustand with persistence |
| **UI** | Radix UI, shadcn/ui, Tailwind CSS 4 |
| **Drag & Drop** | @dnd-kit (core, sortable, utilities) |
| **AI** | Vercel AI SDK, OpenAI (gpt-4o-mini, Whisper) |
| **Desktop** | Electron 39, auto-updates |
| **Forms** | React Hook Form, Zod validation |
| **Animation** | Motion (framer-motion) |
| **Icons** | Lucide React, Phosphor Icons |
| **Date** | date-fns, React Day Picker |
| **Charts** | Recharts |

---

## 📊 Data Model

### Core Item Type

The unified **Item** type is the single source of truth for all entities:

```typescript
interface Item {
  id: string
  type: "todo" | "title" | "separator"    // ItemType
  position: number                         // Ordering
  parentId?: string                        // For sub-tasks/projects

  // Todo-specific
  title?: string
  details?: string
  completed?: boolean
  status?: "due" | "in-progress" | "done"
  priority?: "low" | "medium" | "high"
  dueDate?: string                         // ISO format
  category?: string                        // Tag
  indent?: number                          // Nesting level
  isNow?: boolean                          // Focus group marker
  aiProcessingStatus?: "pending" | "processing" | "enhanced" | "failed"

  // Title-specific
  text?: string

  // Metadata
  createdAt: string
  updatedAt?: string
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
type GroupBy = "position" | "dueDate" | "priority" | "category" | "project" | "status"
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

## 🌐 API Routes

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

## 🗄️ State Management

### Zustand Store (`lib/store.ts`)

**Single Source of Truth for:**
- All items (todos, titles, separators) - `items: Item[]`
- Selection state - `selectedTodoId`, `selectedTitleId`
- UI preferences - `viewMode`, `kanbanGroupBy`, `showMetadata`, `showCompleted`, `listGroupBy`
- Focus mode state - `isFocusMode`, `focusTimeRemaining`, `focusTimerRunning`, `distractionNotes`
- Changelog/AI state - `changelogSession`, `showChangelog`

**Persistence:**
- Uses Zustand `persist` middleware
- Only persists UI preferences (not items - handled by database)
- localStorage key: `"todo-app-ui-preferences"`

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
| `selectTodo()` | Select a todo for sidebar |
| `applyChanges()` | Apply AI-proposed changes |
| `setFocusMode()` | Enter/exit focus mode |
| `toggleNow()` | Toggle isNow flag on todo |

**Derived State (Hooks):**

| Hook | Purpose |
|------|---------|
| `useTodos()` | Filtered, converted todo items |
| `useTitles()` | Title items only |
| `useSortedItems()` | Items sorted by position |
| `useSelectedTodo()` | Current selected todo |
| `useCategories()` | Unique categories |
| `useNowTodos()` | Todos marked with isNow |

---

## 🎯 Grouping System

The centralized grouping engine (`lib/grouping.ts`) supports 5 strategies:

### 1. Position (Default)
- Items in document order
- Titles create collapsible subgroups
- Separators create boundaries

### 2. Due Date
Categories: `now`, `overdue`, `today`, `tomorrow`, `this-week`, `later`, `no-date`
- Uses `getDueDateCategory()` to classify
- Supports "Now" group via `isNow` flag
- Empty groups always shown: now, today, tomorrow

### 3. Priority
Categories: `high`, `medium`, `low`, `none`
- Colors: red, amber, green, gray

### 4. Status
Categories: `due`, `in-progress`, `done`
- Derived from `completed` flag if `status` not set

### 5. Category (Tags)
- Dynamic columns from unique category values
- "Uncategorized" group for todos without category

### 6. Project (Titles)
- Groups todos by title above them
- "No Project" group for ungrouped todos

**API:**
```typescript
function groupItems(items: Item[], groupBy: GroupBy, options?: GroupingOptions): ItemGroup[]
function useGroupedItems(items: Item[], groupBy: GroupBy, options?: GroupingOptions): ItemGroup[]
```

---

## 🎨 Component Hierarchy

### TodoApp (Main Orchestrator)
- Loads initial data via `loadItems()`
- Manages UI state (viewMode, hideCompleted, kanbanGroupBy)
- Handles focus mode timer
- Coordinates AI input, changelog, and merge operations

### TodoTextEditor (List View)
- Uses `@dnd-kit` for drag-and-drop sorting
- Groups items via `useGroupedItems`
- Renders SortableItem wrappers containing TaskItem components
- Supports inline editing and keyboard navigation

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

## 🔌 Database & Persistence

### Dual-Mode Architecture

**Electron Mode:** Delegates to `window.electronDB` (IPC calls to main process)

**Web Mode:** Falls back to `WebDatabase` (in-memory)

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

  // Auto-updates
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>

  // Focus Timer
  startFocusTimer(duration?: number): Promise<{success: boolean; timeRemaining: number}>
  pauseFocusTimer(): Promise<{...}>
  resumeFocusTimer(): Promise<{...}>
  resetFocusTimer(): Promise<{...}>
  getFocusState(): Promise<{isRunning: boolean; timeRemaining: number}>
}
```

---

## 🪝 Custom Hooks

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

---

## ⚡ Key Features

### Core Todo Management
- Create, read, update, delete todos
- Mark complete/incomplete
- Drag-and-drop reordering
- Undo/redo (via changelogSession)

### Metadata
- Priority (low/medium/high)
- Due date with smart categorization
- Category/tags
- Details/notes
- AI processing status

### View Modes
- List view (document-based with titles/separators)
- Kanban board (5 grouping strategies)

### AI Features
- Natural language todo creation
- Meeting transcript parsing
- Duplicate detection & merge suggestions
- Voice-to-todo (via transcription)

### Focus Mode
- Distraction-free timer (25min Pomodoro default)
- Darkened overlay
- Capture distraction notes
- Timer synced with Electron main process

### Organization
- Group by due date, priority, status, category, project
- Collapse/expand groups
- Hide completed todos
- Multiple projects (via titles)

### Cross-Platform
- Web app (Vercel deployment)
- Desktop app (Electron with auto-updates)

### Theme
- Light/dark mode (next-themes)
- System preference detection

---

## 📦 Dependencies

### Core
- `next` 16.0.0 - Full-stack React framework
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
- `ai` - Vercel AI SDK
- `@ai-sdk/openai` 2.0.68 - OpenAI provider
- `openai` 6.9.1 - Official OpenAI client

### Desktop
- `electron` 39.2.2 - Desktop framework
- `electron-builder` 26.0.12 - App packaging
- `electron-store` 11.0.2 - Persistent storage
- `electron-updater` 6.6.2 - Auto-updates

### Utilities
- `date-fns` 4.1.0 - Date manipulation
- `clsx` 2.1.1 - Conditional classes
- `cmdk` 1.0.4 - Command menu
- `sonner` 1.7.4 - Toast notifications
- `motion` 12.23.25 - Animations

---

## 🔄 Application Flow

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

## 🛠️ Development

### Package Manager
- **pnpm** 10.20.0+ (enforced via `packageManager` field)

### Node Version
- **Node.js** 20.0.0+

### Scripts
```bash
pnpm dev          # Start Next.js dev server
pnpm build        # Build for production
pnpm electron:dev # Start Electron in dev mode
pnpm electron:build:mac # Build macOS app
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

---

## 🧹 Code Quality & Architecture Notes

### Recent Improvements

1. **Consolidated `GroupBy` type** - Single definition in `lib/grouping.ts` (was duplicated in `types.ts`)
2. **Simplified TaskItem API** - Removed deprecated `editable`, `onClick`, `onFocus`, `onMetadataClick` props. Use `mode` and `onSelect` instead.
3. **Reduced boilerplate** - Removed unnecessary wrapper handlers in `todo-app.tsx`
4. **Replaced boolean flags with explicit enums** for better code clarity:
   - `hideCompleted: boolean` → `showCompleted: boolean` (positive naming, less cognitive load)
   - `groupByDueDate: boolean` → `listGroupBy: ListGroupBy` (`"position" | "dueDate"`)
5. **Removed @deprecated warnings** from `Todo`/`Title` types - they serve a valid purpose as view types for component props
6. **TodoTextEditor now uses Zustand store directly** - Reduced from 13+ props to just `onStartFocus`. Component accesses store for `items`, `showMetadata`, `showCompleted`, `listGroupBy`, and all actions.
7. **Consolidated AI files into `lib/ai/`** - All AI processing code now in one directory with clean re-exports via `lib/ai/index.ts`.

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

### Type System Guidelines

1. **Use `Item` for storage/state** - Single source of truth
2. **Use `Todo`/`Title` for component props** - Cleaner interfaces
3. **Use type guards** - `isTodo()`, `isTitle()`, `isSeparator()`
4. **Import `GroupBy` from `lib/grouping.ts`** - Not from `types.ts`

### File Organization

```
lib/
├── store.ts          # Zustand store (state + actions)
├── types.ts          # Core type definitions
├── grouping.ts       # Grouping logic + GroupBy type
├── format.ts         # Date formatting utilities
├── utils.ts          # General utilities (cn)
└── electron/         # Electron-specific code
    └── database.ts   # DB abstraction
```
