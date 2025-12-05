export type TodoStatus = "due" | "in-progress" | "done"
export type ItemType = "todo" | "title" | "separator"
export type Priority = "low" | "medium" | "high"
export type AIProcessingStatus = "pending" | "processing" | "enhanced" | "failed"

// ============================================
// Unified Item Type - Single source of truth
// ============================================

export interface Item {
  id: string
  type: ItemType
  position: number // Explicit ordering
  parentId?: string // Parent project (title) ID - null means no project

  // Todo-specific fields
  title?: string
  details?: string
  completed?: boolean
  status?: TodoStatus
  priority?: Priority
  dueDate?: string
  category?: string
  indent?: number // Indentation level (0-3) for sub-tasks
  isNow?: boolean // Mark as current focus item for "Now" group
  aiProcessingStatus?: AIProcessingStatus

  // Title-specific fields (project name)
  text?: string

  // Metadata
  createdAt: string
  updatedAt?: string
}

// Type guards for Item
export function isTodo(item: Item): boolean {
  return item.type === "todo"
}

export function isTitle(item: Item): boolean {
  return item.type === "title"
}

export function isSeparator(item: Item): boolean {
  return item.type === "separator"
}

// ============================================
// View Types - Clean interfaces for components
// ============================================

/**
 * Todo view type - used by components for cleaner props
 * Converted from Item via itemToTodo()
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
  aiProcessingStatus?: AIProcessingStatus
  groupTitleId?: string
  indent?: number
  isNow?: boolean
  project?: string
}

/**
 * Title view type - used by components for cleaner props
 * Converted from Item via itemToTitle()
 */
export interface Title {
  id: string
  text: string
  createdAt: string
}

/**
 * Separator view type
 */
export interface Separator {
  id: string
  createdAt: string
}

// ============================================
// Conversion utilities (Item <-> View types)
// ============================================

export function itemToTodo(item: Item, allItems?: Item[]): Todo | null {
  if (item.type !== "todo") return null

  // Derive project name if allItems provided
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
    aiProcessingStatus: item.aiProcessingStatus,
    indent: item.indent,
    isNow: item.isNow,
    project,
  }
}

export function itemToTitle(item: Item): Title | null {
  if (item.type !== "title") return null
  return {
    id: item.id,
    text: item.text || "",
    createdAt: item.createdAt,
  }
}

// ============================================
// Sorting and grouping utilities
// ============================================

export function sortItemsByPosition(items: Item[]): Item[] {
  if (!items || !Array.isArray(items)) return []
  return [...items].sort((a, b) => a.position - b.position)
}

/**
 * Derive project name for a todo based on its position relative to titles
 */
export function deriveProjectForItem(item: Item, allItems: Item[]): string | undefined {
  if (item.type !== "todo") return undefined

  const sortedItems = sortItemsByPosition(allItems)
  const itemIndex = sortedItems.findIndex(i => i.id === item.id)

  // Look backwards to find the nearest title
  for (let i = itemIndex - 1; i >= 0; i--) {
    const prevItem = sortedItems[i]
    if (prevItem.type === "separator") {
      // Hit a separator - no project
      return undefined
    }
    if (prevItem.type === "title") {
      return prevItem.text
    }
  }

  return undefined
}

// ============================================
// View Mode types
// ============================================

export type ViewMode = "list" | "kanban"
export type KanbanGroupBy = "dueDate" | "priority" | "category" | "project" | "status"

// ============================================
// Grouping types
// ============================================

export type GroupBy = "position" | "dueDate" | "priority" | "category"

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
