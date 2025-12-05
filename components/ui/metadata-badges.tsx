"use client"

import { CalendarBlankIcon, FlagIcon } from "@phosphor-icons/react"
import { Badge } from "@/components/ui/badge"
import { formatDueDate } from "@/lib/format"
import type { Todo } from "@/lib/types"

interface MetadataBadgesProps {
  todo: Pick<Todo, "priority" | "dueDate" | "category">
  onClick?: () => void
  className?: string
  size?: "xs" | "sm"
  /** Hide specific fields (useful when grouping by that field) */
  exclude?: Array<"priority" | "dueDate" | "category">
  /** Show priority icon with color */
  showPriorityIcon?: boolean
  /** Custom date formatter */
  formatDate?: (date: string) => string
}

const priorityColors: Record<string, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-green-500",
}

export function MetadataBadges({
  todo,
  onClick,
  className,
  size = "xs",
  exclude = [],
  showPriorityIcon = false,
  formatDate = formatDueDate,
}: MetadataBadgesProps) {
  const showPriority = todo.priority && !exclude.includes("priority")
  const showDueDate = todo.dueDate && !exclude.includes("dueDate")
  const showCategory = todo.category && !exclude.includes("category")

  if (!showPriority && !showDueDate && !showCategory) {
    return null
  }

  const sizeClass = size === "xs" ? "text-xs" : "text-sm"

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${className || ""}`}
      onClick={onClick}
    >
      {showPriority && (
        <Badge variant="secondary" className={`${sizeClass} gap-1 cursor-pointer`}>
          {showPriorityIcon && (
            <FlagIcon
              className={`h-3 w-3 ${priorityColors[todo.priority!] || "text-muted-foreground"}`}
              weight="fill"
            />
          )}
          {todo.priority}
        </Badge>
      )}
      {showDueDate && (
        <Badge variant="secondary" className={`${sizeClass} gap-1 cursor-pointer`}>
          <CalendarBlankIcon className="h-3 w-3" weight="fill" />
          {formatDate(todo.dueDate!)}
        </Badge>
      )}
      {showCategory && (
        <Badge variant="secondary" className={`${sizeClass} cursor-pointer`}>
          {todo.category}
        </Badge>
      )}
    </div>
  )
}
