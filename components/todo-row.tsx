"use client"

import { useState, useRef, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

interface TodoRowProps {
  value: string
  onChange: (value: string) => void
  onDelete: () => void
  onEnter: () => void
  onBackspaceEmpty: () => void
  isProcessing?: boolean
  metadata?: {
    priority?: "low" | "medium" | "high"
    dueDate?: string
    category?: string
  }
  autoFocus?: boolean
  completed?: boolean
  onToggle?: () => void
  onClick?: () => void
  isSelected?: boolean
}

export function TodoRow({
  value,
  onChange,
  onDelete,
  onEnter,
  onBackspaceEmpty,
  isProcessing = false,
  metadata,
  autoFocus = false,
  completed = false,
  onToggle,
  onClick,
  isSelected = false,
}: TodoRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onEnter()
    } else if (e.key === "Backspace" && value === "") {
      e.preventDefault()
      onBackspaceEmpty()
    }
  }

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow"
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }
  }

  const getPriorityColor = (priority: "low" | "medium" | "high") => {
    switch (priority) {
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
    }
  }

  return (
    <div
      className={`group flex items-center gap-2 rounded-md border px-3 py-2 transition-colors ${
        isSelected
          ? "border-primary bg-primary/5"
          : isFocused
            ? "border-primary bg-muted/50"
            : "border-transparent hover:bg-muted/30"
      }`}
      onClick={onClick}
    >
      {onToggle && (
        <Checkbox
          checked={completed}
          onCheckedChange={onToggle}
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Type a task and press Enter..."
        className={`flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground ${
          completed ? "line-through opacity-60" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      />

      {isProcessing && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}

      {!isProcessing && metadata && (
        <div className="flex items-center gap-1">
          {metadata.priority && (
            <Badge variant={getPriorityColor(metadata.priority)}>
              {metadata.priority}
            </Badge>
          )}
          {metadata.dueDate && (
            <Badge variant="outline">
              📅 {formatDueDate(metadata.dueDate)}
            </Badge>
          )}
          {metadata.category && (
            <Badge variant="outline">
              {metadata.category}
            </Badge>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
