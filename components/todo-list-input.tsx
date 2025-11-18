"use client"

import { useState, useCallback, useEffect } from "react"
import { TodoRow } from "@/components/todo-row"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import type { Todo } from "@/lib/types"

interface TodoListInputProps {
  todos: Todo[]
  onAddTodo: (todo: Todo) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onDeleteTodo: (id: string) => void
  onToggleTodo: (id: string) => void
  onSelectTodo: (id: string) => void
  selectedTodoId: string | null
}

export function TodoListInput({
  todos,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onToggleTodo,
  onSelectTodo,
  selectedTodoId,
}: TodoListInputProps) {
  // Track draft (new, unprocessed) rows
  const [draftRow, setDraftRow] = useState({ id: crypto.randomUUID(), value: "" })

  const processNewTodo = useCallback(
    async (id: string, value: string) => {
      if (!value.trim()) return

      // Create todo immediately without AI processing
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        title: value, // Use raw input as title initially
        completed: false,
        createdAt: new Date().toISOString(),
        aiProcessingStatus: "pending",
      }

      // Add the todo immediately
      onAddTodo(newTodo)

      // Clear draft row
      setDraftRow({ id: crypto.randomUUID(), value: "" })

      // Enqueue for AI enhancement
      aiQueueManager.enqueue({
        todoId: newTodo.id,
        inputText: value,
        type: "enhance",
      })
    },
    [onAddTodo]
  )

  const handleDraftChange = (newValue: string) => {
    setDraftRow((prev) => ({ ...prev, value: newValue }))
  }

  const handleDraftEnter = () => {
    if (draftRow.value.trim()) {
      processNewTodo(draftRow.id, draftRow.value)
    } else {
      // Just create a new draft row
      setDraftRow({ id: crypto.randomUUID(), value: "" })
    }
  }

  const handleTodoChange = (id: string, newValue: string) => {
    // Update the todo title in real-time
    onUpdateTodo(id, { title: newValue })
  }

  const handleTodoEnter = (id: string) => {
    // Insert a new draft row after this todo
    // For now, just focus the draft at the bottom
  }

  const handleDraftBackspaceEmpty = () => {
    // If draft is empty and there are todos, do nothing (can't delete draft)
    // User can just ignore the empty draft
  }

  const handleTodoBackspaceEmpty = (id: string) => {
    // Delete the todo
    onDeleteTodo(id)
  }

  const handleTodoDelete = (id: string) => {
    onDeleteTodo(id)
  }

  const handleDraftDelete = () => {
    // Clear the draft value
    setDraftRow((prev) => ({ ...prev, value: "" }))
  }

  return (
    <div className="space-y-1">
      {/* Render all existing todos */}
      {todos.map((todo) => (
        <TodoRow
          key={todo.id}
          value={todo.title}
          onChange={(newValue) => handleTodoChange(todo.id, newValue)}
          onDelete={() => handleTodoDelete(todo.id)}
          onEnter={() => handleTodoEnter(todo.id)}
          onBackspaceEmpty={() => handleTodoBackspaceEmpty(todo.id)}
          isProcessing={todo.aiProcessingStatus === "processing" || todo.aiProcessingStatus === "pending"}
          metadata={{
            priority: todo.priority,
            dueDate: todo.dueDate,
            category: todo.category,
          }}
          completed={todo.completed}
          onToggle={() => onToggleTodo(todo.id)}
          onClick={() => onSelectTodo(todo.id)}
          isSelected={selectedTodoId === todo.id}
        />
      ))}

      {/* Always show one draft row at the bottom */}
      <TodoRow
        key={draftRow.id}
        value={draftRow.value}
        onChange={handleDraftChange}
        onDelete={handleDraftDelete}
        onEnter={handleDraftEnter}
        onBackspaceEmpty={handleDraftBackspaceEmpty}
        isProcessing={false}
        autoFocus={todos.length === 0}
      />
    </div>
  )
}
