"use client"

import * as React from "react"
import { useMemo, useCallback, useState, useRef, useEffect } from "react"
import {
  KanbanProvider,
  KanbanBoard,
  KanbanHeader,
  KanbanCards,
  KanbanCard,
  type KanbanColumn,
} from "@/components/ui/kanban"
import { TaskItem } from "@/components/ui/task-item"
import {
  getDueDateCategory,
  getDateForCategory,
  DUE_DATE_LABELS,
  DUE_DATE_COLORS,
  DUE_DATE_GROUP_ORDER,
  type DueDateCategory
} from "@/lib/format"
import type { Item, Todo, KanbanGroupBy } from "@/lib/types"
import { isTodo, itemToTodo } from "@/lib/types"

// ============================================
// Navigation Types
// ============================================

interface KanbanPosition {
  columnIndex: number
  cardIndex: number
}

// ============================================
// Column Configurations
// ============================================

// Build dueDateColumns from centralized config
const dueDateColumns: KanbanColumn<Todo>[] = DUE_DATE_GROUP_ORDER.map(id => ({
  id,
  title: DUE_DATE_LABELS[id],
  color: DUE_DATE_COLORS[id],
}))

const priorityColumns: KanbanColumn<Todo>[] = [
  { id: "high", title: "High", color: "#ef4444" },
  { id: "medium", title: "Medium", color: "#f59e0b" },
  { id: "low", title: "Low", color: "#22c55e" },
  { id: "none", title: "No Priority", color: "#6b7280" },
]

const statusColumns: KanbanColumn<Todo>[] = [
  { id: "due", title: "To Do", color: "#6b7280" },
  { id: "in-progress", title: "In Progress", color: "#3b82f6" },
  { id: "done", title: "Done", color: "#22c55e" },
]

// ============================================
// Props
// ============================================

interface TodoKanbanViewProps {
  items: Item[]
  groupBy: KanbanGroupBy
  hideCompleted: boolean
  showMetadata: boolean
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onToggleTodo: (id: string) => void
  onSelectTodo: (id: string) => void
  onAddTodo: (columnId: string) => void
}

// ============================================
// Component
// ============================================

