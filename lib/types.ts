export type TodoStatus = "due" | "in-progress" | "done"

export interface Todo {
  id: string
  title: string
  details?: string
  completed: boolean
  status?: TodoStatus
  priority?: "low" | "medium" | "high"
  dueDate?: string
  category?: string
  createdAt: string
  aiProcessingStatus?: "pending" | "processing" | "enhanced" | "failed"
  groupTitleId?: string // ID of the title this todo belongs to
  indent?: number // Indentation level (0-3) for sub-tasks
  project?: string // Project name derived from the parent Title's text
}

export interface Title {
  id: string
  text: string
  createdAt: string
}

export interface Separator {
  id: string
  createdAt: string
}

export type BlockItem = Todo | Title | Separator

export function isTodo(block: BlockItem): block is Todo {
  return "completed" in block
}

export function isTitle(block: BlockItem): block is Title {
  return "text" in block && !("completed" in block)
}

export function isSeparator(block: BlockItem): block is Separator {
  return !("completed" in block) && !("text" in block)
}

/**
 * Sort block items by createdAt timestamp
 */
export function sortBlockItems(items: BlockItem[]): BlockItem[] {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    // Handle invalid dates by putting them at the end
    if (isNaN(aTime) && isNaN(bTime)) return 0
    if (isNaN(aTime)) return 1
    if (isNaN(bTime)) return -1
    return aTime - bTime
  })
}

/**
 * Merge todos, titles, and separators into a sorted array
 */
export function mergeBlockItems(
  todos: Todo[],
  titles: Title[],
  separators: Separator[]
): BlockItem[] {
  const allItems = [...todos, ...titles, ...separators]
  // Deduplicate by ID to prevent React key errors
  const seen = new Set<string>()
  const uniqueItems = allItems.filter(item => {
    if (seen.has(item.id)) {
      console.warn(`Duplicate item ID found: ${item.id}`)
      return false
    }
    seen.add(item.id)
    return true
  })
  return sortBlockItems(uniqueItems)
}

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
  // For "add": the new todo to create
  newTodo?: Todo
  // For "update"/"complete"/"uncomplete": the existing todo and proposed updates
  existingTodo?: Todo
  updates?: Partial<Todo>
  // For "merge": group of todos being merged
  mergeGroup?: {
    sourceTodos: Todo[]
    mergedResult: Todo
    similarityReason: string
    confidenceScore: number
  }
  // For "delete": the todo to delete
  deleteTodo?: Todo
  // AI reasoning for this change
  reason?: string
}

export interface ChangelogSession {
  id: string
  source: "ai-input" | "merge-button" | "manual"
  inputText?: string
  changes: ProposedChange[]
  createdAt: string
}
