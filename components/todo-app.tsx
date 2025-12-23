"use client"

import React, { useEffect, useCallback } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { TodoKanbanView } from "./todo-kanban-view"
import { ChangelogDialog } from "./changelog-dialog"
import { TodoSidebar } from "./todo-sidebar"
import { FocusModeOverlay } from "./focus-mode-overlay"
import { UpdateDialog } from "./update-dialog"
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
import { RefreshCw } from "lucide-react"
import { StarIcon, LightningIcon, MoonIcon, SunIcon, SidebarSimpleIcon, EyeIcon, EyeSlashIcon, CalendarBlankIcon, ListBulletsIcon, KanbanIcon, CaretDownIcon, DotsThreeVerticalIcon, IntersectIcon, SpinnerIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { aiQueueManager } from "@/lib/ai"
import { useStore, useTodos, useSelectedTodo, useSelectedTitle } from "@/lib/store"
import { useFocusTimer } from "@/hooks/use-focus-timer"
import { getDateForCategory, type DueDateCategory } from "@/lib/format"
import { isTodo } from "@/lib/types"
import type { Todo, ProposedChange } from "@/lib/types"
import { findSimilarTasks } from "@/lib/api-bridge"
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
    setShowMetadata,
    setShowCompleted,
    setListGroupBy,
    setViewMode,
    setKanbanGroupBy,
    setChangelogSession,
    setShowChangelog,
    applyChanges,
    insertItemAfter,
    moveToProject,
    archiveOldDoneTasks,
  } = useStore()

  // Derived state from store
  const todos = useTodos()
  const selectedTodo = useSelectedTodo()
  const selectedTitle = useSelectedTitle()

  // Local UI state
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [showAiInput, setShowAiInput] = React.useState(false)
  const [isApplyingChanges, setIsApplyingChanges] = React.useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = React.useState(false)
  const [isSearchingSimilar, setIsSearchingSimilar] = React.useState(false)
  const { theme, setTheme } = useTheme()

  // Focus timer hook
  const { startTimer } = useFocusTimer()

  // Handler for starting focus mode from the Now group
  const handleStartFocus = useCallback(() => {
    startTimer(1500) // 25 minutes
  }, [startTimer])

  // Load initial data and run archive check
  useEffect(() => {
    loadItems().then(() => {
      archiveOldDoneTasks()
    })

    // Periodically check for tasks to archive (every hour)
    const interval = setInterval(() => {
      archiveOldDoneTasks()
    }, 60 * 60 * 1000)

    return () => clearInterval(interval)
  }, [loadItems, archiveOldDoneTasks])

  // Set up AI queue manager callback
  useEffect(() => {
    aiQueueManager.setUpdateCallback((todoId, updates) => {
      updateItemDebounced(todoId, updates)
    })
  }, [updateItemDebounced])

  // Automated AI enrichment for new items
  const activeItemId = useStore((state) => state.activeItemId)
  useEffect(() => {
    // Find todos that need enrichment:
    // 1. Must be a todo item
    // 2. Must have a title (not empty)
    // 3. Must not have any AI processing status yet (unprocessed)
    // 4. Optimization: Don't process the currently active item to avoid 
    //    interfering while the user is still typing.
    const todosNeedingEnrichment = items.filter(
      (item) =>
        isTodo(item) &&
        item.title &&
        item.title.trim().length > 0 &&
        item.aiProcessingStatus === undefined &&
        item.id !== activeItemId
    )

    if (todosNeedingEnrichment.length > 0) {
      todosNeedingEnrichment.forEach((item) => {
        aiQueueManager.enqueue({
          todoId: item.id,
          inputText: item.title || "",
          type: "enhance",
        })
      })
    }
  }, [items, activeItemId])

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

  // Use store actions directly for simple operations
  const handleToggleTodo = toggleItem

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

  const handleFindSimilarTasks = useCallback(async () => {
    setIsSearchingSimilar(true)
    try {
      const result = await findSimilarTasks(todos)
      handleMergeGroupsFound(result.groups)
    } catch (error) {
      console.error("Error finding similar tasks:", error)
    } finally {
      setIsSearchingSimilar(false)
    }
  }, [todos, handleMergeGroupsFound])

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
          if (columnId === "done") return { completed: true, status: "done", completedAt: new Date().toISOString() }
          if (columnId === "archived") return { completed: true, status: "archived", completedAt: new Date().toISOString() }
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                  <DotsThreeVerticalIcon className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {typeof window !== 'undefined' && window.electronDB && (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      console.log('Update menu item selected');
                      setShowUpdateDialog(true);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Check for Updates...</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    handleFindSimilarTasks()
                  }}
                  disabled={isSearchingSimilar || todos.length < 2}
                  className="gap-2 cursor-pointer"
                >
                  {isSearchingSimilar ? (
                    <SpinnerIcon className="h-4 w-4 animate-spin" weight="bold" />
                  ) : (
                    <IntersectIcon className="h-4 w-4" />
                  )}
                  <span>Find Similar Tasks</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open('https://github.com/dvdqrng/one-list', '_blank')} className="gap-2 cursor-pointer">
                  <LightningIcon className="h-4 w-4" />
                  <span>GitHub Repository</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <CustomSidebarTrigger />
          </div>
        </header>
        <div className="flex flex-1 flex-col">
          <main className={viewMode === "list" ? "flex-1 overflow-auto min-w-0" : "flex-1 overflow-hidden min-w-0"}>
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

      <UpdateDialog
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
      />
    </SidebarProvider>
  )
}
