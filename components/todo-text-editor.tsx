"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { SpinnerIcon, CalendarBlankIcon, CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { SortableItem } from "@/components/sortable-item"
import { formatDueDate } from "@/lib/format"
import { mergeBlockItems } from "@/lib/types"
import type { Todo, Title, Separator, BlockItem } from "@/lib/types"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

// Due date category for grouping
type DueDateCategory = "overdue" | "today" | "tomorrow" | "this-week" | "later" | "no-date"

function getDueDateCategory(dueDate: string | undefined): DueDateCategory {
  if (!dueDate) return "no-date"

  const date = new Date(dueDate)

  // Handle invalid dates
  if (isNaN(date.getTime())) return "no-date"

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))

  const dateOnly = new Date(date)
  dateOnly.setHours(0, 0, 0, 0)

  if (dateOnly < today) return "overdue"
  if (dateOnly.getTime() === today.getTime()) return "today"
  if (dateOnly.getTime() === tomorrow.getTime()) return "tomorrow"
  if (dateOnly <= endOfWeek) return "this-week"
  return "later"
}

const dueDateGroupOrder: DueDateCategory[] = ["overdue", "today", "tomorrow", "this-week", "later", "no-date"]

const dueDateLabels: Record<DueDateCategory, string> = {
  "overdue": "Overdue",
  "today": "Today",
  "tomorrow": "Tomorrow",
  "this-week": "This Week",
  "later": "Later",
  "no-date": "No Due Date",
}

interface TodoTextEditorProps {
  todos: Todo[]
  titles: Title[]
  separators: Separator[]
  onAddTodo: (todo: Todo) => void
  onAddTitle: (title: Title) => void
  onAddSeparator: (separator: Separator) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onUpdateTitle: (id: string, text: string) => void
  onDeleteTodo: (id: string) => void
  onDeleteTitle: (id: string) => void
  onDeleteSeparator: (id: string) => void
  onToggleTodo: (id: string) => void
  onSelectTodo: (id: string) => void
  onSelectTitle: (id: string) => void
  onReorderItems: (items: BlockItem[]) => void
  onInsertItemAfter: (afterId: string | null, type: 'todo' | 'title' | 'separator') => string
  showMetadata: boolean
  hideCompleted: boolean
  groupByDueDate: boolean
}

