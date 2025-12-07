"use client"

import React, { useEffect, useCallback } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { TodoKanbanView } from "./todo-kanban-view"
import { MergeButton } from "./merge-button"
import { ChangelogDialog } from "./changelog-dialog"
import { TodoSidebar } from "./todo-sidebar"
import { FocusModeOverlay } from "./focus-mode-overlay"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "./ui/sidebar"
import { TagIcon, LightningIcon, MoonIcon, SunIcon, SidebarSimpleIcon, EyeIcon, EyeSlashIcon, CalendarBlankIcon, ListBulletsIcon, KanbanIcon, CaretDownIcon, CheckSquareIcon, TextTIcon } from "@phosphor-icons/react"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { useTheme } from "next-themes"
import { aiQueueManager } from "@/lib/ai"
import { useStore, useTodos, useSelectedTodo, useSelectedTitle } from "@/lib/store"
import { setFocusTarget } from "@/lib/focus-target"
import { useFocusTimer } from "@/hooks/use-focus-timer"
import { getDateForCategory, type DueDateCategory } from "@/lib/format"
import type { Todo, ProposedChange } from "@/lib/types"
import type { SimilarTaskGroup } from "@/lib/find-similar-tasks"

function CustomSidebarTrigger() {
  const { toggleSidebar, open } = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground"
      onClick={toggleSidebar}
      title={open ? "Collapse sidebar" : "Expand sidebar"}
    >
      <SidebarSimpleIcon className="h-4 w-4" weight={open ? "fill" : "regular"} />
    </Button>
  )
}

