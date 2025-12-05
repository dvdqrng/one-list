"use client"

import { forwardRef, useCallback, type ReactNode, type KeyboardEvent } from "react"
import { CheckCircleIcon, CircleIcon, SpinnerIcon } from "@phosphor-icons/react"
import { Checkbox } from "@/components/ui/checkbox"
import { MetadataBadges } from "@/components/ui/metadata-badges"
import { cn } from "@/lib/utils"
import type { Todo } from "@/lib/types"

// ============================================
// Types
// ============================================

type TaskItemSize = "sm" | "md" | "lg"
type TaskItemVariant = "checkbox" | "icon"

export interface TaskItemKeyboardHandlers {
  /** Called on Enter key - typically insert new item */
  onEnter?: () => void
  /** Called on Backspace when title is empty - typically delete item */
  onBackspaceEmpty?: () => void
  /** Called on ArrowUp - navigate to previous item */
  onArrowUp?: () => void
  /** Called on ArrowDown - navigate to next item */
  onArrowDown?: () => void
  /** Called on Tab - increase indent */
  onTab?: () => void
  /** Called on Shift+Tab - decrease indent */
  onShiftTab?: () => void
  /** Called on Alt+Tab - convert item type */
  onAltTab?: () => void
  /** Called on Escape - exit editing */
  onEscape?: () => void
}

export interface TaskItemProps {
  todo: Pick<Todo, "id" | "title" | "completed"> &
    Partial<Pick<Todo, "priority" | "dueDate" | "category" | "aiProcessingStatus" | "indent">>
  /** Called when checkbox/icon is toggled */
  onToggle?: (id: string) => void
  /** Called when the entire item is clicked */
  onClick?: (id: string) => void
  /** Called when title text changes */
  onTitleChange?: (id: string, title: string) => void
  /** Called when item receives focus */
  onFocus?: (id: string) => void
  /** Size variant */
  size?: TaskItemSize
  /** Checkbox or icon style */
  variant?: TaskItemVariant
  /** Additional class names */
  className?: string
  /** Enable hover/click interactions */
  interactive?: boolean
  /** Show metadata badges */
  showMetadata?: boolean
  /** Fields to exclude from metadata badges */
  excludeMetadata?: Array<"priority" | "dueDate" | "category">
  /** Show priority icon in badges */
  showPriorityIcon?: boolean
  /** Enable inline text input (vs display only) */
  editable?: boolean
  /** Control editing state externally (for toggle edit mode) */
  isEditing?: boolean
  /** Called when title is clicked to start editing */
  onStartEdit?: (id: string) => void
  /** Called when editing should end (blur, Enter, Escape) */
  onFinishEdit?: (id: string) => void
  /** Placeholder text for input */
  placeholder?: string
  /** Indent level (for sub-tasks) */
  indentLevel?: number
  /** Keyboard navigation handlers */
  keyboard?: TaskItemKeyboardHandlers
  /** Callback when metadata badges are clicked */
  onMetadataClick?: (id: string) => void
  /** Custom content after the main content */
  children?: ReactNode
}

// ============================================
// Style Constants
// ============================================

const sizeClasses: Record<TaskItemSize, string> = {
  sm: "py-1.5 px-2 text-sm gap-2",
  md: "py-1 px-3 text-sm gap-2",
  lg: "p-3 text-lg gap-3",
}

const iconSizes: Record<TaskItemSize, string> = {
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-5 w-5",
}

const checkboxSizes: Record<TaskItemSize, string> = {
  sm: "",
  md: "",
  lg: "h-5 w-5",
}

const inputSizes: Record<TaskItemSize, string> = {
  sm: "text-sm",
  md: "text-sm",
  lg: "text-lg",
}

// ============================================
// Component
// ============================================

