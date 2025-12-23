export type TodoStatus = "due" | "in-progress" | "done" | "archived"
export type ItemType = "todo" | "title" | "separator"
export type Priority = "low" | "medium" | "high"
export type AIProcessingStatus = "pending" | "processing" | "enhanced" | "failed"

// ============================================
// Unified Item Type - Single source of truth
// ============================================

/**
 * Item is the core data type. All items (todos, titles, separators)
 * are stored as Item objects with optional type-specific fields.
 *
 * This is the ONLY type used for storage and state management.
 */
export interface Item {
  id: string
  type: ItemType
  position: number
  parentId?: string

  // Todo-specific fields
  title?: string
  details?: string
  completed?: boolean
  status?: TodoStatus
  priority?: Priority
  dueDate?: string
  category?: string
  indent?: number
  isNow?: boolean
  aiProcessingStatus?: AIProcessingStatus

  // Title-specific fields
  text?: string

  // Metadata
  createdAt: string
  updatedAt?: string
  completedAt?: string
}

// ============================================
// Type Guards
// ============================================

export function isTodo(item: Item): item is Item & { type: "todo" } {
  return item.type === "todo"
}

export function isTitle(item: Item): item is Item & { type: "title" } {
  return item.type === "title"
}

export function isSeparator(item: Item): item is Item & { type: "separator" } {
  return item.type === "separator"
}

// ============================================
// View Types - For component props
// These provide cleaner interfaces for UI components.
// Use Item for storage/state, these for component props.
// ============================================

/**
 * Todo - view type for component props
 * Provides a cleaner interface than Item for UI components.
 */
export interface Todo {
  id: string
  title: string
  details?: string
  completed: boolean
  status?: TodoStatus
  priority?: Priority
  dueDate?: string
  category?: string
  createdAt: string
  completedAt?: string
  aiProcessingStatus?: AIProcessingStatus
  groupTitleId?: string
  indent?: number
  isNow?: boolean
  project?: string // Derived field
}

/**
 * Title - view type for component props
 */
export interface Title {
  id: string
  text: string
  createdAt: string
}

/**
 * Separator - view type for component props
 */
export interface Separator {
  id: string
  createdAt: string
}

// ============================================
// Conversion utilities
// ============================================

/**
 * Convert Item to Todo view type for component props
 */
export function itemToTodo(item: Item, allItems?: Item[]): Todo | null {
  if (item.type !== "todo") return null

  let project: string | undefined
  if (allItems) {
    project = deriveProjectForItem(item, allItems)
  }

  return {
    id: item.id,
    title: item.title || "",
    details: item.details,
    completed: item.completed || false,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    category: item.category,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    aiProcessingStatus: item.aiProcessingStatus,
    indent: item.indent,
    isNow: item.isNow,
    project,
  }
}

/**
 * Convert Item to Title view type for component props
 */
export function itemToTitle(item: Item): Title | null {
  if (item.type !== "title") return null
  return {
    id: item.id,
    text: item.text || "",
    createdAt: item.createdAt,
  }
}

/**
 * Convert Todo back to Item (for updates)
 */
export function todoToItem(todo: Todo): Partial<Item> {
  return {
    id: todo.id,
    type: "todo",
    title: todo.title,
    details: todo.details,
    completed: todo.completed,
    status: todo.status,
    priority: todo.priority,
    dueDate: todo.dueDate,
    category: todo.category,
    indent: todo.indent,
    isNow: todo.isNow,
    completedAt: todo.completedAt,
    aiProcessingStatus: todo.aiProcessingStatus,
  }
}

// ============================================
// Utility functions
// ============================================

export function sortItemsByPosition(items: Item[]): Item[] {
  if (!items || !Array.isArray(items)) return []
  return [...items].sort((a, b) => a.position - b.position)
}

/**
 * Derive project name for a todo based on position relative to titles
 */
export function deriveProjectForItem(item: Item, allItems: Item[]): string | undefined {
  if (item.type !== "todo") return undefined

  const sortedItems = sortItemsByPosition(allItems)
  const itemIndex = sortedItems.findIndex(i => i.id === item.id)

  for (let i = itemIndex - 1; i >= 0; i--) {
    const prevItem = sortedItems[i]
    if (prevItem.type === "separator") return undefined
    if (prevItem.type === "title") return prevItem.text
  }

  return undefined
}

/**
 * Get the title (project) that a todo belongs to
 */
export function getProjectForTodo(todoId: string, items: Item[]): Item | undefined {
  const sortedItems = sortItemsByPosition(items)
  const itemIndex = sortedItems.findIndex(i => i.id === todoId)

  for (let i = itemIndex - 1; i >= 0; i--) {
    const prevItem = sortedItems[i]
    if (prevItem.type === "separator") return undefined
    if (prevItem.type === "title") return prevItem
  }

  return undefined
}

// ============================================
// View Mode types
// ============================================

export type ViewMode = "list" | "kanban"
export type ListGroupBy = "position" | "dueDate"
export type KanbanGroupBy = "dueDate" | "priority" | "category" | "project" | "status"

// ============================================
// AI Processing Types
// ============================================

export interface TodoUpdate {
  id: string
  updates: Partial<Todo>
}

export interface ProcessResult {
  newTodos: Todo[]
  updates: TodoUpdate[]
}

export interface AIProcessingJob {
  id: string
  todoId: string
  inputText: string
  type: "enhance" | "create"
  createdAt: number
  retryCount: number
}

export interface QueueConfig {
  batchSize: number
  batchDelayMs: number
  maxRetries: number
  processingTimeoutMs: number
}

// ============================================
// Changelog / Review Types
// ============================================

export type ChangeType = "add" | "update" | "delete" | "merge" | "complete" | "uncomplete"

export interface ProposedChange {
  id: string
  type: ChangeType
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

export interface ChangelogSession {
  id: string
  source: "ai-input" | "merge-button" | "manual"
  inputText?: string
  changes: ProposedChange[]
  createdAt: string
}
