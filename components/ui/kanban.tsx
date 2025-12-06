"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

// ============================================
// Types
// ============================================

interface KanbanColumn<T> {
  id: string
  title: string
  color?: string
}

interface KanbanContextValue<T> {
  columns: KanbanColumn<T>[]
  data: Record<string, T[]>
  activeId: UniqueIdentifier | null
  activeItem: T | null
  getItemId: (item: T) => string
}

// ============================================
// Context
// ============================================

const KanbanContext = React.createContext<KanbanContextValue<any> | null>(null)

function useKanbanContext<T>() {
  // We use `any` here to match the initial context value, but the hook
  // is generic and the returned context will be correctly typed based on
  // the provider's value.
  const context = React.useContext(
    KanbanContext as React.Context<KanbanContextValue<T> | null>
  )
  if (!context) {
    throw new Error("useKanbanContext must be used within a KanbanProvider")
  }
  return context
}

// ============================================
// KanbanProvider
// ============================================

interface KanbanProviderProps<T> {
  children: (column: KanbanColumn<T>) => React.ReactNode
  columns: KanbanColumn<T>[]
  data: Record<string, T[]>
  onDataChange?: (data: Record<string, T[]>) => void
  onDragStart?: (event: DragStartEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragOver?: (event: DragOverEvent) => void
  getItemId: (item: T) => string
  renderDragOverlay?: (item: T) => React.ReactNode
}

function KanbanProvider<T>({
  children,
  columns,
  data,
  onDataChange,
  onDragStart,
  onDragEnd,
  onDragOver,
  getItemId,
  renderDragOverlay,
}: KanbanProviderProps<T>) {
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)
  const [activeItem, setActiveItem] = React.useState<T | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const findItemById = React.useCallback(
    (id: UniqueIdentifier): T | null => {
      for (const columnId of Object.keys(data)) {
        const item = data[columnId].find((item) => getItemId(item) === id)
        if (item) return item
      }
      return null
    },
    [data, getItemId]
  )

  const findColumnByItemId = React.useCallback(
    (id: UniqueIdentifier): string | null => {
      for (const columnId of Object.keys(data)) {
        const item = data[columnId].find((item) => getItemId(item) === id)
        if (item) return columnId
      }
      return null
    },
    [data, getItemId]
  )

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const { active } = event
      setActiveId(active.id)
      const item = findItemById(active.id)
      setActiveItem(item)
      onDragStart?.(event)
    },
    [findItemById, onDragStart]
  )

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setActiveItem(null)

      if (!over) {
        onDragEnd?.(event)
        return
      }

      const activeColumnId = findColumnByItemId(active.id)
      const overIsColumn = columns.some((c) => c.id === over.id)
      const overColumnId = overIsColumn
        ? (over.id as string)
        : findColumnByItemId(over.id)

      if (!activeColumnId || !overColumnId) {
        onDragEnd?.(event)
        return
      }

      const activeItem = findItemById(active.id)
      if (!activeItem) {
        onDragEnd?.(event)
        return
      }

      // Handle reordering within the same list
      if (activeColumnId === overColumnId) {
        const oldIndex = data[activeColumnId].findIndex(
          (item) => getItemId(item) === active.id
        )
        const newIndex = data[activeColumnId].findIndex(
          (item) => getItemId(item) === over.id
        )

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          onDataChange?.({
            ...data,
            [activeColumnId]: arrayMove(
              data[activeColumnId],
              oldIndex,
              newIndex
            ),
          })
        }
      } else {
        // Handle moving between lists (Kanban)
        const overItems = data[overColumnId] || []
        const overIndex = overIsColumn
          ? overItems.length // Drop at the end of the list
          : overItems.findIndex((item) => getItemId(item) === over.id)

        const newOverItems = [...overItems]
        if (overIndex !== -1) {
          newOverItems.splice(overIndex, 0, activeItem)
        } else {
          // Fallback if over.id is not an item in the target column
          newOverItems.push(activeItem)
        }

        onDataChange?.({
          ...data,
          [activeColumnId]: data[activeColumnId].filter(
            (item) => getItemId(item) !== active.id
          ),
          [overColumnId]: newOverItems,
        })
      }

      onDragEnd?.(event)
    },
    [
      columns,
      data,
      findColumnByItemId,
      getItemId,
      onDataChange,
      onDragEnd,
      findItemById,
    ]
  )

  const contextValue = React.useMemo(
    () => ({
      columns,
      data,
      activeId,
      activeItem,
      getItemId,
    }),
    [columns, data, activeId, activeItem, getItemId]
  )

  return (
    <KanbanContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={onDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-full min-h-0 gap-0 overflow-x-auto pb-4">
          {columns.map((column) => (
            <React.Fragment key={column.id}>{children(column)}</React.Fragment>
          ))}
        </div>
        <DragOverlay>
          {activeItem && renderDragOverlay?.(activeItem)}
        </DragOverlay>
      </DndContext>
    </KanbanContext.Provider>
  )
}

// ============================================
// KanbanBoard (Column)
// ============================================

interface KanbanBoardProps {
  id: string
  children: React.ReactNode
  className?: string
}

function KanbanBoard({ id, children, className }: KanbanBoardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col border-r border-border/60 last:border-r-0",
        isOver && "bg-muted/20",
        className
      )}
    >
      {children}
    </div>
  )
}

// ============================================
// KanbanHeader
// ============================================

interface KanbanHeaderProps {
  columnId: string
  children: React.ReactNode
  className?: string
  color?: string
  count?: number
  onAdd?: (columnId: string) => void
}

function KanbanHeader({ columnId, children, className, onAdd }: KanbanHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-3 py-2", className)}>
      <span className="text-sm font-semibold">{children}</span>
      {onAdd && (
        <button
          onClick={() => onAdd(columnId)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Add item"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      )}
    </div>
  )
}

// ============================================
// KanbanCards (container for cards)
// ============================================

interface KanbanCardsProps<T> {
  columnId: string
  children: (item: T) => React.ReactNode
  className?: string
}

function KanbanCards<T>({ columnId, children, className }: KanbanCardsProps<T>) {
  const { data, getItemId } = useKanbanContext<T>()
  const items = data[columnId] || []
  const itemIds = items.map(getItemId)

  return (
    <div className="flex-1 overflow-y-auto">
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className={cn("flex flex-col gap-2 px-3 py-2", className)}>
          {items.map((item) => (
            <React.Fragment key={getItemId(item)}>
              {children(item)}
            </React.Fragment>
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ============================================
// KanbanCard
// ============================================

interface KanbanCardProps {
  id: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
  "data-kanban-card"?: string
}

const KanbanCard = React.memo(function KanbanCard({ id, children, className, onClick, "data-kanban-card": dataKanbanCard }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "select-none gap-2 rounded-lg border-0 bg-card cursor-grab",
        isDragging && "opacity-50",
        className
      )}
      onClick={onClick}
      data-kanban-card={dataKanbanCard}
      {...attributes}
      {...listeners}
    >
      {children}
    </Card>
  )
})

// ============================================
// Exports
// ============================================

export {
  KanbanProvider,
  KanbanBoard,
  KanbanHeader,
  KanbanCards,
  KanbanCard,
  useKanbanContext,
  type KanbanColumn,
}