export const TaskItem = forwardRef<HTMLInputElement, TaskItemProps>(
  function TaskItem(
    {
      todo,
      onToggle,
      onClick,
      onTitleChange,
      onFocus,
      size = "md",
      variant = "checkbox",
      className,
      interactive = true,
      showMetadata = false,
      excludeMetadata = [],
      showPriorityIcon = false,
      editable = false,
      isEditing: isEditingProp,
      onStartEdit,
      onFinishEdit,
      placeholder = "Type a task...",
      indentLevel = 0,
      keyboard,
      onMetadataClick,
      children,
    },
    ref
  ) {
    const isProcessing = todo.aiProcessingStatus === "processing" || todo.aiProcessingStatus === "pending"
    const totalIndent = indentLevel + (todo.indent ?? 0)

    // Determine if we should show input: either always editable OR in editing mode
    const showInput = editable || isEditingProp

    // Keyboard handler for input
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
      // Handle Enter/Escape for toggled edit mode
      if (isEditingProp && !editable) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault()
          onFinishEdit?.(todo.id)
          return
        }
      }

      if (!keyboard) return

      // Alt+Tab - convert item type (highest priority)
      if (e.key === "Tab" && e.altKey) {
        e.preventDefault()
        keyboard.onAltTab?.()
        return
      }

      // Tab - indent
      if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        keyboard.onTab?.()
        return
      }

      // Shift+Tab - outdent
      if (e.key === "Tab" && e.shiftKey && !e.altKey) {
        e.preventDefault()
        keyboard.onShiftTab?.()
        return
      }

      // Arrow Up - navigate up
      if (e.key === "ArrowUp") {
        e.preventDefault()
        keyboard.onArrowUp?.()
        return
      }

      // Arrow Down - navigate down
      if (e.key === "ArrowDown") {
        e.preventDefault()
        keyboard.onArrowDown?.()
        return
      }

      // Enter - insert new item
      if (e.key === "Enter") {
        e.preventDefault()
        keyboard.onEnter?.()
        return
      }

      // Escape - exit editing
      if (e.key === "Escape") {
        e.preventDefault()
        keyboard.onEscape?.()
        return
      }

      // Backspace on empty - delete item
      if (e.key === "Backspace" && !todo.title) {
        e.preventDefault()
        keyboard.onBackspaceEmpty?.()
        return
      }
    }, [keyboard, todo.title, isEditingProp, editable, onFinishEdit, todo.id])

    return (
      <div
        className={cn(
          "group flex items-center rounded-md border border-transparent transition-colors",
          sizeClasses[size],
          interactive && "hover:bg-muted/30",
          className
        )}
        style={{ paddingLeft: totalIndent > 0 ? `${12 + totalIndent * 24}px` : undefined }}
        onClick={() => onClick?.(todo.id)}
      >
        {/* Checkbox or Icon */}
        {variant === "checkbox" ? (
          <Checkbox
            checked={todo.completed}
            onCheckedChange={() => onToggle?.(todo.id)}
            onClick={(e) => {
              e.stopPropagation()
              onClick?.(todo.id)
            }}
            className={cn("shrink-0", checkboxSizes[size])}
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.(todo.id)
            }}
            className="shrink-0"
          >
            {todo.completed ? (
              <CheckCircleIcon
                className={cn(iconSizes[size], "text-primary")}
                weight="fill"
              />
            ) : (
              <CircleIcon
                className={cn(iconSizes[size], "text-muted-foreground")}
                weight="regular"
              />
            )}
          </button>
        )}

        {/* Title - editable input or display span */}
        {showInput ? (
          <input
            ref={ref}
            type="text"
            value={todo.title || ""}
            onChange={(e) => onTitleChange?.(todo.id, e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={isEditingProp ? () => onFinishEdit?.(todo.id) : undefined}
            onFocus={() => onFocus?.(todo.id)}
            onClick={(e) => e.stopPropagation()}
            placeholder={placeholder}
            autoFocus={isEditingProp}
            className={cn(
              "flex-1 bg-transparent outline-none placeholder:text-muted-foreground",
              inputSizes[size],
              todo.completed && "line-through opacity-60"
            )}
          />
        ) : (
          <span
            className={cn(
              "flex-1 truncate",
              onStartEdit && "cursor-text",
              todo.completed && "line-through text-muted-foreground opacity-60"
            )}
            onClick={(e) => {
              if (onStartEdit) {
                e.stopPropagation()
                onStartEdit(todo.id)
              }
            }}
          >
            {todo.title || "Untitled"}
          </span>
        )}

        {/* AI Processing Spinner */}
        {isProcessing && (
          <SpinnerIcon
            className={cn(iconSizes[size], "animate-spin text-muted-foreground shrink-0")}
            weight="bold"
          />
        )}

        {/* Metadata Badges */}
        {showMetadata && (
          <MetadataBadges
            todo={todo}
            size="xs"
            showPriorityIcon={showPriorityIcon}
            exclude={excludeMetadata}
            onClick={onMetadataClick ? () => onMetadataClick(todo.id) : undefined}
          />
        )}

        {/* Custom children */}
        {children}
      </div>
    )
  }
)

// Re-export types for consumers
export type { TaskItemSize, TaskItemVariant }
