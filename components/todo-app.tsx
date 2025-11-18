"use client"

import { useState } from "react"
import { TodoInput } from "./todo-input"
import { TodoList } from "./todo-list"
import { TodoSidebar } from "./todo-sidebar"
import type { Todo } from "@/lib/types"

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)

  const handleAddTodos = (newTodos: Todo[]) => {
    setTodos((prev) => [...prev, ...newTodos])
  }

  const handleUpdateTodo = (id: string, updates: Partial<Todo>) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo)))
  }

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
    if (selectedTodoId === id) {
      setSelectedTodoId(null)
    }
  }

  const handleToggleTodo = (id: string) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)))
  }

  const handleSelectTodo = (id: string) => {
    setSelectedTodoId(id === selectedTodoId ? null : id)
  }

  const selectedTodo = todos.find((t) => t.id === selectedTodoId)

  return (
    <>
      <div className="flex h-screen">
        <div className="flex-1 overflow-auto pb-40">
          <div className="mx-auto max-w-4xl p-4 md:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-4xl font-bold tracking-tight text-balance mb-2">Intelligent Todo</h1>
              <p className="text-muted-foreground text-pretty">
                Add tasks naturally. AI understands and organizes them for you.
              </p>
            </div>
            <TodoList
              todos={todos}
              onToggle={handleToggleTodo}
              onDelete={handleDeleteTodo}
              onUpdate={handleUpdateTodo}
              onSelect={handleSelectTodo}
              selectedTodoId={selectedTodoId}
            />
          </div>
        </div>
        <TodoSidebar selectedTodo={selectedTodo} onUpdate={handleUpdateTodo} />
      </div>
      <TodoInput
        existingTodos={todos}
        onAddTodos={handleAddTodos}
        onUpdateTodo={handleUpdateTodo}
        isProcessing={isProcessing}
        setIsProcessing={setIsProcessing}
      />
    </>
  )
}
