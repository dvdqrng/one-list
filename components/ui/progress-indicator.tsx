"use client"

import { cn } from "@/lib/utils"

interface ProgressIndicatorProps {
  completed: number
  total: number
  label?: string
  showLabel?: boolean
  showCount?: boolean
  className?: string
  barClassName?: string
}

export function ProgressIndicator({
  completed,
  total,
  label,
  showLabel = true,
  showCount = true,
  className,
  barClassName,
}: ProgressIndicatorProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className={cn("space-y-2", className)}>
      {(showLabel || showCount) && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {showLabel && <span>{label || "Progress"}</span>}
          {showCount && (
            <span>
              {completed} of {total} {label ? "" : "completed"}
            </span>
          )}
        </div>
      )}
      {total > 0 && (
        <div className={cn("h-2 bg-muted rounded-full overflow-hidden", barClassName)}>
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}
