"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { MergeButton } from "./merge-button"
import { MergeDialog } from "./merge-dialog"
import { TodoSidebar } from "./todo-sidebar"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { Separator as ShadcnSeparator } from "./ui/separator"
import { StarIcon, LightningIcon, MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import { electronDB } from "@/lib/electron/database"
import type { Todo, Title, Separator, BlockItem } from "@/lib/types"
import type { SimilarTaskGroup } from "@/lib/find-similar-tasks"

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [titles, setTitles] = useState<Title[]>([])
  const [separators, setSeparators] = useState<Separator[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [mergeGroups, setMergeGroups] = useState<SimilarTaskGroup[]>([])
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)
  const [showAiInput, setShowAiInput] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const { theme, setTheme } = useTheme()

  // Refs for debouncing database writes
  const todoUpdateTimers = useRef<Record<string, NodeJS.Timeout>>({})
  const titleUpdateTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // Load initial data from Electron database
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [todosData, titlesData, separatorsData] = await Promise.all([
        electronDB.getTodos(),
        electronDB.getTitles(),
        electronDB.getSeparators(),
      ])
      setTodos(todosData)
      setTitles(titlesData)
      setSeparators(separatorsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTodo = useCallback(async (todo: Todo) => {
    setTodos((prev) => [...prev, todo])
    try {
      await electronDB.createTodo(todo)
    } catch (error) {
      console.error('Failed to add todo:', error)
      setTodos((prev) => prev.filter((t) => t.id !== todo.id))
    }
  }, [])

  const handleAddTodos = useCallback(async (newTodos: Todo[]) => {
    setTodos((prev) => [...prev, ...newTodos])
    try {
      await electronDB.createTodos(newTodos)
    } catch (error) {
      console.error('Failed to add todos:', error)
      const newIds = new Set(newTodos.map((t) => t.id))
      setTodos((prev) => prev.filter((t) => !newIds.has(t.id)))
    }
  }, [])

  const handleAddTitle = useCallback(async (title: Title) => {
    setTitles((prev) => [...prev, title])
    try {
      await electronDB.createTitle(title.text)
    } catch (error) {
      console.error('Failed to add title:', error)
      setTitles((prev) => prev.filter((t) => t.id !== title.id))
    }
  }, [])

  const handleUpdateTodo = useCallback((id: string, updates: Partial<Todo>) => {
    // Optimistic update immediately
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo)))

    // Debounce the database write
    if (todoUpdateTimers.current[id]) {
      clearTimeout(todoUpdateTimers.current[id])
    }
    todoUpdateTimers.current[id] = setTimeout(async () => {
      try {
        await electronDB.updateTodo(id, updates)
      } catch (error) {
        console.error('Failed to update todo:', error)
        loadData()
      }
      delete todoUpdateTimers.current[id]
    }, 300)
  }, [])

  // Set up queue manager callback (after handleUpdateTodo is defined)
  useEffect(() => {
    aiQueueManager.setUpdateCallback((todoId, updates) => {
      handleUpdateTodo(todoId, updates)
    })
  }, [handleUpdateTodo])

  const handleUpdateTitle = useCallback((id: string, text: string) => {
    // Optimistic update immediately
    setTitles((prev) => prev.map((title) => (title.id === id ? { ...title, text } : title)))

    // Debounce the database write
    if (titleUpdateTimers.current[id]) {
      clearTimeout(titleUpdateTimers.current[id])
    }
    titleUpdateTimers.current[id] = setTimeout(async () => {
      try {
        await electronDB.updateTitle(id, text)
      } catch (error) {
        console.error('Failed to update title:', error)
        loadData()
      }
      delete titleUpdateTimers.current[id]
    }, 300)
  }, [])

  const handleDeleteTodo = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
    setSelectedTodoId((prev) => (prev === id ? null : prev))
    try {
      await electronDB.deleteTodo(id)
    } catch (error) {
      console.error('Failed to delete todo:', error)
      loadData()
    }
  }, [])

  const handleDeleteTitle = useCallback(async (id: string) => {
    setTitles((prev) => prev.filter((title) => title.id !== id))
    try {
      await electronDB.deleteTitle(id)
    } catch (error) {
      console.error('Failed to delete title:', error)
      loadData()
    }
  }, [])

  const handleAddSeparator = useCallback(async (separator: Separator) => {
    setSeparators((prev) => [...prev, separator])
    try {
      await electronDB.createSeparator()
    } catch (error) {
      console.error('Failed to add separator:', error)
      setSeparators((prev) => prev.filter((s) => s.id !== separator.id))
    }
  }, [])

  const handleDeleteSeparator = useCallback(async (id: string) => {
    setSeparators((prev) => prev.filter((sep) => sep.id !== id))
    try {
      await electronDB.deleteSeparator(id)
    } catch (error) {
      console.error('Failed to delete separator:', error)
      loadData()
    }
  }, [])

  const handleToggleTodo = useCallback(async (id: string) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)))
    try {
      await electronDB.toggleTodo(id)
    } catch (error) {
      console.error('Failed to toggle todo:', error)
      loadData()
    }
  }, [])

  const handleSelectTodo = useCallback((id: string) => {
    setSelectedTodoId((prev) => (prev === id ? null : id))
  }, [])

  const handleReorderItems = useCallback(async (reorderedItems: BlockItem[]) => {
    const now = Date.now()
    const updatedTodos: Todo[] = []
    const updatedTitles: Title[] = []
    const updatedSeparators: Separator[] = []

    for (let i = 0; i < reorderedItems.length; i++) {
      const item = reorderedItems[i]
      const newCreatedAt = new Date(now + i).toISOString()

      if ('completed' in item) {
        updatedTodos.push({ ...item, createdAt: newCreatedAt })
      } else if ('text' in item) {
        updatedTitles.push({ ...item, createdAt: newCreatedAt })
      } else {
        updatedSeparators.push({ ...item, createdAt: newCreatedAt })
      }
    }

    // Apply optimistic updates immediately
    setTodos(updatedTodos)
    setTitles(updatedTitles)
    setSeparators(updatedSeparators)

    // Persist to database
    try {
      await Promise.all(
        reorderedItems.map((item, i) => {
          const newCreatedAt = new Date(now + i).toISOString()

          if ('completed' in item) {
            return electronDB.updateTodo(item.id, { createdAt: newCreatedAt })
          } else if ('text' in item) {
            return electronDB.updateTitleCreatedAt(item.id, newCreatedAt)
          } else {
            return electronDB.updateSeparatorCreatedAt(item.id, newCreatedAt)
          }
        })
      )
    } catch (error) {
      console.error('Failed to persist reorder:', error)
      loadData()
    }
  }, [])

  const handleMergeGroupsFound = useCallback((groups: SimilarTaskGroup[]) => {
    setMergeGroups(groups)
    setShowMergeDialog(true)
  }, [])

  const handleMerge = useCallback(async (groupsToMerge: SimilarTaskGroup[]) => {
    for (const group of groupsToMerge) {
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

      try {
        await Promise.all(
          group.taskIds.map(id => electronDB.deleteTodo(id))
        )
        await electronDB.createTodo(mergedTodo)
        setTodos((prev) => [
          ...prev.filter((todo) => !group.taskIds.includes(todo.id)),
          mergedTodo
        ])
      } catch (error) {
        console.error('Failed to merge todos:', error)
        loadData()
      }
    }
  }, [])

  const selectedTodo = todos.find((t) => t.id === selectedTodoId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-sm text-muted-foreground">Loading your notes...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-screen bg-background">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="shrink-0 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto max-w-4xl px-4 md:px-8 h-full flex items-center">
              <div className="flex items-center gap-2 w-full">
                <h1 className="text-sm font-medium">Notes List</h1>
                <div className="flex-1" />
                <Button
                  variant={showAiInput ? "default" : "outline"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowAiInput(!showAiInput)}
                  title={showAiInput ? "Hide AI Input" : "Show AI Input"}
                >
                  <LightningIcon size={14} weight="fill" />
                </Button>
                <Button
                  variant={showMetadata ? "default" : "outline"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowMetadata(!showMetadata)}
                  title={showMetadata ? "Hide metadata" : "Show metadata"}
                >
                  <StarIcon size={14} weight="fill" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? (
                    <SunIcon size={14} weight="fill" />
                  ) : (
                    <MoonIcon size={14} weight="fill" />
                  )}
                </Button>
                <ShadcnSeparator orientation="vertical" className="h-5" />
                <MergeButton todos={todos} onMergeGroupsFound={handleMergeGroupsFound} />
              </div>
            </div>
          </header>

          {/* Scrollable Content */}
          <ScrollArea className="flex-1">
            <main className="mx-auto max-w-4xl px-4 md:px-8 py-6">
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
                onReorderItems={handleReorderItems}
                showMetadata={showMetadata}
              />
            </main>
          </ScrollArea>

          {/* AI Input */}
          <TodoInput
            existingTodos={todos}
            onAddTodos={handleAddTodos}
            onUpdateTodo={handleUpdateTodo}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            isVisible={showAiInput}
            onToggleVisibility={() => setShowAiInput(!showAiInput)}
          />
        </div>

        {/* Sidebar */}
        <TodoSidebar selectedTodo={selectedTodo} allTodos={todos} onUpdateTodo={handleUpdateTodo} />
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