export function TodoTextEditor({
  todos,
  titles,
  separators,
  onAddTodo,
  onAddTitle,
  onAddSeparator,
  onUpdateTodo,
  onUpdateTitle,
  onDeleteTodo,
  onDeleteTitle,
  onDeleteSeparator,
  onToggleTodo,
  onSelectTodo,
  onSelectTitle,
  onReorderItems,
  onInsertItemAfter,
  showMetadata,
  hideCompleted,
  groupByDueDate,
}: TodoTextEditorProps) {
  // Track collapsed title IDs
  const [collapsedTitles, setCollapsedTitles] = useState<Set<string>>(new Set())
  // Track collapsed due date categories
  const [collapsedDueDateGroups, setCollapsedDueDateGroups] = useState<Set<DueDateCategory>>(new Set())
  // Track which item to focus after render
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)

  const toggleTitleCollapse = (titleId: string) => {
    setCollapsedTitles(prev => {
      const next = new Set(prev)
      if (next.has(titleId)) {
        next.delete(titleId)
      } else {
        next.add(titleId)
      }
      return next
    })
  }

  const toggleDueDateGroupCollapse = (category: DueDateCategory) => {
    setCollapsedDueDateGroups(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Focus the pending item after render
  useEffect(() => {
    if (pendingFocusId && inputRefs.current[pendingFocusId]) {
      inputRefs.current[pendingFocusId]?.focus()
      setPendingFocusId(null)
    }
  }, [pendingFocusId, todos, titles])

  // Set up drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Single source of truth for items (sorted by createdAt)
  const savedItems = useMemo(
    () => mergeBlockItems(todos, titles, separators),
    [todos, titles, separators]
  )

  // Items for rendering (with filtering and grouping applied)
  const allItems = useMemo(() => {
    // Filter out completed todos if hideCompleted is true
    const filteredItems = hideCompleted
      ? savedItems.filter(item => !('completed' in item && item.completed))
      : savedItems

    type ItemType = { type: 'item', item: BlockItem } | { type: 'due-date-header', category: DueDateCategory, label: string }

    if (groupByDueDate) {
      // Group todos by due date category
      const todoItems = filteredItems.filter((item): item is Todo => 'completed' in item)

      // Group todos by category
      const groupedTodos: Record<DueDateCategory, Todo[]> = {
        "overdue": [],
        "today": [],
        "tomorrow": [],
        "this-week": [],
        "later": [],
        "no-date": [],
      }

      for (const todo of todoItems) {
        const category = getDueDateCategory(todo.dueDate)
        groupedTodos[category].push(todo)
      }

      // Build the items array with headers
      const items: ItemType[] = []

      // Categories that should always be shown even when empty
      const alwaysShowCategories: DueDateCategory[] = ["today", "tomorrow"]

      for (const category of dueDateGroupOrder) {
        const todosInCategory = groupedTodos[category]
        const shouldShow = todosInCategory.length > 0 || alwaysShowCategories.includes(category)
        if (shouldShow) {
          // Add header
          items.push({
            type: 'due-date-header',
            category,
            label: dueDateLabels[category],
          })
          // Add todos only if group is not collapsed
          if (!collapsedDueDateGroups.has(category)) {
            for (const todo of todosInCategory) {
              items.push({ type: 'item', item: todo })
            }
          }
        }
      }

      return items
    }

    // Default: project-based ordering
    return filteredItems.map(item => ({ type: 'item' as const, item }))
  }, [savedItems, hideCompleted, groupByDueDate, collapsedDueDateGroups])

  // Helper to get item id for focusing
  const getItemId = (item: typeof allItems[number]): string | null => {
    if (item.type === 'due-date-header') return null
    return item.item.id
  }

  const handleKeyDown = (item: BlockItem, index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const isTodoItem = 'completed' in item
    const isTitleItem = 'text' in item && !('completed' in item)

    // Option+Tab (Alt+Tab) - convert between todo and title
    if (e.key === "Tab" && e.altKey) {
      e.preventDefault()
      if (isTodoItem) {
        // Convert todo to title
        const todo = item as Todo
        const newTitle: Title = {
          id: crypto.randomUUID(),
          text: todo.title,
          createdAt: todo.createdAt,
        }
        onDeleteTodo(todo.id)
        onAddTitle(newTitle)
        setPendingFocusId(newTitle.id)
      } else if (isTitleItem) {
        // Convert title to todo
        const title = item as Title
        const newTodo: Todo = {
          id: crypto.randomUUID(),
          title: title.text,
          completed: false,
          createdAt: title.createdAt,
        }
        onDeleteTitle(title.id)
        onAddTodo(newTodo)
        setPendingFocusId(newTodo.id)
      }
      return
    }

    // Tab - increase indent (for todos only)
    if (e.key === "Tab" && !e.shiftKey && !e.altKey && isTodoItem) {
      e.preventDefault()
      const todo = item as Todo
      onUpdateTodo(todo.id, { indent: Math.min(3, (todo.indent ?? 0) + 1) })
      return
    }

    // Shift+Tab - decrease indent (for todos only)
    if (e.key === "Tab" && e.shiftKey && !e.altKey && isTodoItem) {
      e.preventDefault()
      const todo = item as Todo
      onUpdateTodo(todo.id, { indent: Math.max(0, (todo.indent ?? 0) - 1) })
      return
    }

    // Arrow Up - find previous focusable item
    if (e.key === "ArrowUp") {
      e.preventDefault()
      for (let i = index - 1; i >= 0; i--) {
        const id = getItemId(allItems[i])
        if (id) {
          inputRefs.current[id]?.focus()
          break
        }
      }
      return
    }

    // Arrow Down - find next focusable item
    if (e.key === "ArrowDown") {
      e.preventDefault()
      for (let i = index + 1; i < allItems.length; i++) {
        const id = getItemId(allItems[i])
        if (id) {
          inputRefs.current[id]?.focus()
          break
        }
      }
      return
    }

    // Enter - insert new item after current
    if (e.key === "Enter") {
      e.preventDefault()

      const text = isTodoItem ? (item as Todo).title : isTitleItem ? (item as Title).text : ''

      // If current item is empty, convert it to a separator
      if (!text.trim() && (isTodoItem || isTitleItem)) {
        if (isTodoItem) {
          onDeleteTodo(item.id)
        } else {
          onDeleteTitle(item.id)
        }
        // Insert separator at this position, then a new todo after it
        const newId = onInsertItemAfter(item.id, 'separator')
        // Focus next item or create new todo
        const nextIndex = index + 1
        if (nextIndex < allItems.length) {
          const nextId = getItemId(allItems[nextIndex])
          if (nextId) {
            setPendingFocusId(nextId)
          }
        }
        return
      }

      // Insert new todo after current item
      const newId = onInsertItemAfter(item.id, 'todo')
      setPendingFocusId(newId)
      return
    }

    // Backspace - delete empty item
    if (e.key === "Backspace") {
      const text = isTodoItem ? (item as Todo).title : isTitleItem ? (item as Title).text : ''

      if (!text) {
        e.preventDefault()

        // Find previous focusable item before deleting
        let prevId: string | null = null
        for (let i = index - 1; i >= 0; i--) {
          const id = getItemId(allItems[i])
          if (id) {
            prevId = id
            break
          }
        }

        if (isTodoItem) {
          onDeleteTodo(item.id)
        } else if (isTitleItem) {
          onDeleteTitle(item.id)
        }

        if (prevId) {
          setPendingFocusId(prevId)
        }
      }
    }
  }

  const getPriorityColor = (_priority: "low" | "medium" | "high"): "secondary" => {
    return "secondary"
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = savedItems.findIndex((item) => item.id === active.id)
    const newIndex = savedItems.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const reorderedItems = arrayMove(savedItems, oldIndex, newIndex)

    // Check if the dragged item is a todo and update its groupTitleId/project
    const draggedItem = reorderedItems[newIndex]
    if ('completed' in draggedItem) {
      // It's a todo - find the title group it now belongs to
      let newGroupTitleId: string | undefined = undefined
      let newProject: string | undefined = undefined

      // Look backwards from the new position to find the nearest title (stop at separators)
      for (let i = newIndex - 1; i >= 0; i--) {
        const item = reorderedItems[i]
        const isSeparatorItem = !('completed' in item) && !('text' in item)
        const isTitleItem = 'text' in item && !('completed' in item)

        if (isSeparatorItem) {
          // Hit a separator - no group
          break
        }
        if (isTitleItem) {
          newGroupTitleId = item.id
          newProject = (item as Title).text
          break
        }
      }

      // Update the todo in reorderedItems if its group changed
      const todo = draggedItem as Todo
      console.log('[handleDragEnd] Todo moved:', todo.id, 'old groupTitleId:', todo.groupTitleId, 'new groupTitleId:', newGroupTitleId, 'newProject:', newProject)
      if (todo.groupTitleId !== newGroupTitleId) {
        // Update the item in the reordered array with the new group info
        const updatedTodo: Todo = {
          ...todo,
          groupTitleId: newGroupTitleId,
          project: newProject,
        }
        reorderedItems[newIndex] = updatedTodo
        console.log('[handleDragEnd] Updated todo in reorderedItems:', updatedTodo.id, 'groupTitleId:', updatedTodo.groupTitleId)
      }
    }

    console.log('[handleDragEnd] Calling onReorderItems with', reorderedItems.length, 'items')
    onReorderItems(reorderedItems)
  }

  // Ensure there's always at least one empty todo to type into
  const hasInsertedInitial = useRef(false)
  useEffect(() => {
    if (savedItems.length === 0 && !hasInsertedInitial.current) {
      hasInsertedInitial.current = true
      onInsertItemAfter(null, 'todo')
    } else if (savedItems.length > 0) {
      hasInsertedInitial.current = false
    }
  }, [savedItems.length, onInsertItemAfter])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={savedItems.map(item => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0">
          {allItems.map((renderItem, index) => {
            // Render due date group header
            if (renderItem.type === 'due-date-header') {
              const isCollapsed = collapsedDueDateGroups.has(renderItem.category)
              const isFirst = index === 0
              return (
                <div
                  key={`due-date-${renderItem.category}`}
                  className={`group flex items-center gap-1 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/30 cursor-pointer ${isFirst ? '' : 'mt-4'}`}
                  onClick={() => toggleDueDateGroupCollapse(renderItem.category)}
                >
                  <button
                    type="button"
                    className="p-0.5 hover:bg-muted rounded shrink-0"
                  >
                    {isCollapsed ? (
                      <CaretRightIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
                    ) : (
                      <CaretDownIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
                    )}
                  </button>
                  <span className="text-lg font-semibold">{renderItem.label}</span>
                </div>
              )
            }

            const item = renderItem.item
            const isTodoItem = 'completed' in item
            const isTitleItem = 'text' in item && !('completed' in item)
            const isSeparatorItem = !('completed' in item) && !('text' in item)

            // Render separator as visual spacer
            if (isSeparatorItem) {
              const separator = item as Separator
              return (
                <SortableItem key={separator.id} id={separator.id}>
                  <div
                    className="h-4 flex items-center px-3 cursor-pointer hover:bg-muted/20"
                    onClick={() => {
                      onDeleteSeparator(separator.id)
                    }}
                  >
                    <div className="w-full h-px bg-border/30" />
                  </div>
                </SortableItem>
              )
            }

            // Render todo
            if (isTodoItem) {
              const todo = item as Todo
              // Skip rendering if parent title is collapsed
              if (todo.groupTitleId && collapsedTitles.has(todo.groupTitleId)) {
                return null
              }
              const indentLevel = todo.indent ?? 0
              return (
                <SortableItem key={todo.id} id={todo.id}>
                  <div
                    className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-1 hover:bg-muted/30 transition-colors"
                    style={{ paddingLeft: `${12 + indentLevel * 24}px` }}
                  >
                    <Checkbox
                      checked={todo.completed}
                      onCheckedChange={() => onToggleTodo(todo.id)}
                      className="shrink-0"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation()
                        onSelectTodo(todo.id)
                      }}
                    />
                    <input
                      ref={(el) => { inputRefs.current[todo.id] = el }}
                      type="text"
                      value={todo.title}
                      onChange={(e) => onUpdateTodo(todo.id, { title: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(item, index, e)}
                      onFocus={() => onSelectTodo(todo.id)}
                      placeholder="Type a task..."
                      className={`flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground ${
                        todo.completed ? "line-through opacity-60" : ""
                      }`}
                    />
                    {todo.aiProcessingStatus && (todo.aiProcessingStatus === "processing" || todo.aiProcessingStatus === "pending") && (
                      <SpinnerIcon className="h-4 w-4 animate-spin text-muted-foreground" weight="bold" />
                    )}
                    {showMetadata && (
                      <div className="flex items-center gap-1" onClick={() => onSelectTodo(todo.id)}>
                        {todo.priority && (
                          <Badge variant={getPriorityColor(todo.priority)} className="cursor-pointer">
                            {todo.priority}
                          </Badge>
                        )}
                        {todo.dueDate && (
                          <Badge variant="secondary" className="cursor-pointer gap-1">
                            <CalendarBlankIcon className="h-3 w-3" weight="fill" />
                            {formatDueDate(todo.dueDate)}
                          </Badge>
                        )}
                        {todo.category && (
                          <Badge variant="secondary" className="cursor-pointer">
                            {todo.category}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </SortableItem>
              )
            }

            // Render title
            if (isTitleItem) {
              const title = item as Title
              const isCollapsed = collapsedTitles.has(title.id)
              const isFirst = index === 0

              return (
                <SortableItem key={title.id} id={title.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/30 cursor-pointer ${isFirst ? '' : 'mt-4'}`}
                    onClick={() => onSelectTitle(title.id)}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleTitleCollapse(title.id)
                      }}
                      className="p-0.5 hover:bg-muted rounded shrink-0"
                    >
                      {isCollapsed ? (
                        <CaretRightIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
                      ) : (
                        <CaretDownIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
                      )}
                    </button>
                    <input
                      ref={(el) => { inputRefs.current[title.id] = el }}
                      type="text"
                      value={title.text}
                      onChange={(e) => onUpdateTitle(title.id, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(item, index, e)}
                      onFocus={() => onSelectTitle(title.id)}
                      placeholder="Type a title..."
                      className="flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </SortableItem>
              )
            }

            return null
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
