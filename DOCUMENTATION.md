# Intelligent Todo App - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Core Components](#core-components)
6. [Data Flow](#data-flow)
7. [AI Integration](#ai-integration)
8. [Features](#features)
9. [Type Definitions](#type-definitions)
10. [Configuration](#configuration)
11. [Development Guide](#development-guide)

---

## Overview

The Intelligent Todo App is a modern, AI-powered task management application built with Next.js 16 and React 19. It leverages natural language processing to allow users to create, update, and manage tasks using conversational input. The application intelligently parses user input to extract task details, priorities, due dates, and categories without requiring rigid form inputs.

### Key Highlights
- Natural language input processing using OpenAI GPT-4o-mini
- Voice input support using Web Speech API
- Smart task matching and updates
- Responsive UI with dark/light theme support
- Real-time feedback and processing states
- Expandable task details with metadata

---

## Architecture

The application follows a modern React architecture with the following patterns:

### Client-Server Separation
- **Client Components**: Interactive UI components marked with `"use client"`
- **Server Actions**: AI processing happens server-side for security and performance

### State Management
- Local React state using `useState` hook
- No external state management library (Redux, Zustand, etc.)
- Props drilling for component communication

### Component Hierarchy
```
Page (app/page.tsx)
└── TodoApp (components/todo-app.tsx)
    ├── TodoInput (components/todo-input.tsx)
    └── TodoList (components/todo-list.tsx)
        └── TodoItem (internal component)
```

---

## Technology Stack

### Frontend Framework
- **Next.js 16.0.0**: React framework with App Router
- **React 19.2.0**: UI library with latest features
- **TypeScript 5**: Type safety and developer experience

### UI Components & Styling
- **Radix UI**: Headless accessible component primitives
  - Checkbox, Dialog, Dropdown Menu, Popover, etc.
- **Tailwind CSS 4.1.9**: Utility-first CSS framework
- **Lucide React**: Icon library (Sparkles, Loader2, Calendar, etc.)
- **class-variance-authority**: Component variant management
- **clsx & tailwind-merge**: Conditional className utilities

### AI & Data Processing
- **Vercel AI SDK (ai)**: AI integration framework
- **OpenAI GPT-4o-mini**: Natural language understanding model
- **Zod 3.25.76**: Schema validation and type inference

### Additional Features
- **next-themes**: Dark/light theme management
- **Web Speech API**: Browser-based voice recognition
- **date-fns**: Date manipulation and formatting

### Development Tools
- **pnpm**: Package manager
- **ESLint**: Code linting
- **PostCSS**: CSS processing

---

## Project Structure

```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with fonts and analytics
│   ├── page.tsx                 # Home page with TodoApp
│   └── globals.css              # Global styles
│
├── components/                   # React components
│   ├── todo-app.tsx             # Main container component
│   ├── todo-input.tsx           # Input component with voice support
│   ├── todo-list.tsx            # List display and todo items
│   ├── theme-provider.tsx       # Theme context provider
│   └── ui/                      # Reusable UI primitives
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       └── textarea.tsx
│
├── lib/                         # Utilities and business logic
│   ├── types.ts                 # TypeScript type definitions
│   ├── process-todos.ts         # AI processing server action
│   └── utils.ts                 # Utility functions
│
├── styles/                      # Additional stylesheets
│   └── globals.css
│
├── public/                      # Static assets
│
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── next.config.mjs             # Next.js configuration
├── postcss.config.mjs          # PostCSS configuration
├── components.json             # UI components configuration
└── README.md                   # Project README
```

---

## Core Components

### 1. TodoApp (`components/todo-app.tsx`)

**Purpose**: Main container component that manages global todo state and coordinates child components.

**State Management**:
```typescript
const [todos, setTodos] = useState<Todo[]>([])
const [isProcessing, setIsProcessing] = useState(false)
```

**Key Functions**:
- `handleAddTodos(newTodos: Todo[])`: Adds new todos to the list
- `handleUpdateTodo(id, updates)`: Updates specific todo fields
- `handleDeleteTodo(id)`: Removes a todo from the list
- `handleToggleTodo(id)`: Toggles completion status

**File Location**: `components/todo-app.tsx:8-40`

---

### 2. TodoInput (`components/todo-input.tsx`)

**Purpose**: Handles user input via text or voice, processes natural language, and provides feedback.

**Props**:
```typescript
interface TodoInputProps {
  existingTodos: Todo[]
  onAddTodos: (todos: Todo[]) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void
}
```

**Features**:
- Text input with auto-resize textarea
- Voice recognition using Web Speech API
- Real-time processing feedback
- Keyboard shortcut support (Cmd/Ctrl+Enter)
- Visual state indicators (listening, processing, success, error)

**Voice Recognition Flow** (`components/todo-input.tsx:29-65`):
1. Check browser support for SpeechRecognition
2. Initialize recognition instance with US English
3. Handle speech results and append to input
4. Error handling with user feedback
5. Auto-stop after speech ends

**Submit Handler** (`components/todo-input.tsx:79-129`):
1. Validate input is not empty
2. Call `processTodoText` server action
3. Handle new todos and updates separately
4. Provide detailed feedback to user
5. Clear input and auto-hide feedback after 4 seconds

**File Location**: `components/todo-input.tsx:1-215`

---

### 3. TodoList (`components/todo-list.tsx`)

**Purpose**: Displays todos in categorized sections (Active/Completed) with expand/collapse functionality.

**Props**:
```typescript
interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Todo>) => void
}
```

**Layout Logic**:
- Separates active and completed todos
- Shows empty state when no todos exist
- Displays count for each section
- Renders individual TodoItem components

**TodoItem Component** (`components/todo-list.tsx:66-162`):
- Checkbox for completion toggle
- Expandable details section
- Priority, due date, and category badges
- Delete button
- Conditional styling based on completion status

**File Location**: `components/todo-list.tsx:1-163`

---

### 4. AI Processing (`lib/process-todos.ts`)

**Purpose**: Server-side AI processing of natural language input to create or update todos.

**Key Function**:
```typescript
async function processTodoText(
  input: string,
  existingTodos: Todo[]
): Promise<ProcessResult>
```

**AI Model**: OpenAI GPT-4o-mini via Vercel AI SDK

**Schema Validation**:
```typescript
const TodoSchema = z.object({
  title: z.string(),
  details: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
  completed: z.boolean().optional(),
})

const ProcessResultSchema = z.object({
  newTodos: z.array(TodoSchema),
  updates: z.array(z.object({
    matchedTodoId: z.string(),
    updates: TodoSchema.partial(),
    reason: z.string(),
  })),
})
```

**Smart Matching Rules** (`lib/process-todos.ts:45-57`):
- Semantic similarity matching (e.g., "grocery shopping" = "buy groceries")
- Category-based matching
- Priority-based matching
- Due date proximity matching
- Flexible wording variations

**Completion Keywords**:
- Set `completed: true`: "complete", "finish", "done", "check off", "mark done"
- Set `completed: false`: "uncomplete", "reopen", "undo", "mark incomplete"

**Priority Detection**:
- **High**: "urgent", "important", "asap", "critical"
- **Medium**: "medium", "normal"
- **Low**: "low", "whenever", "someday"

**Date Parsing Examples**:
- "tomorrow" → next day
- "next week" → 7 days from now
- "in 3 days" → 3 days from now
- "Monday" → next Monday
- "end of month" → last day of current month

**File Location**: `lib/process-todos.ts:1-92`

---

## Data Flow

### Creating New Todos

```
User Input (text/voice)
    ↓
TodoInput component
    ↓
processTodoText(input, existingTodos) [Server Action]
    ↓
OpenAI GPT-4o-mini API
    ↓
Structured Response (newTodos, updates)
    ↓
TodoInput handlers
    ↓
TodoApp.handleAddTodos()
    ↓
State Update
    ↓
TodoList Re-render
```

### Updating Existing Todos

```
User Input: "mark grocery task as done"
    ↓
AI matches existing todo by semantic similarity
    ↓
Returns update with matchedTodoId and updates
    ↓
TodoApp.handleUpdateTodo(id, updates)
    ↓
State Update (map over todos)
    ↓
TodoList Re-render with updated item
```

### Toggle Completion (Direct)

```
User clicks checkbox
    ↓
TodoList.onToggle(id)
    ↓
TodoApp.handleToggleTodo(id)
    ↓
State Update (toggle completed field)
    ↓
TodoList Re-render
```

---

## AI Integration

### Configuration

The AI integration uses the Vercel AI SDK with OpenAI's GPT-4o-mini model. This requires environment variables for API authentication:

```bash
# .env (not committed to version control)
OPENAI_API_KEY=your_api_key_here
```

### generateObject API

The `generateObject` function from Vercel AI SDK provides:
- Type-safe structured output using Zod schemas
- Automatic retries and error handling
- Streaming support (not used in this app)

**Usage** (`lib/process-todos.ts:30-72`):
```typescript
const { object } = await generateObject({
  model: "openai/gpt-4o-mini",
  schema: ProcessResultSchema,
  prompt: `...detailed instructions...`,
})
```

### Prompt Engineering

The prompt includes:
1. Role definition ("You are a smart todo assistant")
2. Task instructions (create, update, mark complete)
3. Formatting rules (title vs details separation)
4. Context (existing todos with full metadata)
5. Smart matching rules with examples
6. Completion keywords
7. Date parsing examples
8. Priority detection rules

This comprehensive prompt ensures consistent and accurate AI responses.

---

## Features

### 1. Natural Language Processing
- Parse free-form text input
- Extract task titles, details, priorities, dates, and categories
- Handle multiple tasks in a single input
- Understand context and intent

**Example Inputs**:
- "Buy groceries tomorrow at 3pm"
- "Add urgent meeting prep for Monday"
- "Mark the design task as high priority"
- "Complete the grocery shopping task"

### 2. Voice Input
- Browser-based speech recognition
- Real-time transcription
- Visual feedback during listening
- Error handling with fallback to text input

**Browser Support**: Chrome, Edge, Safari (via WebKit Speech API)

### 3. Smart Task Management
- Create new tasks
- Update existing tasks by semantic matching
- Mark tasks complete/incomplete
- Delete tasks
- Toggle task completion

### 4. Task Metadata
- **Priority**: Low, Medium, High (color-coded badges)
- **Due Date**: ISO format with localized display
- **Category**: Custom tags for organization
- **Details**: Extended notes and context
- **Created At**: Automatic timestamp

### 5. UI/UX Features
- Expandable task details
- Empty state messaging
- Real-time processing feedback
- Success/error notifications
- Responsive design
- Accessible components (Radix UI)
- Theme support (via next-themes)

### 6. Keyboard Shortcuts
- **Cmd/Ctrl+Enter**: Submit input

---

## Type Definitions

### Todo Interface (`lib/types.ts:1-10`)

```typescript
export interface Todo {
  id: string                    // UUID v4
  title: string                 // One-line task description
  details?: string              // Extended notes and context
  completed: boolean            // Completion status
  priority?: "low" | "medium" | "high"  // Task priority
  dueDate?: string             // ISO 8601 date string
  category?: string            // Custom category/tag
  createdAt: string            // ISO 8601 timestamp
}
```

### TodoUpdate Interface (`lib/types.ts:12-15`)

```typescript
export interface TodoUpdate {
  id: string                   // Todo ID to update
  updates: Partial<Todo>       // Fields to modify
}
```

### ProcessResult Interface (`lib/types.ts:17-20`)

```typescript
export interface ProcessResult {
  newTodos: Todo[]            // Newly created todos
  updates: TodoUpdate[]       // Updates to existing todos
}
```

---

## Configuration

### Next.js Config (`next.config.mjs`)

```javascript
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,    // Skip ESLint during build
  },
  typescript: {
    ignoreBuildErrors: true,      // Skip TypeScript errors during build
  },
  images: {
    unoptimized: true,            // Disable image optimization
  },
}
```

**Note**: Build error ignoring is enabled for faster development iteration. For production, consider enabling these checks.

### TypeScript Config (`tsconfig.json`)

- **Target**: ES6
- **Module**: ESNext with bundler resolution
- **Strict Mode**: Enabled
- **Path Alias**: `@/*` maps to project root
- **JSX**: Preserve (handled by Next.js)
- **Incremental**: Enabled for faster builds

### Component Configuration (`components.json`)

Defines shadcn/ui component settings:
- Style: Default
- Base color: Slate
- CSS variables: Enabled
- Tailwind config: Using v4 with @import
- Component aliases: `@/components`
- Utils alias: `@/lib/utils`

---

## Development Guide

### Prerequisites

- Node.js 18+ or 20+
- pnpm package manager
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd intelligent-todo-app

# Install dependencies
pnpm install

# Set up environment variables
echo "OPENAI_API_KEY=your_api_key_here" > .env.local
```

### Available Scripts

```bash
# Start development server (http://localhost:3000)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint
```

### Project Conventions

#### File Naming
- React components: PascalCase (e.g., `TodoApp.tsx`)
- Utilities and types: kebab-case (e.g., `process-todos.ts`)
- UI components: kebab-case (e.g., `button.tsx`)

#### Import Aliases
- Use `@/` prefix for absolute imports
- Example: `import { Todo } from "@/lib/types"`

#### Component Patterns
- Use `"use client"` directive for client components
- Use `"use server"` directive for server actions
- Export default for pages, named exports for components

#### Styling
- Tailwind utility classes for styling
- Use `cn()` helper for conditional classes
- Component variants via `class-variance-authority`

### Adding New Features

#### Adding a New Todo Field

1. Update type definition in `lib/types.ts`:
```typescript
export interface Todo {
  // ... existing fields
  newField?: string  // Add your field
}
```

2. Update Zod schema in `lib/process-todos.ts`:
```typescript
const TodoSchema = z.object({
  // ... existing fields
  newField: z.string().optional().describe("Description for AI"),
})
```

3. Update AI prompt with extraction rules

4. Update UI components to display the new field

#### Adding a New UI Component

```bash
# Using shadcn/ui CLI
npx shadcn@latest add <component-name>

# Example:
npx shadcn@latest add dialog
```

This will:
- Add the component to `components/ui/`
- Install required Radix UI dependencies
- Configure proper TypeScript types

### Debugging

#### AI Processing Issues

1. Check server console for AI API errors
2. Verify `OPENAI_API_KEY` is set correctly
3. Inspect prompt and schema in `lib/process-todos.ts`
4. Test with simpler inputs first

#### Voice Recognition Issues

1. Verify browser support (Chrome/Edge preferred)
2. Check microphone permissions
3. Look for console errors in browser DevTools
4. Test with `isSupported` state flag

#### State Management Issues

1. Use React DevTools to inspect component state
2. Add console.logs in handlers
3. Verify props are passed correctly
4. Check for key prop warnings in lists

---

## Security Considerations

### API Key Protection
- Never commit `.env` files
- Use `.env.local` for local development
- Set environment variables in Vercel dashboard for production

### Input Validation
- Zod schemas validate AI responses
- TypeScript provides compile-time type safety
- Server actions prevent direct API access from client

### XSS Prevention
- React automatically escapes JSX content
- No `dangerouslySetInnerHTML` usage
- User input sanitized through AI processing

---

## Performance Optimization

### Current Optimizations
- Next.js automatic code splitting
- Server-side AI processing (reduces client bundle)
- Unoptimized images (config setting)
- Incremental TypeScript compilation

### Potential Improvements
- Implement React.memo for TodoItem
- Add virtual scrolling for large todo lists
- Cache AI responses for similar inputs
- Optimize bundle size (remove unused Radix components)
- Add loading states for better perceived performance

---

## Deployment

### Vercel (Recommended)

The project is configured for Vercel deployment:

1. Connect GitHub repository to Vercel
2. Set `OPENAI_API_KEY` environment variable
3. Deploy automatically on push to main branch

**Live URL**: https://vercel.com/dvdqrngs-projects/v0-intelligent-todo-app

### Manual Deployment

```bash
# Build the project
pnpm build

# Start production server
pnpm start
```

Ensure environment variables are set in your hosting platform.

---

## Browser Compatibility

### Supported Browsers
- Chrome 90+
- Edge 90+
- Safari 15+
- Firefox 88+

### Voice Recognition Support
- Chrome/Edge: Full support via Web Speech API
- Safari: Partial support (WebKit Speech API)
- Firefox: Limited/no support

### Progressive Enhancement
- Voice input gracefully degrades to text-only
- Core functionality works without speech recognition

---

## Known Limitations

1. **No Data Persistence**: Todos are stored in React state and lost on page refresh. Consider adding localStorage or database integration.

2. **No User Authentication**: Single-user experience. Multi-user support would require auth and database.

3. **AI Rate Limits**: OpenAI API has rate limits. Consider implementing request queuing or caching.

4. **Build Warnings Ignored**: TypeScript and ESLint errors are ignored during builds (see `next.config.mjs`).

5. **No Offline Support**: Requires internet connection for AI processing.

6. **Limited Error Recovery**: Failed AI requests show generic error messages.

---

## Future Enhancements

### Potential Features
- [ ] Local storage persistence
- [ ] User authentication (NextAuth.js)
- [ ] Database integration (PostgreSQL, MongoDB)
- [ ] Task sharing and collaboration
- [ ] Recurring tasks
- [ ] Task dependencies
- [ ] Analytics and insights
- [ ] Export/import functionality
- [ ] Mobile app (React Native)
- [ ] Calendar integration
- [ ] Email reminders
- [ ] Search and filtering
- [ ] Bulk operations
- [ ] Undo/redo functionality
- [ ] Dark/light theme toggle UI

### Technical Improvements
- [ ] Add unit tests (Jest, React Testing Library)
- [ ] Add E2E tests (Playwright, Cypress)
- [ ] Implement proper error boundaries
- [ ] Add request caching
- [ ] Optimize bundle size
- [ ] Add performance monitoring
- [ ] Enable build error checking
- [ ] Add CI/CD pipeline
- [ ] Implement rate limiting
- [ ] Add request retries with exponential backoff

---

## License

This project was created with [v0.app](https://v0.app) and is deployed on Vercel.

---

## Support and Contact

For issues and questions:
- GitHub Repository: See project README
- v0.app Project: https://v0.app/chat/projects/CTrA6HhwTJ9
- Vercel Deployment: https://vercel.com/dvdqrngs-projects/v0-intelligent-todo-app

---

**Documentation Version**: 1.0.0
**Last Updated**: 2025-11-18
**Generated By**: Claude Code Review
