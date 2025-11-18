"use client"

import { useState } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { MergeButton } from "./merge-button"
import { MergeDialog } from "./merge-dialog"
import { TodoList } from "./todo-list"
import { TodoSidebar } from "./todo-sidebar"
import { Button } from "./ui/button"
import { Tag } from "lucide-react"
import type { Todo } from "@/lib/types"
import type { SimilarTaskGroup } from "@/lib/find-similar-tasks"

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [mergeGroups, setMergeGroups] = useState<SimilarTaskGroup[]>([])
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showMetadata, setShowMetadata] = useState(true)

  const handleAddTodo = (todo: Todo) => {
    setTodos((prev) => [...prev, todo])
  }

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

  const handleMergeGroupsFound = (groups: SimilarTaskGroup[]) => {
    setMergeGroups(groups)
    setShowMergeDialog(true)
  }

  const handleMerge = (groupsToMerge: SimilarTaskGroup[]) => {
    // Process each group
    groupsToMerge.forEach((group) => {
      // Create the merged todo
      const mergedTodo: Todo = {
        id: crypto.randomUUID(),
        title: group.suggestedMerge.title,
        details: group.suggestedMerge.details,
        completed: false,
        priority: group.suggestedMerge.priority,
        dueDate: group.suggestedMerge.dueDate,
        category: group.suggestedMerge.category,
        createdAt: new Date().toISOString(),
      }

      // Remove the old todos
      setTodos((prev) => prev.filter((todo) => !group.taskIds.includes(todo.id)))

      // Add the merged todo
      setTodos((prev) => [...prev, mergedTodo])
    })
  }

  const selectedTodo = todos.find((t) => t.id === selectedTodoId)

  return (
    <>
      <div className="flex h-screen">
        <div className="flex-1 overflow-auto pb-20">
          <div className="mx-auto max-w-4xl p-4 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-sm font-medium mb-2">Notes List</h1>
                <p className="text-sm text-muted-foreground">
                  Write naturally. Tasks appear automatically as you pause.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showMetadata ? "default" : "outline"}
                  size="icon"
                  onClick={() => setShowMetadata(!showMetadata)}
                  title={showMetadata ? "Hide metadata" : "Show metadata"}
                >
                  <Tag className="h-4 w-4" />
                </Button>
                <MergeButton todos={todos} onMergeGroupsFound={handleMergeGroupsFound} />
              </div>
            </div>

            <TodoTextEditor
              todos={todos}
              onAddTodo={handleAddTodo}
              onUpdateTodo={handleUpdateTodo}
              onDeleteTodo={handleDeleteTodo}
              onToggleTodo={handleToggleTodo}
              onSelectTodo={handleSelectTodo}
              selectedTodoId={selectedTodoId}
              showMetadata={showMetadata}
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

      <MergeDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        groups={mergeGroups}
        todos={todos}
        onMerge={handleMerge}
      />
    </>
  )
}
