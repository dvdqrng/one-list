export interface Todo {
  id: string
  title: string
  details?: string
  completed: boolean
  priority?: "low" | "medium" | "high"
  dueDate?: string
  category?: string
  createdAt: string
  aiProcessingStatus?: "pending" | "processing" | "enhanced" | "failed"
  groupTitleId?: string // ID of the title this todo belongs to
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
  return [...items].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

/**
 * Merge todos, titles, and separators into a sorted array
 */
export function mergeBlockItems(
  todos: Todo[],
  titles: Title[],
  separators: Separator[]
): BlockItem[] {
  return sortBlockItems([...todos, ...titles, ...separators])
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
