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
  return !("completed" in block)
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
