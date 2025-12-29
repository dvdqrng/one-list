"use client"

import { useMemo, useCallback, useEffect } from "react"
import {
  KanbanProvider,
  KanbanBoard,
  KanbanHeader,
  KanbanCards,
  KanbanCard,
  type KanbanColumn,
} from "@/components/ui/kanban"
import { TaskItem } from "@/components/ui/task-item"
import { useGroupedItems, type GroupBy } from "@/lib/grouping"
import { useFocusManager } from "@/hooks/use-focus-manager"
import { useStore } from "@/lib/store"
import { getDateForCategory, type DueDateCategory } from "@/lib/format"
import type { Item, Todo, KanbanGroupBy } from "@/lib/types"
import { isTodo } from "@/lib/types"

// ============================================
// Column Configurations
// ============================================

const COLUMN_CONFIGS: Record<GroupBy, { columns: KanbanColumn<Todo>[]; dynamic?: boolean }> = {
  dueDate: {
    columns: [
      { id: "now", title: "Now", color: "hsl(var(--primary))" },
      { id: "overdue", title: "Overdue", color: "#ef4444" },
      { id: "today", title: "Today", color: "#f59e0b" },
      { id: "tomorrow", title: "Tomorrow", color: "#84cc16" },
      { id: "this-week", title: "This Week", color: "#06b6d4" },
      { id: "later", title: "Later", color: "#8b5cf6" },
      { id: "no-date", title: "No Due Date", color: "#6b7280" },
    ],
  },
  priority: {
    columns: [
      { id: "high", title: "High", color: "#ef4444" },
      { id: "medium", title: "Medium", color: "#f59e0b" },
      { id: "low", title: "Low", color: "#22c55e" },
      { id: "none", title: "No Priority", color: "#6b7280" },
    ],
  },
  status: {
    columns: [
      { id: "due", title: "To Do", color: "#6b7280" },
      { id: "in-progress", title: "In Progress", color: "#3b82f6" },
      { id: "done", title: "Done", color: "#22c55e" },
    ],
  },
  category: { columns: [], dynamic: true },
  project: { columns: [], dynamic: true },
  position: { columns: [] }, // Not used in kanban
}

// ============================================
// Props
// ============================================

interface TodoKanbanViewProps {
  items: Item[]
  groupBy: KanbanGroupBy
  showCompleted: boolean
  showMetadata: boolean
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onToggleTodo: (id: string) => void
  onAddTodo: (columnId: string) => void
}

// ============================================
// Component
// ============================================