export function TodoApp() {
  // Zustand store state and actions
  const {
    items,
    isLoading,
    showMetadata,
    showCompleted,
    listGroupBy,
    viewMode,
    kanbanGroupBy,
    changelogSession,
    showChangelog,
    loadItems,
    updateItem,
    updateItemDebounced,
    toggleItem,
    selectTodo,
    setShowMetadata,
    setShowCompleted,
    setListGroupBy,
    setViewMode,
    setKanbanGroupBy,
    setChangelogSession,
    setShowChangelog,
    applyChanges,
    insertItemAfter,
    deleteItem,
  } = useStore()

  // Derived state from store
  const todos = useTodos()
  const selectedTodo = useSelectedTodo()
  const selectedTitle = useSelectedTitle()

  // Determine current editing mode based on selection
  const editingMode = selectedTitle ? "title" : selectedTodo ? "task" : null

  // Local UI state
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [showAiInput, setShowAiInput] = React.useState(false)
  const [isApplyingChanges, setIsApplyingChanges] = React.useState(false)
  const { theme, setTheme } = useTheme()

  // Focus timer hook
  const { startTimer } = useFocusTimer()

  // Handler for starting focus mode from the Now group
  const handleStartFocus = useCallback(() => {
    startTimer(1500) // 25 minutes
  }, [startTimer])

  // Handler for switching between task and title modes
  const handleModeChange = useCallback((newMode: string) => {
    if (newMode === "task" && selectedTitle) {
      // Convert title to task
      const newId = insertItemAfter(selectedTitle.id, 'todo')
      updateItemDebounced(newId, { title: selectedTitle.text || '' })
      setFocusTarget(newId)
      deleteItem(selectedTitle.id)
    } else if (newMode === "title" && selectedTodo) {
      // Convert task to title
      const newId = insertItemAfter(selectedTodo.id, 'title')
      updateItemDebounced(newId, { text: selectedTodo.title || '' })
      setFocusTarget(newId)
      deleteItem(selectedTodo.id)
    }
  }, [selectedTitle, selectedTodo, insertItemAfter, updateItemDebounced, deleteItem])

  // Load initial data
  useEffect(() => {
    loadItems()
  }, [loadItems])

  // Set up AI queue manager callback
  useEffect(() => {
    aiQueueManager.setUpdateCallback((todoId, updates) => {
      updateItemDebounced(todoId, updates)
    })
  }, [updateItemDebounced])

  // Handlers that wrap store actions with additional logic

  const handleUpdateTodo = useCallback((id: string, updates: Partial<Todo>) => {
    // Convert Todo updates to Item updates and debounce
    updateItemDebounced(id, updates)
  }, [updateItemDebounced])

  const handleUpdateTitle = useCallback((id: string, text: string) => {
    updateItemDebounced(id, { text })
  }, [updateItemDebounced])

  const handleRenameCategory = useCallback(async (oldName: string, newName: string) => {
    // Update all todos with this category
    const todosToUpdate = items.filter(i => i.type === "todo" && i.category === oldName)
    for (const item of todosToUpdate) {
      updateItem(item.id, { category: newName })
    }
  }, [items, updateItem])

  // Use store actions directly for simple operations
  const handleToggleTodo = toggleItem

  const handleSelectTodo = useCallback((id: string) => {
    selectTodo(id)
  }, [selectTodo])

  // Handler for when AI input or merge button proposes changes
  const handleChangesProposed = useCallback((
    changes: ProposedChange[],
    inputText: string,
    source: "ai-input" | "merge-button" = "ai-input"
  ) => {
    setChangelogSession({
      id: crypto.randomUUID(),
      source,
      inputText: source === "ai-input" ? inputText : undefined,
      changes,
      createdAt: new Date().toISOString(),
    })
    setShowChangelog(true)
  }, [setChangelogSession, setShowChangelog])

  // Handler for merge button results - converts to ProposedChange format
  const handleMergeGroupsFound = useCallback((groups: SimilarTaskGroup[]) => {
    const changes: ProposedChange[] = groups.map((group) => {
      const sourceTodos = group.taskIds
        .map((id) => todos.find((t) => t.id === id))
        .filter((t): t is Todo => t !== undefined)

      const mergedResult: Todo = {
        id: crypto.randomUUID(),
        title: group.suggestedMerge.title,
        details: group.suggestedMerge.details,
        completed: false,
        priority: group.suggestedMerge.priority,
        dueDate: group.suggestedMerge.dueDate,
        category: group.suggestedMerge.category,
        createdAt: new Date().toISOString(),
      }

      return {
        id: crypto.randomUUID(),
        type: "merge" as const,
        mergeGroup: {
          sourceTodos,
          mergedResult,
          similarityReason: group.similarityReason,
          confidenceScore: group.confidenceScore,
        },
      }
    })

    handleChangesProposed(changes, "", "merge-button")
  }, [todos, handleChangesProposed])

  // Handler for applying approved changes from the changelog dialog
  const handleApplyChanges = useCallback(async (approvedChanges: ProposedChange[]) => {
    setIsApplyingChanges(true)
    try {
      await applyChanges(approvedChanges)
    } catch (error) {
      console.error('Failed to apply changes:', error)
    } finally {
      setIsApplyingChanges(false)
    }
  }, [applyChanges])

  // Handler for adding a new todo from kanban view
  const handleAddTodoFromKanban = useCallback((columnId: string) => {
    // Determine what field to set based on the kanban groupBy
    const getInitialDataForColumn = (): Partial<Todo> => {
      switch (kanbanGroupBy) {
        case "dueDate":
          if (columnId === "now") {
            return { isNow: true }
          }
          // Use centralized date helper for all due date categories
          const dueDate = getDateForCategory(columnId as DueDateCategory)
          return dueDate ? { dueDate } : {}
        case "priority":
          if (columnId === "none") return {}
          return { priority: columnId as Todo["priority"] }
        case "status":
          if (columnId === "done") return { completed: true }
          return { status: columnId as Todo["status"] }
        case "category":
          if (columnId === "uncategorized") return {}
          return { category: columnId }
        case "project":
          if (columnId === "no-project") return {}
          return { project: columnId }
        default:
          return {}
      }
    }

    // Create the todo with initial data already set - this ensures it appears in the correct column immediately
    const initialData = getInitialDataForColumn()
    insertItemAfter(null, 'todo', initialData)
    // Note: The kanban view will auto-detect the new empty-title todo and start inline editing
  }, [insertItemAfter, kanbanGroupBy])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-sm text-muted-foreground">Loading your notes...</p>
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <SidebarInset>
        {/* Title bar - 44px height, traffic lights (12px) centered at y=16 */}
        <header
          className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 pl-[76px] pr-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Mode selector - only show when an item is selected */}
            {editingMode && (
              <>
                <ToggleGroup
                  type="single"
                  value={editingMode}
                  onValueChange={(value) => value && handleModeChange(value)}
                  size="sm"
                  variant="outline"
                  className="h-7"
                >
                  <ToggleGroupItem value="task" aria-label="Task mode" className="h-7 px-2 text-xs gap-1">
                    <CheckSquareIcon className="h-3.5 w-3.5" weight={editingMode === "task" ? "fill" : "regular"} />
                    Task
                  </ToggleGroupItem>
                  <ToggleGroupItem value="title" aria-label="Title mode" className="h-7 px-2 text-xs gap-1">
                    <TextTIcon className="h-3.5 w-3.5" weight={editingMode === "title" ? "fill" : "regular"} />
                    Title
                  </ToggleGroupItem>
                </ToggleGroup>
                <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
              </>
            )}
            {/* View Mode Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setViewMode(viewMode === "list" ? "kanban" : "list")}
              title={viewMode === "list" ? "Switch to Kanban view" : "Switch to List view"}
            >
              {viewMode === "list" ? (
                <KanbanIcon className="h-4 w-4" weight="regular" />
              ) : (
                <ListBulletsIcon className="h-4 w-4" weight="regular" />
              )}
            </Button>
            {/* Kanban Group By Dropdown - only show in kanban mode */}
            {viewMode === "kanban" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-muted-foreground"
                  >
                    <span className="text-xs capitalize">{kanbanGroupBy === "dueDate" ? "Due Date" : kanbanGroupBy}</span>
                    <CaretDownIcon className="h-3 w-3" weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setKanbanGroupBy("dueDate")}>
                    Due Date
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setKanbanGroupBy("priority")}>
                    Priority
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setKanbanGroupBy("status")}>
                    Status
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setKanbanGroupBy("category")}>
                    Category
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setKanbanGroupBy("project")}>
                    Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setShowCompleted(!showCompleted)}
              title={showCompleted ? "Hide completed tasks" : "Show completed tasks"}
            >
              {showCompleted ? (
                <EyeIcon className="h-4 w-4" weight="regular" />
              ) : (
                <EyeSlashIcon className="h-4 w-4" weight="regular" />
              )}
            </Button>
            {viewMode === "list" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setListGroupBy(listGroupBy === "dueDate" ? "position" : "dueDate")}
                title={listGroupBy === "dueDate" ? "Group by project" : "Group by due date"}
              >
                <CalendarBlankIcon className="h-4 w-4" weight={listGroupBy === "dueDate" ? "fill" : "regular"} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setShowAiInput(!showAiInput)}
              title={showAiInput ? "Hide AI Input" : "Show AI Input"}
            >
              <LightningIcon className="h-4 w-4" weight={showAiInput ? "fill" : "regular"} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setShowMetadata(!showMetadata)}
              title={showMetadata ? "Hide metadata" : "Show metadata"}
            >
              <TagIcon className="h-4 w-4" weight={showMetadata ? "fill" : "regular"} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <SunIcon className="h-4 w-4" weight="regular" />
              ) : (
                <MoonIcon className="h-4 w-4" weight="regular" />
              )}
            </Button>
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <MergeButton todos={todos} onMergeGroupsFound={handleMergeGroupsFound} />
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <CustomSidebarTrigger />
          </div>
        </header>
        <div className="flex flex-1 flex-col">
          <main className={viewMode === "list" ? "flex-1 overflow-auto" : "flex-1 overflow-hidden"}>
            {viewMode === "list" ? (
              <div className="mx-auto max-w-4xl px-4 md:px-8 pb-6">
                <TodoTextEditor onStartFocus={handleStartFocus} />
              </div>
            ) : (
              <div className="h-full">
                <TodoKanbanView
                  items={items}
                  groupBy={kanbanGroupBy}
                  showCompleted={showCompleted}
                  showMetadata={showMetadata}
                  onUpdateTodo={handleUpdateTodo}
                  onToggleTodo={handleToggleTodo}
                  onSelectTodo={handleSelectTodo}
                  onAddTodo={handleAddTodoFromKanban}
                />
              </div>
            )}
          </main>
          <TodoInput
            existingTodos={todos}
            onChangesProposed={(changes, inputText) => handleChangesProposed(changes, inputText, "ai-input")}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            isVisible={showAiInput}
            onToggleVisibility={() => setShowAiInput(!showAiInput)}
          />
        </div>
      </SidebarInset>
      <TodoSidebar
        selectedTodo={selectedTodo}
        selectedTitle={selectedTitle}
        allTodos={todos}
        allItems={items}
        onUpdateTodo={handleUpdateTodo}
        onUpdateTitle={handleUpdateTitle}
        onRenameCategory={handleRenameCategory}
      />

      <ChangelogDialog
        open={showChangelog}
        onOpenChange={setShowChangelog}
        session={changelogSession}
        onApplyChanges={handleApplyChanges}
        isApplying={isApplyingChanges}
      />

      {/* Focus Mode Overlay - renders on top of everything when active */}
      <FocusModeOverlay />
    </SidebarProvider>
  )
}
