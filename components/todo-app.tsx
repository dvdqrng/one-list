"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { TodoInput } from "./todo-input"
import { TodoTextEditor } from "./todo-text-editor"
import { MergeButton } from "./merge-button"
import { ChangelogDialog } from "./changelog-dialog"
import { TodoSidebar } from "./todo-sidebar"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "./ui/sidebar"
import { StarIcon, LightningIcon, MoonIcon, SunIcon, SidebarSimpleIcon, EyeIcon, EyeSlashIcon, CalendarBlankIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import { electronDB } from "@/lib/electron/database"
import { mergeBlockItems } from "@/lib/types"
import type { Todo, Title, Separator as SeparatorType, BlockItem, ProposedChange, ChangelogSession } from "@/lib/types"
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
  const [todos, setTodos] = useState<Todo[]>([])
  const [titles, setTitles] = useState<Title[]>([])
  const [separators, setSeparators] = useState<SeparatorType[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null)
  const [changelogSession, setChangelogSession] = useState<ChangelogSession | null>(null)
  const [showChangelog, setShowChangelog] = useState(false)
  const [isApplyingChanges, setIsApplyingChanges] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)
  const [showAiInput, setShowAiInput] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [groupByDueDate, setGroupByDueDate] = useState(false)
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

      // If database is empty, add default test tasks
      if (todosData.length === 0 && titlesData.length === 0) {
        const now = Date.now()
        const defaultTitles: Title[] = [
          { id: crypto.randomUUID(), text: "Work", createdAt: new Date(now).toISOString() },
          { id: crypto.randomUUID(), text: "Personal", createdAt: new Date(now + 100).toISOString() },
        ]
        const defaultTodos: Todo[] = [
          {
            id: crypto.randomUUID(),
            title: "Review quarterly report",
            details: "Check financials and prepare summary for team meeting",
            completed: false,
            priority: "high",
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            category: "Reports",
            createdAt: new Date(now + 1).toISOString(),
            groupTitleId: defaultTitles[0].id,
            project: "Work",
          },
          {
            id: crypto.randomUUID(),
            title: "Prepare presentation slides",
            details: "Create 10-15 slides for Monday's client meeting",
            completed: false,
            priority: "high",
            category: "Meetings",
            createdAt: new Date(now + 2).toISOString(),
            groupTitleId: defaultTitles[0].id,
            project: "Work",
          },
          {
            id: crypto.randomUUID(),
            title: "Send follow-up emails",
            completed: true,
            priority: "medium",
            createdAt: new Date(now + 3).toISOString(),
            groupTitleId: defaultTitles[0].id,
            project: "Work",
          },
          {
            id: crypto.randomUUID(),
            title: "Schedule team sync",
            details: "Find a time that works for everyone in different timezones",
            completed: false,
            priority: "low",
            createdAt: new Date(now + 4).toISOString(),
            groupTitleId: defaultTitles[0].id,
            project: "Work",
            indent: 1,
          },
          {
            id: crypto.randomUUID(),
            title: "Buy groceries",
            details: "Milk, eggs, bread, vegetables, fruits",
            completed: false,
            priority: "medium",
            createdAt: new Date(now + 101).toISOString(),
            groupTitleId: defaultTitles[1].id,
            project: "Personal",
          },
          {
            id: crypto.randomUUID(),
            title: "Call mom",
            completed: false,
            priority: "high",
            dueDate: new Date().toISOString().split('T')[0],
            createdAt: new Date(now + 102).toISOString(),
            groupTitleId: defaultTitles[1].id,
            project: "Personal",
          },
          {
            id: crypto.randomUUID(),
            title: "Go for a run",
            details: "At least 5km in the park",
            completed: true,
            priority: "low",
            category: "Health",
            createdAt: new Date(now + 103).toISOString(),
            groupTitleId: defaultTitles[1].id,
            project: "Personal",
          },
          {
            id: crypto.randomUUID(),
            title: "Read a book chapter",
            completed: false,
            createdAt: new Date(now + 104).toISOString(),
            groupTitleId: defaultTitles[1].id,
            project: "Personal",
            indent: 1,
          },
        ]

        // Save to database
        for (const title of defaultTitles) {
          await electronDB.createTitle(title.text)
        }
        for (const todo of defaultTodos) {
          await electronDB.createTodo(todo)
        }

        setTodos(defaultTodos)
        setTitles(defaultTitles)
        setSeparators([])
        setIsLoading(false)
        return
      }
      // Deduplicate by ID (in case database has duplicates)
      const deduplicateById = <T extends { id: string }>(items: T[]): T[] => {
        const seen = new Set<string>()
        return items.filter(item => {
          if (seen.has(item.id)) {
            console.warn(`Duplicate found in database: ${item.id}`)
            return false
          }
          seen.add(item.id)
          return true
        })
      }
      const uniqueTitles = deduplicateById(titlesData) as Title[]
      const uniqueTodos = deduplicateById(todosData) as Todo[]

      // Build a map of title IDs to title text for deriving project names
      const titleTextMap = new Map<string, string>()
      for (const title of uniqueTitles) {
        titleTextMap.set(title.id, title.text)
      }

      // Ensure todos have their project field derived from their groupTitleId
      const todosWithProject = uniqueTodos.map(todo => {
        if (todo.groupTitleId && titleTextMap.has(todo.groupTitleId)) {
          return { ...todo, project: titleTextMap.get(todo.groupTitleId) }
        }
        return todo
      })

      setTodos(todosWithProject)
      setTitles(uniqueTitles)
      setSeparators(deduplicateById(separatorsData))
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTodo = useCallback(async (todo: Todo) => {
    setTodos((prev) => {
      // Prevent adding duplicates
      if (prev.some(t => t.id === todo.id)) {
        console.warn(`Attempted to add duplicate todo: ${todo.id}`)
        return prev
      }
      return [...prev, todo]
    })
    try {
      await electronDB.createTodo(todo)
    } catch (error) {
      console.error('Failed to add todo:', error)
      setTodos((prev) => prev.filter((t) => t.id !== todo.id))
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

    // Also update the project field of all todos linked to this title
    setTodos((prev) => prev.map((todo) =>
      todo.groupTitleId === id ? { ...todo, project: text } : todo
    ))

    // Debounce the database write
    if (titleUpdateTimers.current[id]) {
      clearTimeout(titleUpdateTimers.current[id])
    }
    titleUpdateTimers.current[id] = setTimeout(async () => {
      try {
        await electronDB.updateTitle(id, text)
        // Update all todos with this groupTitleId to have the new project name
        const todosToUpdate = todos.filter(t => t.groupTitleId === id)
        for (const todo of todosToUpdate) {
          await electronDB.updateTodo(todo.id, { project: text })
        }
      } catch (error) {
        console.error('Failed to update title:', error)
        loadData()
      }
      delete titleUpdateTimers.current[id]
    }, 300)
  }, [todos])

  const handleRenameCategory = useCallback(async (oldName: string, newName: string) => {
    // Optimistic update - rename category on all todos that have it
    setTodos((prev) => prev.map((todo) =>
      todo.category === oldName ? { ...todo, category: newName } : todo
    ))

    // Update in database
    try {
      const todosToUpdate = todos.filter(t => t.category === oldName)
      for (const todo of todosToUpdate) {
        await electronDB.updateTodo(todo.id, { category: newName })
      }
    } catch (error) {
      console.error('Failed to rename category:', error)
      loadData()
    }
  }, [todos])

  const handleDeleteCategory = useCallback(async (categoryName: string) => {
    // Optimistic update - remove category from all todos that have it
    setTodos((prev) => prev.map((todo) =>
      todo.category === categoryName ? { ...todo, category: undefined } : todo
    ))

    // Update in database
    try {
      const todosToUpdate = todos.filter(t => t.category === categoryName)
      for (const todo of todosToUpdate) {
        await electronDB.updateTodo(todo.id, { category: undefined })
      }
    } catch (error) {
      console.error('Failed to delete category:', error)
      loadData()
    }
  }, [todos])

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

  const handleAddSeparator = useCallback(async (separator: SeparatorType) => {
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
    setSelectedTitleId(null) // Clear title selection when selecting a todo
  }, [])

  const handleSelectTitle = useCallback((id: string) => {
    setSelectedTitleId((prev) => (prev === id ? null : id))
    setSelectedTodoId(null) // Clear todo selection when selecting a title
  }, [])

  const handleReorderItems = useCallback(async (reorderedItems: BlockItem[]) => {
    const now = Date.now()
    const updatedTodos: Todo[] = []
    const updatedTitles: Title[] = []
    const updatedSeparators: SeparatorType[] = []

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
      console.log('[handleReorderItems] Persisting reorder, items:', reorderedItems.length)
      await Promise.all(
        reorderedItems.map((item, i) => {
          const newCreatedAt = new Date(now + i).toISOString()

          if ('completed' in item) {
            const todo = item as Todo
            console.log('[handleReorderItems] Updating todo:', todo.id, 'groupTitleId:', todo.groupTitleId, 'project:', todo.project, 'createdAt:', newCreatedAt)
            return electronDB.updateTodo(item.id, {
              createdAt: newCreatedAt,
              groupTitleId: todo.groupTitleId,
              project: todo.project,
            })
          } else if ('text' in item) {
            return electronDB.updateTitleCreatedAt(item.id, newCreatedAt)
          } else {
            return electronDB.updateSeparatorCreatedAt(item.id, newCreatedAt)
          }
        })
      )
      console.log('[handleReorderItems] Persist complete')
    } catch (error) {
      console.error('Failed to persist reorder:', error)
      loadData()
    }
  }, [])

  // Insert a new item after the specified item (or at the beginning if afterId is null)
  // Returns the new item's ID for focus management
  const handleInsertItemAfter = useCallback((afterId: string | null, type: 'todo' | 'title' | 'separator'): string => {
    const allItems = mergeBlockItems(todos, titles, separators)
    const newId = crypto.randomUUID()

    // Find the position to insert at
    let insertIndex = 0
    if (afterId) {
      const afterIndex = allItems.findIndex(item => item.id === afterId)
      if (afterIndex !== -1) {
        insertIndex = afterIndex + 1
      }
    }

    // Calculate the createdAt timestamp to position the item correctly
    // We need a timestamp between the item at insertIndex-1 and insertIndex
    let newCreatedAt: string
    const prevItem = allItems[insertIndex - 1]
    const nextItem = allItems[insertIndex]

    if (!prevItem && !nextItem) {
      // Empty list
      newCreatedAt = new Date().toISOString()
    } else if (!prevItem) {
      // Insert at beginning
      const nextTime = new Date(nextItem.createdAt).getTime()
      newCreatedAt = new Date(nextTime - 1).toISOString()
    } else if (!nextItem) {
      // Insert at end
      const prevTime = new Date(prevItem.createdAt).getTime()
      newCreatedAt = new Date(prevTime + 1).toISOString()
    } else {
      // Insert in middle - use midpoint, but if timestamps are equal or too close,
      // we need to reassign all timestamps
      const prevTime = new Date(prevItem.createdAt).getTime()
      const nextTime = new Date(nextItem.createdAt).getTime()

      if (nextTime - prevTime <= 1) {
        // Timestamps too close - reassign all items after inserting
        // For now, just use current time (will be sorted correctly after reassignment)
        const now = Date.now()
        // Reassign all items with proper spacing
        const updatedItems: { id: string; createdAt: string; type: 'todo' | 'title' | 'separator' }[] = []
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i]
          const newTime = new Date(now + i * 2).toISOString() // *2 to leave room for insertion
          updatedItems.push({
            id: item.id,
            createdAt: newTime,
            type: 'completed' in item ? 'todo' : 'text' in item ? 'title' : 'separator'
          })
        }
        // The new item goes at insertIndex, so use timestamp between insertIndex-1 and insertIndex
        newCreatedAt = new Date(now + (insertIndex * 2) - 1).toISOString()

        // Update existing items in state and DB
        setTodos(prev => prev.map(t => {
          const update = updatedItems.find(u => u.id === t.id && u.type === 'todo')
          return update ? { ...t, createdAt: update.createdAt } : t
        }))
        setTitles(prev => prev.map(t => {
          const update = updatedItems.find(u => u.id === t.id && u.type === 'title')
          return update ? { ...t, createdAt: update.createdAt } : t
        }))
        setSeparators(prev => prev.map(s => {
          const update = updatedItems.find(u => u.id === s.id && u.type === 'separator')
          return update ? { ...s, createdAt: update.createdAt } : s
        }))

        // Persist timestamp updates
        Promise.all(updatedItems.map(item => {
          if (item.type === 'todo') {
            return electronDB.updateTodo(item.id, { createdAt: item.createdAt })
          } else if (item.type === 'title') {
            return electronDB.updateTitleCreatedAt(item.id, item.createdAt)
          } else {
            return electronDB.updateSeparatorCreatedAt(item.id, item.createdAt)
          }
        })).catch(error => console.error('Failed to update timestamps:', error))
      } else {
        newCreatedAt = new Date(Math.floor((prevTime + nextTime) / 2)).toISOString()
      }
    }

    // Determine the group (title) this item belongs to
    let groupTitleId: string | undefined = undefined
    let project: string | undefined = undefined

    if (type === 'todo') {
      // Look backwards to find the nearest title (stop at separators)
      for (let i = insertIndex - 1; i >= 0; i--) {
        const item = allItems[i]
        const isSeparatorItem = !('completed' in item) && !('text' in item)
        const isTitleItem = 'text' in item && !('completed' in item)

        if (isSeparatorItem) break
        if (isTitleItem) {
          groupTitleId = item.id
          project = (item as Title).text
          break
        }
      }

      // Also inherit indent from the item we're inserting after (if it's a todo)
      let indent = 0
      if (afterId) {
        const afterItem = allItems.find(item => item.id === afterId)
        if (afterItem && 'completed' in afterItem) {
          indent = (afterItem as Todo).indent ?? 0
        }
      }

      const newTodo: Todo = {
        id: newId,
        title: '',
        completed: false,
        createdAt: newCreatedAt,
        groupTitleId,
        project,
        indent,
      }

      setTodos(prev => [...prev, newTodo])
      electronDB.createTodo(newTodo).catch(error => {
        console.error('Failed to create todo:', error)
        setTodos(prev => prev.filter(t => t.id !== newId))
      })
    } else if (type === 'title') {
      const newTitle: Title = {
        id: newId,
        text: '',
        createdAt: newCreatedAt,
      }

      setTitles(prev => [...prev, newTitle])
      electronDB.createTitle('').catch(error => {
        console.error('Failed to create title:', error)
        setTitles(prev => prev.filter(t => t.id !== newId))
      })
    } else {
      const newSeparator: SeparatorType = {
        id: newId,
        createdAt: newCreatedAt,
      }

      setSeparators(prev => [...prev, newSeparator])
      electronDB.createSeparator().catch(error => {
        console.error('Failed to create separator:', error)
        setSeparators(prev => prev.filter(s => s.id !== newId))
      })
    }

    return newId
  }, [todos, titles, separators])

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
  }, [])

  // Handler for merge button results - converts to ProposedChange format
  const handleMergeGroupsFound = useCallback((groups: SimilarTaskGroup[]) => {
    const changes: ProposedChange[] = groups.map((group) => {
      const sourceTodos = group.taskIds
        .map((id) => todos.find((t) => t.id === id))
        .filter((t): t is Todo => t !== undefined)

      // Inherit project from the first source todo that has one
      const inheritedProject = sourceTodos.find(t => t.project)?.project

      const mergedResult: Todo = {
        id: crypto.randomUUID(),
        title: group.suggestedMerge.title,
        details: group.suggestedMerge.details,
        completed: false,
        priority: group.suggestedMerge.priority,
        dueDate: group.suggestedMerge.dueDate,
        category: group.suggestedMerge.category,
        createdAt: new Date().toISOString(),
        project: inheritedProject,
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
      for (const change of approvedChanges) {
        switch (change.type) {
          case "add":
            if (change.newTodo) {
              await handleAddTodo(change.newTodo)
            }
            break

          case "update":
          case "complete":
          case "uncomplete":
            if (change.existingTodo && change.updates) {
              handleUpdateTodo(change.existingTodo.id, change.updates)
            }
            break

          case "merge":
            if (change.mergeGroup) {
              // Delete source todos
              for (const sourceTodo of change.mergeGroup.sourceTodos) {
                await handleDeleteTodo(sourceTodo.id)
              }
              // Create merged result
              await handleAddTodo(change.mergeGroup.mergedResult)
            }
            break

          case "delete":
            if (change.deleteTodo) {
              await handleDeleteTodo(change.deleteTodo.id)
            }
            break
        }
      }
    } catch (error) {
      console.error('Failed to apply changes:', error)
    } finally {
      setIsApplyingChanges(false)
      setShowChangelog(false)
      setChangelogSession(null)
    }
  }, [handleAddTodo, handleUpdateTodo, handleDeleteTodo])

  const selectedTodo = todos.find((t) => t.id === selectedTodoId)
  const selectedTitle = titles.find((t) => t.id === selectedTitleId)

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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setGroupByDueDate(!groupByDueDate)}
              title={groupByDueDate ? "Group by project" : "Group by due date"}
            >
              <CalendarBlankIcon className="h-4 w-4" weight={groupByDueDate ? "fill" : "regular"} />
            </Button>
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
            <div className="mx-auto max-w-4xl px-4 md:px-8 pb-6">
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
                onSelectTitle={handleSelectTitle}
                onReorderItems={handleReorderItems}
                onInsertItemAfter={handleInsertItemAfter}
                showMetadata={showMetadata}
                hideCompleted={hideCompleted}
                groupByDueDate={groupByDueDate}
              />
            </div>
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
      <TodoSidebar selectedTodo={selectedTodo} selectedTitle={selectedTitle} allTodos={todos} onUpdateTodo={handleUpdateTodo} onUpdateTitle={handleUpdateTitle} onRenameCategory={handleRenameCategory} onDeleteCategory={handleDeleteCategory} />

      <ChangelogDialog
        open={showChangelog}
        onOpenChange={setShowChangelog}
        session={changelogSession}
        onApplyChanges={handleApplyChanges}
        isApplying={isApplyingChanges}
      />
    </SidebarProvider>
  )
}