export function TodoKanbanView({
  items,
  groupBy,
  showCompleted,
  showMetadata,
  onUpdateTodo,
  onToggleTodo,
  onAddTodo,
}: TodoKanbanViewProps) {
  // Use centralized grouping
  const groups = useGroupedItems(items, groupBy as GroupBy, {
    hideCompleted: !showCompleted,
    excludeProjectRoots: groupBy !== "project",
  })

  // Build columns from groups
  const columns = useMemo((): KanbanColumn<Todo>[] => {
    const config = COLUMN_CONFIGS[groupBy as GroupBy]

    if (config?.dynamic) {
      // Dynamic columns from groups
      return groups.map((group) => ({
        id: group.key,
        title: group.label,
        color: group.key === "uncategorized" || group.key === "no-project" ? "#6b7280" : "#8b5cf6",
      }))
    }

    return config?.columns ?? []
  }, [groupBy, groups])

  // Convert groups to kanban data format
  const groupedData = useMemo((): Record<string, Todo[]> => {
    const result: Record<string, Todo[]> = {}

    // Initialize all columns
    columns.forEach((col) => {
      result[col.id] = []
    })

    // Fill from groups
    groups.forEach((group) => {
      if (result[group.key] !== undefined) {
        result[group.key] = group.items
          .filter(isTodo)
          .map((item) => ({
            id: item.id,
            title: item.title || "",
            completed: item.completed || false,
            priority: item.priority,
            dueDate: item.dueDate,
            category: item.category,
            status: item.status,
            createdAt: item.createdAt,
            isNow: item.isNow,
          }))
      }
    })

    return result
  }, [columns, groups])

  // Get all focusable IDs (all todos in order)
  const focusableIds = useMemo(() => {
    const ids: string[] = []
    columns.forEach((col) => {
      const todos = groupedData[col.id] || []
      todos.forEach((todo) => ids.push(todo.id))
    })
    return ids
  }, [columns, groupedData])

  // Use focus manager (same pattern as list view)
  const focusManager = useFocusManager(focusableIds)

  // Get store actions for unified focus/selection
  const { setActiveItem, setPendingFocus } = useStore()

  // Auto-focus newly created todos (empty title)
  useEffect(() => {
    const allTodos = Object.values(groupedData).flat()
    const emptyTitleTodo = allTodos.find((t) => !t.title?.trim())
    if (emptyTitleTodo) {
      setActiveItem(emptyTitleTodo.id)
      setPendingFocus(emptyTitleTodo.id)
    }
  }, [groupedData, setActiveItem, setPendingFocus])

  // Handle data change from drag and drop
  const handleDataChange = useCallback(
    (newData: Record<string, Todo[]>) => {
      Object.entries(newData).forEach(([columnId, columnTodos]) => {
        columnTodos.forEach((todo) => {
          const originalColumn = Object.entries(groupedData).find(([, todos]) =>
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
                  onUpdateTodo(todo.id, { isNow: false, dueDate: newDueDate })
                }
                break
              case "priority":
                onUpdateTodo(todo.id, {
                  priority: columnId === "none" ? undefined : (columnId as Todo["priority"]),
                })
                break
              case "status":
                if (columnId === "done") {
                  onToggleTodo(todo.id)
                } else if (originalColumn === "done") {
                  onToggleTodo(todo.id)
                  onUpdateTodo(todo.id, { status: columnId as Todo["status"] })
                } else {
                  onUpdateTodo(todo.id, { status: columnId as Todo["status"] })
                }
                break
              case "category":
                onUpdateTodo(todo.id, {
                  category: columnId === "uncategorized" ? undefined : columnId,
                })
                break
              case "project":
                // Project updates would need special handling
                break
            }
          }
        })
      })
    },
    [groupBy, groupedData, onUpdateTodo, onToggleTodo]
  )

  // Render drag overlay
  const renderDragOverlay = useCallback(
    (todo: Todo) => (
      <div className="w-72 rounded-lg border bg-card shadow-lg">
        <TaskItem todo={todo} interactive={false} className="px-3 py-2" />
      </div>
    ),
    []
  )

  return (
    <div className="h-full overflow-hidden">
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
                  onClick={() => setActiveItem(todo.id)}
                  className="p-0"
                >
                  <TaskItem
                    ref={(el) => focusManager.registerRef(todo.id, el)}
                    todo={todo}
                    onStatusChange={(id, status) => {
                      const completed = status === "done"
                      onUpdateTodo(id, { status, completed })
                    }}
                    onSelect={setActiveItem}
                    onTitleChange={(id, title) => onUpdateTodo(id, { title })}
                    mode="always"
                    showMetadata={showMetadata}
                    showPriorityIcon
                    excludeMetadata={[
                      ...(groupBy === "dueDate" ? (["dueDate"] as const) : []),
                      ...(groupBy === "category" ? (["category"] as const) : []),
                    ]}
                    keyboard={{
                      onArrowUp: () => {
                        const prevId = focusManager.getPrevId(todo.id)
                        if (prevId) {
                          setActiveItem(prevId)
                          focusManager.focus(prevId)
                        }
                      },
                      onArrowDown: () => {
                        const nextId = focusManager.getNextId(todo.id)
                        if (nextId) {
                          setActiveItem(nextId)
                          focusManager.focus(nextId)
                        }
                      },
                    }}
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
