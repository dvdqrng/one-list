"use client"

import type { ReactNode } from "react"
import { CaretDownIcon, CaretRightIcon, PlayIcon } from "@phosphor-icons/react"
import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"

interface CollapsibleHeaderProps {
  id: string
  label: string
  isCollapsed: boolean
  onToggle: () => void
  isFirst?: boolean
  itemCount?: number
  highlighted?: boolean
  actionButton?: ReactNode
  droppable?: boolean
  droppableData?: Record<string, unknown>
  className?: string
}

export function CollapsibleHeader({
  id,
  label,
  isCollapsed,
  onToggle,
  isFirst = false,
  itemCount,
  highlighted = false,
  actionButton,
  droppable = false,
  droppableData,
  className,
}: CollapsibleHeaderProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppable ? `drop-${id}` : id,
    data: droppableData,
    disabled: !droppable,
  })

  return (
    <div
      ref={droppable ? setNodeRef : undefined}
      className={cn(
        "group flex items-center gap-2 rounded-md px-3 py-2 transition-opacity cursor-pointer",
        !isFirst && "mt-4",
        droppable && isOver && "text-primary opacity-90",
        className
      )}
      onClick={onToggle}
    >
      <button
        type="button"
        className="shrink-0 text-muted-foreground transition-opacity outline-none hover:opacity-70"
      >
        {isCollapsed ? (
          <CaretRightIcon className="h-4 w-4" weight="bold" />
        ) : (
          <CaretDownIcon className="h-4 w-4" weight="bold" />
        )}
      </button>
      <span className={cn("text-lg font-semibold", highlighted && "text-primary")}>
        {label}
      </span>
      {itemCount !== undefined && itemCount > 0 && (
        <span className="text-sm text-muted-foreground ml-1">({itemCount})</span>
      )}
      {actionButton && (
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          {actionButton}
        </div>
      )}
    </div>
  )
}

// Specialized variant for due date categories with focus button
interface DueDateHeaderProps {
  category: string
  label: string
  isCollapsed: boolean
  onToggle: () => void
  isFirst?: boolean
  itemCount?: number
  onStartFocus?: () => void
}

export function DueDateHeader({
  category,
  label,
  isCollapsed,
  onToggle,
  isFirst = false,
  itemCount,
  onStartFocus,
}: DueDateHeaderProps) {
  const isNowCategory = category === "now"

  return (
    <CollapsibleHeader
      id={category}
      label={label}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
      isFirst={isFirst}
      itemCount={itemCount}
      highlighted={isNowCategory}
      droppable
      droppableData={{ category }}
      actionButton={
        isNowCategory && onStartFocus ? (
          <button
            type="button"
            onClick={onStartFocus}
            className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Start focus session"
          >
            <PlayIcon className="h-3 w-3" weight="fill" />
          </button>
        ) : undefined
      }
    />
  )
}
