"use client"

import { useState, useEffect } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { MergeButton } from "./merge-button"
import { MergeDialog } from "./merge-dialog"
import { TodoList } from "./todo-list"
import { TodoSidebar } from "./todo-sidebar"
import { Button } from "./ui/button"
import { Tag, Sparkles } from "lucide-react"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import type { Todo, Title, Separator } from "@/lib/types"
import type { SimilarTaskGroup } from "@/lib/find-similar-tasks"

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [titles, setTitles] = useState<Title[]>([])
  const [separators, setSeparators] = useState<Separator[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [mergeGroups, setMergeGroups] = useState<SimilarTaskGroup[]>([])
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showMetadata, setShowMetadata] = useState(true)
  const [showAiInput, setShowAiInput] = useState(true)

  // Set up queue manager callback
  useEffect(() => {
    aiQueueManager.setUpdateCallback((todoId, updates) => {
      handleUpdateTodo(todoId, updates)
    })
  }, [])

  const handleAddTodo = (todo: Todo) => {
    setTodos((prev) => [...prev, todo])
  }

  const handleAddTodos = (newTodos: Todo[]) => {
    setTodos((prev) => [...prev, ...newTodos])
  }

  const handleAddTitle = (title: Title) => {
    setTitles((prev) => [...prev, title])
  }

  const handleUpdateTodo = (id: string, updates: Partial<Todo>) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo)))
  }

  const handleUpdateTitle = (id: string, text: string) => {
    setTitles((prev) => prev.map((title) => (title.id === id ? { ...title, text } : title)))
  }

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
    if (selectedTodoId === id) {
      setSelectedTodoId(null)
    }
  }

  const handleDeleteTitle = (id: string) => {
    setTitles((prev) => prev.filter((title) => title.id !== id))
  }

  const handleAddSeparator = (separator: Separator) => {
    setSeparators((prev) => [...prev, separator])
  }

  const handleDeleteSeparator = (id: string) => {
    setSeparators((prev) => prev.filter((sep) => sep.id !== id))
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
                  variant={showAiInput ? "default" : "outline"}
                  size="icon"
                  onClick={() => setShowAiInput(!showAiInput)}
                  title={showAiInput ? "Hide AI Input" : "Show AI Input"}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
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
              titles={titles}
              separators={separators}
              onAddTodo={handleAddTodo}
              onAddTitle={handleAddTitle}
              onAddSeparator={handleAddSeparator}
              onUpdateTodo={handleUpdateTodo}
              onUpdateTitle={handleUpdateTitle}
              onDeleteTodo={handleDeleteTodo}
              onDeleteTitle={handleDeleteTitle}
              onDeleteSeparator={handleDeleteSeparator}
              onToggleTodo={handleToggleTodo}
              onSelectTodo={handleSelectTodo}
              selectedTodoId={selectedTodoId}
              showMetadata={showMetadata}
            />
          </div>
        </div>
        <TodoSidebar
          selectedTodo={selectedTodo}
          onUpdate={handleUpdateTodo}
          showAiInput={showAiInput}
          aiInputSection={
            <TodoInput
              existingTodos={todos}
              onAddTodos={handleAddTodos}
              onUpdateTodo={handleUpdateTodo}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
            />
          }
        />
      </div>

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