export function TodoKanbanView({
  items,
  groupBy,
  hideCompleted,
  showMetadata,
  onUpdateTodo,
  onToggleTodo,
  onSelectTodo,
  onAddTodo,
}: TodoKanbanViewProps) {
  // Track which todo is being edited inline
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null)
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null)
  const editInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter and convert items to todos (pass items to derive project)
  const todos = useMemo(() => {
    return items
      .filter(isTodo)
      .filter((item) => !hideCompleted || !item.completed)
      .map((item) => itemToTodo(item, items))
      .filter((todo): todo is Todo => todo !== null)
  }, [items, hideCompleted])

  // Get unique categories and projects for dynamic columns
  const { categories, projects } = useMemo(() => {
    const categorySet = new Set<string>()
    const projectSet = new Set<string>()

    items.forEach((item) => {
      if (isTodo(item)) {
        if (item.category) categorySet.add(item.category)
      }
      if (item.type === "title" && item.text) {
        projectSet.add(item.text)
      }
    })

    return {
      categories: Array.from(categorySet).sort(),
      projects: Array.from(projectSet).sort(),
    }
  }, [items])

  // Get columns based on groupBy
  const columns = useMemo((): KanbanColumn<Todo>[] => {
    switch (groupBy) {
      case "dueDate":
        return dueDateColumns
      case "priority":
        return priorityColumns
      case "status":
        return statusColumns
      case "category":
        return [
          ...categories.map((cat) => ({
            id: cat,
            title: cat,
            color: "#8b5cf6",
          })),
          { id: "uncategorized", title: "Uncategorized", color: "#6b7280" },
        ]
      case "project":
        return [
          ...projects.map((proj) => ({
            id: proj,
            title: proj,
            color: "#3b82f6",
          })),
          { id: "no-project", title: "No Project", color: "#6b7280" },
        ]
      default:
        return dueDateColumns
    }
  }, [groupBy, categories, projects])

  // Group todos by column
  const groupedData = useMemo((): Record<string, Todo[]> => {
    const result: Record<string, Todo[]> = {}

    // Initialize all columns
    columns.forEach((col) => {
      result[col.id] = []
    })

    todos.forEach((todo) => {
      let columnId: string

      switch (groupBy) {
        case "dueDate":
          columnId = getDueDateCategory(todo.dueDate, todo.isNow)
          break
        case "priority":
          columnId = todo.priority || "none"
          break
        case "status":
          if (todo.completed) {
            columnId = "done"
          } else {
            columnId = todo.status || "due"
          }
          break
        case "category":
          columnId = todo.category || "uncategorized"
          break
        case "project":
          columnId = todo.project || "no-project"
          break
        default:
          columnId = "no-date"
      }

      if (result[columnId]) {
        result[columnId].push(todo)
      } else {
        // Fallback for dynamic categories that might not exist
        const fallbackColumn = columns[columns.length - 1]
        if (fallbackColumn) {
          result[fallbackColumn.id].push(todo)
        }
      }
    })

    return result
  }, [todos, columns, groupBy])

  // Handle data change from drag and drop
  const handleDataChange = useCallback(
    (newData: Record<string, Todo[]>) => {
      // Find what changed and update accordingly
      Object.entries(newData).forEach(([columnId, columnTodos]) => {
        columnTodos.forEach((todo) => {
          const originalColumn = Object.entries(groupedData).find(([_, todos]) =>
            todos.some((t) => t.id === todo.id)
          )?.[0]

          if (originalColumn !== columnId) {
            // Todo moved to a different column
            switch (groupBy) {
              case "dueDate":
                if (columnId === "now") {
                  onUpdateTodo(todo.id, { isNow: true })
                } else {
                  const newDueDate = getDateForCategory(columnId as DueDateCategory)
                  onUpdateTodo(todo.id, {
                    isNow: false,
                    dueDate: newDueDate,
                  })
                }
                break
              case "priority":
                onUpdateTodo(todo.id, {
                  priority: columnId === "none" ? undefined : (columnId as Todo["priority"]),
                })
                break
              case "status":
                if (columnId === "done") {
                  onToggleTodo(todo.id) // Mark as completed
                } else if (originalColumn === "done") {
                  onToggleTodo(todo.id) // Mark as incomplete
                  onUpdateTodo(todo.id, {
                    status: columnId as Todo["status"],
                  })
                } else {
                  onUpdateTodo(todo.id, {
                    status: columnId as Todo["status"],
                  })
                }
                break
              case "category":
                onUpdateTodo(todo.id, {
                  category: columnId === "uncategorized" ? undefined : columnId,
                })
                break
              case "project":
                onUpdateTodo(todo.id, {
                  project: columnId === "no-project" ? undefined : columnId,
                })
                break
            }
          }
        })
      })
    },
    [groupBy, groupedData, onUpdateTodo, onToggleTodo]
  )

  // Detect newly created todos (empty title) and auto-edit them
  useEffect(() => {
    // Find todos with empty titles that might be newly created
    const emptyTitleTodo = todos.find(t => !t.title?.trim() && !editingTodoId)
    if (emptyTitleTodo && emptyTitleTodo.id !== newlyCreatedId) {
      setNewlyCreatedId(emptyTitleTodo.id)
      setEditingTodoId(emptyTitleTodo.id)
    }
  }, [todos, editingTodoId, newlyCreatedId])

  // Focus input when editing starts
  useEffect(() => {
    if (editingTodoId) {
      // Small delay to ensure input is rendered
      const timer = setTimeout(() => {
        editInputRefs.current[editingTodoId]?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [editingTodoId])

  // Handle saving the inline edit
  const handleTitleChange = useCallback((todoId: string, newTitle: string) => {
    onUpdateTodo(todoId, { title: newTitle })
  }, [onUpdateTodo])

  // Handle finishing edit (blur or enter)
  const handleFinishEdit = useCallback((todoId: string) => {
    setEditingTodoId(null)
    if (todoId === newlyCreatedId) {
      setNewlyCreatedId(null)
    }
  }, [newlyCreatedId])

  // Get the position of a todo by ID
  const getTodoPosition = useCallback((todoId: string): KanbanPosition | null => {
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const columnId = columns[colIdx].id
      const columnTodos = groupedData[columnId] || []
      const cardIdx = columnTodos.findIndex(t => t.id === todoId)
      if (cardIdx !== -1) {
        return { columnIndex: colIdx, cardIndex: cardIdx }
      }
    }
    return null
  }, [columns, groupedData])

  // Get todo at a specific position
  const getTodoAtPosition = useCallback((pos: KanbanPosition): Todo | null => {
    const column = columns[pos.columnIndex]
    if (!column) return null
    const columnTodos = groupedData[column.id] || []
    return columnTodos[pos.cardIndex] || null
  }, [columns, groupedData])

  // Navigate to a new position (with wraparound)
  const navigateTo = useCallback((pos: KanbanPosition) => {
    const todo = getTodoAtPosition(pos)
    if (todo) {
      setFocusedTodoId(todo.id)
      // Scroll the focused card into view
      setTimeout(() => {
        const cardEl = document.querySelector(`[data-kanban-card="${todo.id}"]`)
        cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 0)
    }
  }, [getTodoAtPosition])

  // Handle keyboard navigation when not editing
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't handle if editing
    if (editingTodoId) return

    const currentPos = focusedTodoId ? getTodoPosition(focusedTodoId) : null

    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault()
        if (!currentPos) {
          // Focus first card in first non-empty column
          for (let i = 0; i < columns.length; i++) {
            const columnTodos = groupedData[columns[i].id] || []
            if (columnTodos.length > 0) {
              navigateTo({ columnIndex: i, cardIndex: 0 })
              break
            }
          }
          return
        }
        // Move up within column
        if (currentPos.cardIndex > 0) {
          navigateTo({ ...currentPos, cardIndex: currentPos.cardIndex - 1 })
        }
        break
      }

      case 'ArrowDown': {
        e.preventDefault()
        if (!currentPos) {
          // Focus first card in first non-empty column
          for (let i = 0; i < columns.length; i++) {
            const columnTodos = groupedData[columns[i].id] || []
            if (columnTodos.length > 0) {
              navigateTo({ columnIndex: i, cardIndex: 0 })
              break
            }
          }
          return
        }
        // Move down within column
        const currentColumnTodos = groupedData[columns[currentPos.columnIndex].id] || []
        if (currentPos.cardIndex < currentColumnTodos.length - 1) {
          navigateTo({ ...currentPos, cardIndex: currentPos.cardIndex + 1 })
        }
        break
      }

      case 'ArrowLeft': {
        e.preventDefault()
        if (!currentPos) return
        // Move to previous column, keeping similar row position
        for (let i = currentPos.columnIndex - 1; i >= 0; i--) {
          const columnTodos = groupedData[columns[i].id] || []
          if (columnTodos.length > 0) {
            const cardIndex = Math.min(currentPos.cardIndex, columnTodos.length - 1)
            navigateTo({ columnIndex: i, cardIndex })
            break
          }
        }
        break
      }

      case 'ArrowRight': {
        e.preventDefault()
        if (!currentPos) return
        // Move to next column, keeping similar row position
        for (let i = currentPos.columnIndex + 1; i < columns.length; i++) {
          const columnTodos = groupedData[columns[i].id] || []
          if (columnTodos.length > 0) {
            const cardIndex = Math.min(currentPos.cardIndex, columnTodos.length - 1)
            navigateTo({ columnIndex: i, cardIndex })
            break
          }
        }
        break
      }

      case 'Enter': {
        e.preventDefault()
        if (focusedTodoId) {
          // Start editing the focused card
          setEditingTodoId(focusedTodoId)
        }
        break
      }

      case ' ': { // Space
        e.preventDefault()
        if (focusedTodoId) {
          // Toggle completion
          onToggleTodo(focusedTodoId)
        }
        break
      }

      case 'Escape': {
        e.preventDefault()
        // Clear focus
        setFocusedTodoId(null)
        break
      }

      case 'Tab': {
        // Tab moves to next column, Shift+Tab to previous
        if (!currentPos) return
        e.preventDefault()
        if (e.shiftKey) {
          // Move to previous column
          for (let i = currentPos.columnIndex - 1; i >= 0; i--) {
            const columnTodos = groupedData[columns[i].id] || []
            if (columnTodos.length > 0) {
              navigateTo({ columnIndex: i, cardIndex: 0 })
              break
            }
          }
        } else {
          // Move to next column
          for (let i = currentPos.columnIndex + 1; i < columns.length; i++) {
            const columnTodos = groupedData[columns[i].id] || []
            if (columnTodos.length > 0) {
              navigateTo({ columnIndex: i, cardIndex: 0 })
              break
            }
          }
        }
        break
      }

      case 'n':
      case 'N': {
        // Create new task in focused column (or first column)
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          const columnIndex = currentPos?.columnIndex ?? 0
          const columnId = columns[columnIndex]?.id
          if (columnId) {
            onAddTodo(columnId)
          }
        }
        break
      }
    }
  }, [editingTodoId, focusedTodoId, getTodoPosition, columns, groupedData, navigateTo, onToggleTodo, onAddTodo])

  // Render drag overlay for a todo card
  const renderDragOverlay = useCallback(
    (todo: Todo) => (
      <div className="w-72 rounded-lg border bg-card shadow-lg">
        <TaskItem
          todo={todo}
          interactive={false}
          className="px-3 py-2"
        />
      </div>
    ),
    []
  )

  // Create keyboard handlers for TaskItem when editing
  const getTaskKeyboardHandlers = useCallback((todoId: string) => ({
    onEnter: () => handleFinishEdit(todoId),
    onEscape: () => handleFinishEdit(todoId),
    onArrowUp: () => {
      handleFinishEdit(todoId)
      const pos = getTodoPosition(todoId)
      if (pos && pos.cardIndex > 0) {
        navigateTo({ ...pos, cardIndex: pos.cardIndex - 1 })
      }
    },
    onArrowDown: () => {
      handleFinishEdit(todoId)
      const pos = getTodoPosition(todoId)
      if (pos) {
        const columnTodos = groupedData[columns[pos.columnIndex].id] || []
        if (pos.cardIndex < columnTodos.length - 1) {
          navigateTo({ ...pos, cardIndex: pos.cardIndex + 1 })
        }
      }
    },
  }), [handleFinishEdit, getTodoPosition, navigateTo, columns, groupedData])

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-120px)] overflow-hidden outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <KanbanProvider
        columns={columns}
        data={groupedData}
        onDataChange={handleDataChange}
        getItemId={(todo) => todo.id}
        renderDragOverlay={renderDragOverlay}
      >
        {(column) => (
          <KanbanBoard id={column.id}>
            <KanbanHeader
              columnId={column.id}
              color={column.color}
              count={groupedData[column.id]?.length || 0}
              onAdd={onAddTodo}
            >
              {column.title}
            </KanbanHeader>
            <KanbanCards<Todo> columnId={column.id}>
              {(todo) => (
                <KanbanCard
                  id={todo.id}
                  data-kanban-card={todo.id}
                  onClick={() => {
                    if (editingTodoId !== todo.id) {
                      setFocusedTodoId(todo.id)
                      onSelectTodo(todo.id)
                    }
                  }}
                  className={focusedTodoId === todo.id ? "p-0 ring-2 ring-primary ring-offset-1" : "p-0"}
                >
                  <TaskItem
                    ref={(el) => { editInputRefs.current[todo.id] = el }}
                    todo={todo}
                    onToggle={onToggleTodo}
                    onTitleChange={handleTitleChange}
                    isEditing={editingTodoId === todo.id}
                    onStartEdit={setEditingTodoId}
                    onFinishEdit={handleFinishEdit}
                    showMetadata={showMetadata}
                    showPriorityIcon
                    excludeMetadata={[
                      ...(groupBy === "dueDate" ? ["dueDate" as const] : []),
                      ...(groupBy === "category" ? ["category" as const] : []),
                    ]}
                    keyboard={editingTodoId === todo.id ? getTaskKeyboardHandlers(todo.id) : undefined}
                    className="px-2 py-1.5"
                  />
                </KanbanCard>
              )}
            </KanbanCards>
          </KanbanBoard>
        )}
      </KanbanProvider>
    </div>
  )
}
