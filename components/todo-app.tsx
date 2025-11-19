"use client"

import { useState, useEffect } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { MergeButton } from "./merge-button"
import { MergeDialog } from "./merge-dialog"
import { TodoList } from "./todo-list"
import { TodoSidebar } from "./todo-sidebar"
import { Button } from "./ui/button"
import { StarIcon, LightningIcon, MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import { electronDB, isElectron } from "@/lib/electron/database"
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
  const [isLoading, setIsLoading] = useState(true)
  const { theme, setTheme } = useTheme()

  // Load initial data from Electron database
  useEffect(() => {
    loadData()
  }, [])

  // Set up queue manager callback
  useEffect(() => {
    aiQueueManager.setUpdateCallback((todoId, updates) => {
      handleUpdateTodo(todoId, updates)
    })
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      console.log('Loading data... window.electronDB =', typeof window.electronDB)

      // Wait for electronDB to be available (with retry logic)
      const maxRetries = 10
      let retries = 0
      while (!window.electronDB && retries < maxRetries) {
        console.log(`Waiting for electronDB... (${retries + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, 200))
        retries++
      }

      if (!window.electronDB) {
        console.error('electronDB not available after retries!')
        setIsLoading(false)
        return
      }

      console.log('electronDB is ready!')
      const [todosData, titlesData, separatorsData] = await Promise.all([
        electronDB.getTodos(),
        electronDB.getTitles(),
        electronDB.getSeparators(),
      ])
      console.log('Loaded data:', { todos: todosData.length, titles: titlesData.length, separators: separatorsData.length })
      setTodos(todosData)
      setTitles(titlesData)
      setSeparators(separatorsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTodo = async (todo: Todo) => {
    try {
      await electronDB.createTodo(todo)
      // Reload data to get the created todo
      await loadData()
    } catch (error) {
      console.error('Failed to add todo:', error)
      // Optimistic update fallback
      setTodos((prev) => [...prev, todo])
    }
  }

  const handleAddTodos = async (newTodos: Todo[]) => {
    try {
      await electronDB.createTodos(newTodos)
      // Reload data to get the created todos
      await loadData()
    } catch (error) {
      console.error('Failed to add todos:', error)
      // Optimistic update fallback
      setTodos((prev) => [...prev, ...newTodos])
    }
  }

  const handleAddTitle = async (title: Title) => {
    try {
      await electronDB.createTitle(title.text)
      // Reload data to get the created title
      await loadData()
    } catch (error) {
      console.error('Failed to add title:', error)
      // Optimistic update fallback
      setTitles((prev) => [...prev, title])
    }
  }

  const handleUpdateTodo = async (id: string, updates: Partial<Todo>) => {
    try {
      // Optimistic update
      setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo)))
      await electronDB.updateTodo(id, updates)
    } catch (error) {
      console.error('Failed to update todo:', error)
      // Revert on error
      loadData()
    }
  }

  const handleUpdateTitle = async (id: string, text: string) => {
    try {
      // Optimistic update
      setTitles((prev) => prev.map((title) => (title.id === id ? { ...title, text } : title)))
      await electronDB.updateTitle(id, text)
    } catch (error) {
      console.error('Failed to update title:', error)
      // Revert on error
      loadData()
    }
  }

  const handleDeleteTodo = async (id: string) => {
    try {
      // Optimistic update
      setTodos((prev) => prev.filter((todo) => todo.id !== id))
      if (selectedTodoId === id) {
        setSelectedTodoId(null)
      }
      await electronDB.deleteTodo(id)
    } catch (error) {
      console.error('Failed to delete todo:', error)
      // Revert on error
      loadData()
    }
  }

  const handleDeleteTitle = async (id: string) => {
    try {
      // Optimistic update
      setTitles((prev) => prev.filter((title) => title.id !== id))
      await electronDB.deleteTitle(id)
    } catch (error) {
      console.error('Failed to delete title:', error)
      // Revert on error
      loadData()
    }
  }

  const handleAddSeparator = async (separator: Separator) => {
    try {
      await electronDB.createSeparator()
      // Reload data to get the created separator
      await loadData()
    } catch (error) {
      console.error('Failed to add separator:', error)
      // Optimistic update fallback
      setSeparators((prev) => [...prev, separator])
    }
  }

  const handleDeleteSeparator = async (id: string) => {
    try {
      // Optimistic update
      setSeparators((prev) => prev.filter((sep) => sep.id !== id))
      await electronDB.deleteSeparator(id)
    } catch (error) {
      console.error('Failed to delete separator:', error)
      // Revert on error
      loadData()
    }
  }

  const handleToggleTodo = async (id: string) => {
    try {
      // Optimistic update
      setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)))
      await electronDB.toggleTodo(id)
    } catch (error) {
      console.error('Failed to toggle todo:', error)
      // Revert on error
      loadData()
    }
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading your notes...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-screen">
        <div className="flex-1 overflow-auto relative">
          <div className="mx-auto max-w-4xl p-4 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-sm font-medium mb-2">Notes List</h1>
                <p className="text-sm text-muted-foreground">
                  Write naturally. Tasks appear automatically as you pause.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={showAiInput ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowAiInput(!showAiInput)}
                  title={showAiInput ? "Hide AI Input" : "Show AI Input"}
                >
                  <LightningIcon size={12} weight="fill" />
                </Button>
                <Button
                  variant={showMetadata ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowMetadata(!showMetadata)}
                  title={showMetadata ? "Hide metadata" : "Show metadata"}
                >
                  <StarIcon size={12} weight="fill" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? (
                    <SunIcon size={12} weight="fill" />
                  ) : (
                    <MoonIcon size={12} weight="fill" />
                  )}
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
        <TodoSidebar
          selectedTodo={selectedTodo}
          onUpdate={handleUpdateTodo}
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
