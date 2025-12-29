"use client"

import type { ReactNode } from "react"
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react"
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
  labelClassName?: string
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
  labelClassName,
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
        "group flex items-center gap-3 rounded-md px-3 py-2 transition-opacity cursor-pointer",
        !isFirst && "mt-4",
        className,
        droppable && isOver && "text-primary opacity-90 bg-muted/40"
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-1">
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
        <span
          className={cn(
            "font-semibold",
            highlighted && "text-primary",
            labelClassName ?? "text-lg"
          )}
        >
          {label}
        </span>
        {actionButton && (
          <div onClick={(e) => e.stopPropagation()}>{actionButton}</div>
        )}
      </div>
      {itemCount !== undefined && itemCount > 0 && (
        <span className="text-sm text-muted-foreground">({itemCount})</span>
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
  className?: string
  droppable?: boolean
  labelClassName?: string
}

export function DueDateHeader({
  category,
  label,
  isCollapsed,
  onToggle,
  isFirst = false,
  itemCount,
  onStartFocus,
  className,
  droppable = true,
  labelClassName,
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
      highlighted={false}
      droppable={droppable}
      droppableData={droppable ? { category } : undefined}
      className={className}
      labelClassName={labelClassName}
      actionButton={
        isNowCategory && onStartFocus ? (
          <button
            type="button"
            onClick={onStartFocus}
            className="text-sm font-medium text-foreground transition-opacity hover:opacity-70 active:opacity-60"
            title="Start focus session"
          >
            Focus
          </button>
        ) : undefined
      }
    />
  )
}
