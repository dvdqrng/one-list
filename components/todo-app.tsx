"use client"

import { useState } from "react"
import { TodoInput } from "./todo-input"
import { TodoList } from "./todo-list"
import type { Todo } from "@/lib/types"

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const handleAddTodos = (newTodos: Todo[]) => {
    setTodos((prev) => [...prev, ...newTodos])
  }

  const handleUpdateTodo = (id: string, updates: Partial<Todo>) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo)))
  }

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
  }

  const handleToggleTodo = (id: string) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)))
  }

  return (
    <div className="space-y-6">
      <TodoInput
        existingTodos={todos}
        onAddTodos={handleAddTodos}
        onUpdateTodo={handleUpdateTodo}
        isProcessing={isProcessing}
        setIsProcessing={setIsProcessing}
      />
      <TodoList todos={todos} onToggle={handleToggleTodo} onDelete={handleDeleteTodo} onUpdate={handleUpdateTodo} />
    </div>
  )
}
