import type { Todo, Title, Separator } from "@/lib/types"

// Check if we're running in Electron
export const isElectron = typeof window !== "undefined" && (window as any).electronDB !== undefined

// In-memory fallback for web mode
class WebDatabase {
  private todos: Todo[] = []
  private titles: Title[] = []
  private separators: Separator[] = []

  async getTodos(): Promise<Todo[]> {
    return this.todos
  }

  async getTitles(): Promise<Title[]> {
    return this.titles
  }

  async getSeparators(): Promise<Separator[]> {
    return this.separators
  }

  async createTodo(todo: Todo): Promise<Todo> {
    this.todos.push(todo)
    return todo
  }

  async createTodos(todos: Todo[]): Promise<Todo[]> {
    this.todos.push(...todos)
    return todos
  }

  async createTitle(text: string): Promise<Title> {
    const title: Title = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    }
    this.titles.push(title)
    return title
  }

  async createSeparator(): Promise<Separator> {
    const separator: Separator = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    this.separators.push(separator)
    return separator
  }

  async updateTodo(id: string, updates: Partial<Todo>): Promise<void> {
    const index = this.todos.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.todos[index] = { ...this.todos[index], ...updates }
    }
  }

  async updateTitle(id: string, text: string): Promise<void> {
    const index = this.titles.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.titles[index] = { ...this.titles[index], text }
    }
  }

  async deleteTodo(id: string): Promise<void> {
    this.todos = this.todos.filter((t) => t.id !== id)
  }

  async deleteTitle(id: string): Promise<void> {
    this.titles = this.titles.filter((t) => t.id !== id)
  }

  async deleteSeparator(id: string): Promise<void> {
    this.separators = this.separators.filter((s) => s.id !== id)
  }

  async toggleTodo(id: string): Promise<void> {
    const index = this.todos.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.todos[index].completed = !this.todos[index].completed
    }
  }
}

// Create database instance
const webDB = typeof window !== "undefined" ? new WebDatabase() : null

// Export the database API
export const electronDB = {
  getTodos: async () => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.getTodos()
    }
    return webDB?.getTodos() || []
  },
  getTitles: async () => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.getTitles()
    }
    return webDB?.getTitles() || []
  },
  getSeparators: async () => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.getSeparators()
    }
    return webDB?.getSeparators() || []
  },
  createTodo: async (todo: Todo) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.createTodo(todo)
    }
    return webDB?.createTodo(todo) || todo
  },
  createTodos: async (todos: Todo[]) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.createTodos(todos)
    }
    return webDB?.createTodos(todos) || todos
  },
  createTitle: async (text: string) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.createTitle(text)
    }
    return webDB?.createTitle(text)
  },
  createSeparator: async () => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.createSeparator()
    }
    return webDB?.createSeparator()
  },
  updateTodo: async (id: string, updates: Partial<Todo>) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.updateTodo(id, updates)
    }
    return webDB?.updateTodo(id, updates)
  },
  updateTitle: async (id: string, text: string) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.updateTitle(id, text)
    }
    return webDB?.updateTitle(id, text)
  },
  deleteTodo: async (id: string) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.deleteTodo(id)
    }
    return webDB?.deleteTodo(id)
  },
  deleteTitle: async (id: string) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.deleteTitle(id)
    }
    return webDB?.deleteTitle(id)
  },
  deleteSeparator: async (id: string) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.deleteSeparator(id)
    }
    return webDB?.deleteSeparator(id)
  },
  toggleTodo: async (id: string) => {
    if (isElectron && (window as any).electronDB) {
      return (window as any).electronDB.toggleTodo(id)
    }
    return webDB?.toggleTodo(id)
  },
}
