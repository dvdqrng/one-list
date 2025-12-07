"use client"

import { CheckCircleIcon, XCircleIcon, WarningIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

type FeedbackType = "success" | "error" | "warning" | "timeout"

interface FeedbackBadgeProps {
  type: FeedbackType
  message: string
  className?: string
  position?: "top" | "bottom" | "inline"
}

const typeStyles: Record<FeedbackType, { className: string; icon: typeof CheckCircleIcon }> = {
  success: {
    className: "text-primary",
    icon: CheckCircleIcon,
  },
  error: {
    className: "text-destructive",
    icon: XCircleIcon,
  },
  warning: {
    className: "text-warning",
    icon: WarningIcon,
  },
  timeout: {
    className: "text-warning",
    icon: WarningIcon,
  },
}

export function FeedbackBadge({
  type,
  message,
  className,
  position = "inline",
}: FeedbackBadgeProps) {
  if (!message) return null

  const { className: typeClassName, icon: Icon } = typeStyles[type]

  const positionClasses = {
    top: "absolute -top-12 left-0 right-0",
    bottom: "absolute -bottom-12 left-0 right-0",
    inline: "",
  }

  return (
    <div
      className={cn(
        "px-4 py-2 bg-background border rounded-full shadow-lg",
        positionClasses[position],
        className
      )}
    >
      <span className={cn("font-medium flex items-center gap-1.5 text-sm", typeClassName)}>
        <Icon className="h-3.5 w-3.5" weight="fill" />
        {message}
      </span>
    </div>
  )
}
