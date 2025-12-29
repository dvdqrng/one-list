"use client"

import { forwardRef, useCallback, useEffect, useRef, useImperativeHandle, type ReactNode, type KeyboardEvent } from "react"
import { CheckCircleIcon, CircleIcon, SpinnerIcon, CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react"
import { Checkbox, type CheckboxStatus } from "@/components/ui/checkbox"
import { MetadataBadges } from "@/components/ui/metadata-badges"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import type { Todo, TodoStatus } from "@/lib/types"

// ============================================
// Types
// ============================================

type TaskItemSize = "sm" | "md" | "lg"
type TaskItemVariant = "checkbox" | "icon"

/**
 * Edit mode for TaskItem:
 * - "always": Input is always shown (list view behavior)
 * - "toggle": Input shown only when isEditing=true (kanban behavior)
 * - "readonly": No editing, display only
 */
type TaskItemMode = "always" | "toggle" | "readonly"

export interface TaskItemKeyboardHandlers {
  onEnter?: () => void
  onBackspaceEmpty?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onTab?: () => void
  onShiftTab?: () => void
  onAltTab?: () => void
  onEscape?: () => void
}

export interface TaskItemProps {
  /** Task data - minimal required fields */
  todo: Pick<Todo, "id" | "title" | "completed"> &
  Partial<Pick<Todo, "priority" | "dueDate" | "category" | "aiProcessingStatus" | "indent" | "status">>

  /** Called when checkbox is toggled (legacy) */
  onToggle?: (id: string) => void

  /** Called when status changes (three-state: due -> in-progress -> done) */
  onStatusChange?: (id: string, status: TodoStatus) => void

  /** Called when item is selected (click, focus) */
  onSelect?: (id: string) => void

  /** Called when title changes */
  onTitleChange?: (id: string, title: string) => void

  /** Keyboard handlers */
  keyboard?: TaskItemKeyboardHandlers

  // ---- Display options ----

  /** Size variant */
  size?: TaskItemSize

  /** Checkbox or icon style */
  variant?: TaskItemVariant

  /** Additional class names */
  className?: string

  /** Enable hover effects */
  interactive?: boolean

  /** Base indent level (added to todo.indent) */
  indentLevel?: number

  /** Placeholder text for input */
  placeholder?: string

  // ---- Metadata display ----

  /** Show metadata badges */
  showMetadata?: boolean

  /** Fields to exclude from metadata badges */
  excludeMetadata?: Array<"priority" | "dueDate" | "category">

  /** Show priority icon in badges */
  showPriorityIcon?: boolean

  // ---- Edit mode ----

  /** Edit mode: "always" (list), "toggle" (kanban), "readonly" */
  mode?: TaskItemMode

  /** For toggle mode: whether currently editing */
  isEditing?: boolean

  /** For toggle mode: start editing */
  onStartEdit?: (id: string) => void

  /** For toggle mode: finish editing */
  onFinishEdit?: (id: string) => void

  /** Custom content after the main content */
  children?: ReactNode

  /** Handler for collapsing/expanding if item is a parent */
  onCollapseToggle?: () => void

  /** Collapse state */
  isCollapsed?: boolean
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

// Base padding values matching the px-* classes in sizeClasses
const basePadding: Record<TaskItemSize, number> = {
  sm: 8,
  md: 12,
  lg: 12,
}

export const TaskItem = forwardRef<HTMLInputElement, TaskItemProps>(
  function TaskItem(
    {
      todo,
      onToggle,
      onStatusChange,
      onSelect,
      onTitleChange,
      keyboard,
      size = "md",
      variant = "checkbox",
      className,
      interactive = true,
      indentLevel = 0,
      placeholder = "Type a task...",
      showMetadata = false,
      excludeMetadata = [],
      showPriorityIcon = false,
      mode,
      isEditing: isEditingProp,
      onStartEdit,
      onFinishEdit,
      children,
      onCollapseToggle,
      isCollapsed,
    },
    ref
  ) {
    // Internal ref for the input element
    const inputRef = useRef<HTMLInputElement>(null)

    // Expose the input ref to parent via forwardRef
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    // Get pending focus from store
    const clearPendingFocus = useStore((state) => state.clearPendingFocus)

    // Resolve mode from props
    const resolvedMode: TaskItemMode = mode ?? (isEditingProp !== undefined ? "toggle" : "readonly")

    // Unified select handler
    const handleSelect = onSelect

    const isProcessing = todo.aiProcessingStatus === "processing" || todo.aiProcessingStatus === "pending"
    const totalIndent = indentLevel + (todo.indent ?? 0)

    // Should show input?
    const showInput = resolvedMode === "always" || (resolvedMode === "toggle" && isEditingProp)

    // Track if this is the initial mount
    const isInitialMount = useRef(true)
    const lastSyncedTitle = useRef(todo.title || "")

    // Check if this item should be focused:
    // 1. On mount (for newly created items via pendingFocusId)
    // 2. When showInput becomes true (for toggle mode editing)
    useEffect(() => {
      if (showInput && clearPendingFocus(todo.id)) {
        // Use setTimeout to ensure the DOM is fully ready
        setTimeout(() => {
          inputRef.current?.focus()
        }, 0)
      }
    }, [showInput, todo.id, clearPendingFocus])

    // Sync input value from props only when:
    // 1. Component just mounted (use defaultValue instead)
    // 2. Title changed externally (not from user typing) AND input is not focused
    useEffect(() => {
      // Skip on initial mount - defaultValue handles it
      if (isInitialMount.current) {
        isInitialMount.current = false
        return
      }

      // Only sync if title actually changed from what we last synced
      // AND the input is not currently focused
      if (
        inputRef.current &&
        document.activeElement !== inputRef.current &&
        todo.title !== lastSyncedTitle.current
      ) {
        inputRef.current.value = todo.title || ""
        lastSyncedTitle.current = todo.title || ""
      }
    }, [todo.title])

    // Update lastSyncedTitle when user types
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      lastSyncedTitle.current = e.target.value
      onTitleChange?.(todo.id, e.target.value)
    }, [todo.id, onTitleChange])

    // Get current value from input ref (for backspace check)
    const getCurrentValue = useCallback(() => {
      return inputRef.current?.value ?? todo.title ?? ""
    }, [todo.title])

    // Keyboard handler
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
      // Handle Enter/Escape for toggle mode
      if (resolvedMode === "toggle" && isEditingProp) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault()
          onFinishEdit?.(todo.id)
          return
        }
      }

      if (!keyboard) return

      // Alt+Tab - convert item type
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

      // Arrow Up
      if (e.key === "ArrowUp") {
        e.preventDefault()
        keyboard.onArrowUp?.()
        return
      }

      // Arrow Down
      if (e.key === "ArrowDown") {
        e.preventDefault()
        keyboard.onArrowDown?.()
        return
      }

      // Enter
      if (e.key === "Enter") {
        e.preventDefault()
        keyboard.onEnter?.()
        return
      }

      // Escape
      if (e.key === "Escape") {
        e.preventDefault()
        keyboard.onEscape?.()
        return
      }

      // Backspace on empty - check actual input value, not prop
      if (e.key === "Backspace" && !getCurrentValue()) {
        e.preventDefault()
        keyboard.onBackspaceEmpty?.()
        return
      }
    }, [keyboard, todo.id, resolvedMode, isEditingProp, onFinishEdit, getCurrentValue])

    return (
      <div
        className={cn(
          "group flex items-center rounded-md border border-transparent transition-colors",
          sizeClasses[size],
          interactive && "hover:bg-muted/30",
          className
        )}
        style={{ paddingLeft: `${totalIndent * 20 + basePadding[size]}px` }}
        onClick={() => handleSelect?.(todo.id)}
      >

        {/* Checkbox or Icon or Chevron */}
        {(() => {
          if (onCollapseToggle) {
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCollapseToggle()
                }}
                className={cn("shrink-0 rounded-sm hover:bg-muted/50 text-muted-foreground transition-colors outline-none", iconSizes[size])}
              >
                {isCollapsed ? (
                  <CaretRightIcon className="w-full h-full" weight="bold" />
                ) : (
                  <CaretDownIcon className="w-full h-full" weight="bold" />
                )}
              </button>
            )
          }

          // Convert TodoStatus to CheckboxStatus
          const getCheckboxStatus = (): CheckboxStatus => {
            if (todo.completed || todo.status === "done") return "checked"
            if (todo.status === "in-progress") return "in-progress"
            return "unchecked"
          }

          // Convert CheckboxStatus to TodoStatus
          const handleStatusChange = (checkboxStatus: CheckboxStatus) => {
            const todoStatus: TodoStatus =
              checkboxStatus === "checked" ? "done" :
                checkboxStatus === "in-progress" ? "in-progress" : "due"

            if (onStatusChange) {
              onStatusChange(todo.id, todoStatus)
            } else if (onToggle) {
              // Legacy: only toggle if going to/from done
              if (checkboxStatus === "checked" || getCheckboxStatus() === "checked") {
                onToggle(todo.id)
              }
            }
          }

          const checkboxStatus = getCheckboxStatus()

          if (variant === "checkbox") {
            return (
              <Checkbox
                status={checkboxStatus}
                onStatusChange={handleStatusChange}
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelect?.(todo.id)
                }}
                className={cn("shrink-0", checkboxSizes[size])}
              />
            )
          }

          // Icon variant
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                // Cycle: unchecked -> in-progress -> checked -> unchecked
                const nextStatus: CheckboxStatus =
                  checkboxStatus === "unchecked" ? "in-progress" :
                    checkboxStatus === "in-progress" ? "checked" : "unchecked"
                handleStatusChange(nextStatus)
              }}
              className="shrink-0"
            >
              {checkboxStatus === "checked" && (
                <CheckCircleIcon
                  className={cn(iconSizes[size], "text-primary")}
                  weight="fill"
                />
              )}
              {checkboxStatus === "in-progress" && (
                <div className={cn(iconSizes[size], "rounded-full border-2 border-yellow-500 flex items-center justify-center overflow-hidden")}>
                  <div className="size-2 rounded-full bg-yellow-500" style={{ clipPath: 'inset(0 50% 0 0)' }} />
                </div>
              )}
              {checkboxStatus === "unchecked" && (
                <CircleIcon
                  className={cn(iconSizes[size], "text-muted-foreground")}
                  weight="regular"
                />
              )}
            </button>
          )
        })()}

        {/* Title */}
        {showInput ? (
          <input
            ref={inputRef}
            type="text"
            defaultValue={todo.title || ""}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={resolvedMode === "toggle" ? () => onFinishEdit?.(todo.id) : undefined}
            onFocus={() => handleSelect?.(todo.id)}
            onClick={(e) => e.stopPropagation()}
            placeholder={placeholder}
            autoFocus={resolvedMode === "toggle" && isEditingProp}
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
            onClick={handleSelect ? () => handleSelect(todo.id) : undefined}
          />
        )}

        {/* Custom children */}
        {children}
      </div>
    )
  }
)

// Re-export types
export type { TaskItemSize, TaskItemVariant, TaskItemMode }
