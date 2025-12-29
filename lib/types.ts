export type TodoStatus = "due" | "in-progress" | "done" | "archived"
export type ItemType = "todo" | "separator"
export type Priority = "low" | "medium" | "high"
export type AIProcessingStatus = "pending" | "processing" | "enhanced" | "failed"

// ============================================
// Unified Item Type - Single source of truth
// ============================================

/**
 * Item is the core data type.
 */
export interface Item {
  id: string
  type: ItemType
  position: number
  parentId?: string // Maintained for structure, but indent visualizes it

  // Todo-specific fields (now applicable to all items)
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

  // Metadata
  createdAt: string
  updatedAt?: string
  completedAt?: string
}

// ============================================
// Type Guards
// ============================================

export function isTodo(item: Item): boolean {
  // Backwards compatibility: treat old "title" items as todos
  return item.type === "todo" || (item as any).type === "title"
}

export function isSeparator(item: Item): item is Item & { type: "separator" } {
  return item.type === "separator"
}

// ============================================
// View Types
// ============================================

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
  indent?: number
  isNow?: boolean
  // Project is no longer a distinct entity type
}

export interface Separator {
  id: string
  createdAt: string
}

// ============================================
// Conversion utilities
// ============================================

export function itemToTodo(item: Item): Todo | null {
  if (!isTodo(item)) return null

  return {
    id: item.id,
    title: item.title || (item as any).text || "", // Handle legacy title items
    details: item.details,
    completed: item.completed || false,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    category: item.category,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    aiProcessingStatus: item.aiProcessingStatus,
    indent: item.indent || 0,
    isNow: item.isNow,
  }
}

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

// ============================================
// View Mode types
// ============================================

export type ViewMode = "list" | "kanban"
export type ListGroupBy = "position" | "dueDate"
export type KanbanGroupBy = "dueDate" | "priority" | "category" | "status"

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
