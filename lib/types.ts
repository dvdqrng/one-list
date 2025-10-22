export interface Todo {
  id: string
  title: string
  details?: string
  completed: boolean
  priority?: "low" | "medium" | "high"
  dueDate?: string
  category?: string
  createdAt: string
}

export interface TodoUpdate {
  id: string
  updates: Partial<Todo>
}

export interface ProcessResult {
  newTodos: Todo[]
  updates: TodoUpdate[]
}
