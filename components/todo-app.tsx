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
import { StarIcon, LightningIcon, MoonIcon, SunIcon, SidebarSimpleIcon, EyeIcon, EyeSlashIcon, CalendarBlankIcon, ListBulletsIcon, KanbanIcon, CaretDownIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import { useStore, useTodos, useTitles, useSelectedTodo, useSelectedTitle } from "@/lib/store"
import { useFocusTimer } from "@/hooks/use-focus-timer"
import { getDateForCategory, type DueDateCategory } from "@/lib/format"
import type { Todo, ProposedChange, KanbanGroupBy } from "@/lib/types"
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
    selectedTodoId,
    selectedTitleId,
    showMetadata,
    hideCompleted,
    groupByDueDate,
    viewMode,
    kanbanGroupBy,
    changelogSession,
    showChangelog,
    loadItems,
    updateItem,
    updateItemDebounced,
    deleteItem,
    toggleItem,
    reorderItems,
    selectTodo,
    selectTitle,
    setShowMetadata,
    setHideCompleted,
    setGroupByDueDate,
    setViewMode,
    setKanbanGroupBy,
    setChangelogSession,
    setShowChangelog,
    applyChanges,
    insertItemAfter,
    moveToProject,
  } = useStore()

  // Derived state from store
  const todos = useTodos()
  const titles = useTitles()
  const selectedTodo = useSelectedTodo()
  const selectedTitle = useSelectedTitle()

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

  const handleDeleteCategory = useCallback(async (categoryName: string) => {
    // Remove category from all todos that have it
    const todosToUpdate = items.filter(i => i.type === "todo" && i.category === categoryName)
    for (const item of todosToUpdate) {
      updateItem(item.id, { category: undefined })
    }
  }, [items, updateItem])

  // Unified delete handler - works for todos, titles, and separators
  const handleDeleteItem = useCallback(async (id: string) => {
    await deleteItem(id)
  }, [deleteItem])

  const handleToggleTodo = useCallback(async (id: string) => {
    await toggleItem(id)
  }, [toggleItem])

  const handleSelectTodo = useCallback((id: string) => {
    selectTodo(selectedTodoId === id ? null : id)
  }, [selectTodo, selectedTodoId])

  const handleSelectTitle = useCallback((id: string) => {
    selectTitle(selectedTitleId === id ? null : id)
  }, [selectTitle, selectedTitleId])

  const handleReorderItems = useCallback(async (reorderedItems: typeof items) => {
    await reorderItems(reorderedItems)
  }, [reorderItems])

  const handleInsertItemAfter = useCallback((afterId: string | null, type: 'todo' | 'title' | 'separator', initialData?: Partial<Todo>): string => {
    return insertItemAfter(afterId, type, initialData)
  }, [insertItemAfter])

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

  const handleMoveToProject = useCallback(async (todoId: string, projectId: string | null) => {
    await moveToProject(todoId, projectId)
  }, [moveToProject])

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
      <SidebarInset className="bg-background">
        {/* Title bar - 44px height, traffic lights (12px) centered at y=16 */}
        <header
          className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 pl-[76px] pr-4 bg-background"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
              onClick={() => setHideCompleted(!hideCompleted)}
              title={hideCompleted ? "Show completed tasks" : "Hide completed tasks"}
            >
              {hideCompleted ? (
                <EyeSlashIcon className="h-4 w-4" weight="regular" />
              ) : (
                <EyeIcon className="h-4 w-4" weight="regular" />
              )}
            </Button>
            {viewMode === "list" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setGroupByDueDate(!groupByDueDate)}
                title={groupByDueDate ? "Group by project" : "Group by due date"}
              >
                <CalendarBlankIcon className="h-4 w-4" weight={groupByDueDate ? "fill" : "regular"} />
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
              <StarIcon className="h-4 w-4" weight={showMetadata ? "fill" : "regular"} />
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
          <main className="flex-1 overflow-auto">
            {viewMode === "list" ? (
              <div className="mx-auto max-w-4xl px-4 md:px-8 pb-6">
                <TodoTextEditor
                  items={items}
                  onUpdateTodo={handleUpdateTodo}
                  onUpdateTitle={handleUpdateTitle}
                  onDeleteItem={handleDeleteItem}
                  onToggleTodo={handleToggleTodo}
                  onSelectTodo={handleSelectTodo}
                  onSelectTitle={handleSelectTitle}
                  onReorderItems={handleReorderItems}
                  onInsertItemAfter={handleInsertItemAfter}
                  showMetadata={showMetadata}
                  hideCompleted={hideCompleted}
                  groupByDueDate={groupByDueDate}
                  onStartFocus={handleStartFocus}
                />
              </div>
            ) : (
              <div className="px-4 md:px-8 pb-6">
                <TodoKanbanView
                  items={items}
                  groupBy={kanbanGroupBy}
                  hideCompleted={hideCompleted}
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
        onDeleteCategory={handleDeleteCategory}
        onMoveToProject={handleMoveToProject}
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
