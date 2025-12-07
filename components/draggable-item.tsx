"use client"

import { DotsSixVerticalIcon } from "@phosphor-icons/react"
import { useDraggable, useDroppable } from "@dnd-kit/core"

interface DraggableItemProps {
  id: string
  children: React.ReactNode
  /** Optional category data to pass to drop handlers */
  category?: string
}

/**
 * A draggable AND droppable wrapper for due date view.
 * Items can be dragged to change category, and other items can be dropped on them
 * to move to the same category.
 */
export function DraggableItem({ id, children, category }: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `item-${id}`,
    data: { category, itemId: id },
  })

  // Combine refs
  const setNodeRef = (node: HTMLDivElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 1000 : undefined,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isOver && !isDragging ? 'bg-primary/10 rounded-md' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[18px] opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity z-10"
      >
        <DotsSixVerticalIcon size={12} weight="bold" className="text-muted-foreground" />
      </div>
      {children}
    </div>
  )
}
