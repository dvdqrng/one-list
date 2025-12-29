"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { EmptyState } from "@/components/ui/empty-state"
import { ProgressIndicator } from "@/components/ui/progress-indicator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { LightningIcon, WarningCircleIcon, FolderIcon, PencilSimpleIcon, PlusCircleIcon } from "@phosphor-icons/react"
import { aiQueueManager } from "@/lib/ai"
import { useStore } from "@/lib/store"
import type { Todo, TodoStatus, Item } from "@/lib/types"
import { sortItemsByPosition, isTodo, isSeparator } from "@/lib/types"
import { TaskItem } from "@/components/ui/task-item"
import { cn } from "@/lib/utils"

interface TodoSidebarProps {
  selectedTodo: Todo | undefined
  allTodos: Todo[]
  allItems: Item[]
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void
  onUpdateTitle?: (id: string, text: string) => void // Kept for API compat, likely unused
  onRenameCategory?: (oldName: string, newName: string) => void
  onDeleteCategory?: (categoryName: string) => void
  onMoveToProject?: (todoId: string, targetProjectId: string | null) => void
}

export function TodoSidebar({ selectedTodo, allTodos, allItems, onUpdateTodo, onRenameCategory, onMoveToProject }: TodoSidebarProps) {
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryValue, setEditingCategoryValue] = useState("")
  const [editingProject, setEditingProject] = useState(false)
  const [editingProjectValue, setEditingProjectValue] = useState("")
  const titleInputRef = useRef<HTMLTextAreaElement>(null)
  const { clearPendingFocus, insertItemAfter, setActiveItem, setPendingFocus } = useStore()

  // Auto-focus title input when this todo has pendingFocus and empty title
  useEffect(() => {
    if (selectedTodo && clearPendingFocus(selectedTodo.id) && !selectedTodo.title?.trim()) {
      titleInputRef.current?.focus()
    }
  }, [selectedTodo?.id, clearPendingFocus])

  // Sort items by position for group calculations
  const sortedItems = useMemo(() => sortItemsByPosition(allItems), [allItems])

  // Helper to find parent todo for a todo
  // In the new hierarchy, a parent is the nearest preceding item with a lower indentation level
  const findParentTodo = useMemo(() => {
    return (todoId: string): Todo | undefined => {
      const todoIndex = sortedItems.findIndex(item => item.id === todoId)
      if (todoIndex === -1) return undefined

      const currentItem = sortedItems[todoIndex]
      const currentIndent = currentItem.indent || 0

      if (currentIndent === 0) return undefined // Already root

      // Look backwards for parent (nearest item with indent < current)
      for (let i = todoIndex - 1; i >= 0; i--) {
        const item = sortedItems[i]
        if (isSeparator(item)) continue
        const indent = item.indent || 0
        if (indent < currentIndent && isTodo(item)) {
          // Found the parent
          return allTodos.find(t => t.id === item.id)
        }
      }
      return undefined
    }
  }, [sortedItems, allTodos])

  // Get the parent title for the selected todo
  const parentTodo = useMemo(() => {
    if (!selectedTodo) return undefined
    return findParentTodo(selectedTodo.id)
  }, [selectedTodo, findParentTodo])

  // Extract unique categories
  const existingCategories = useMemo(() => {
    const categories = allTodos
      .map((todo) => todo.category)
      .filter((cat): cat is string => !!cat)
    return [...new Set(categories)].sort()
  }, [allTodos])

  // If the selected item itself is a project (has children), show its children stats?
  // Or simple behavior: just show details.
  // Let's implement basic "Children" view if selected item is a parent.
  const subTasks = useMemo(() => {
    if (!selectedTodo) return []
    // Find children: Items immediately following with indent > current, until indent <= current
    const idx = sortedItems.findIndex(i => i.id === selectedTodo.id)
    if (idx === -1) return []

    const children: Todo[] = []
    const baseIndent = selectedTodo.indent || 0

    for (let i = idx + 1; i < sortedItems.length; i++) {
      const item = sortedItems[i]
      const indent = item.indent || 0
      if (indent <= baseIndent) break; // End of subtree
      if (isTodo(item) && indent === baseIndent + 1) { // Direct children only
        const t = allTodos.find(todo => todo.id === item.id)
        if (t) children.push(t)
      }
    }
    return children
  }, [selectedTodo, sortedItems, allTodos])

  const completedCount = subTasks.filter((t) => t.completed).length
  const totalCount = subTasks.length
  const projectCompletionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const isProjectView = !!selectedTodo && (selectedTodo.indent || 0) === 0 && totalCount > 0

  const handleSelectSubtask = useCallback((id: string) => {
    setActiveItem(id)
    setPendingFocus(id)
  }, [setActiveItem, setPendingFocus])

  const handleAddSubtask = useCallback(() => {
    if (!selectedTodo) return
    const projectIndent = selectedTodo.indent || 0
    const projectIndex = sortedItems.findIndex((item) => item.id === selectedTodo.id)
    let insertAfterId: string | null = selectedTodo.id

    if (projectIndex !== -1) {
      for (let i = projectIndex + 1; i < sortedItems.length; i++) {
        const item = sortedItems[i]
        const indent = item.indent || 0
        if (indent <= projectIndent) break
        insertAfterId = item.id
      }
    }

    const newId = insertItemAfter(insertAfterId, { indent: projectIndent + 1 })
    setActiveItem(newId)
    setPendingFocus(newId)
  }, [insertItemAfter, selectedTodo, setActiveItem, setPendingFocus, sortedItems])

  // Auto-resize title textarea
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.style.height = "auto"
      titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`
    }
  }, [selectedTodo?.title])

  if (!selectedTodo) {
    return (
      <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="bg-background border-l">
        <SidebarContent>
          <EmptyState
            icon={<WarningCircleIcon className="h-8 w-8 text-muted-foreground" weight="fill" />}
            title="No task selected"
            description="Click on a task to view details"
            className="flex-1 p-6 group-data-[collapsible=icon]:hidden"
          />
        </SidebarContent>
      </Sidebar>
    )
  }

  return (
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="bg-background border-l">
      <SidebarHeader className="h-11 flex flex-row items-center justify-end px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => {
            aiQueueManager.enqueue({
              todoId: selectedTodo.id,
              inputText: selectedTodo.title || "",
              type: "enhance",
            })
          }}
          title="Re-enrich with AI"
        >
          <LightningIcon className="h-4 w-4" weight="regular" />
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {isProjectView ? (
          <div key={`${selectedTodo.id}-project`} className="flex flex-col pt-0 px-4 pb-4 gap-4 group-data-[collapsible=icon]:hidden">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FolderIcon className="h-6 w-6 text-muted-foreground shrink-0" weight="fill" />
                <Input
                  id="projectTitle"
                  value={selectedTodo.title}
                  onChange={(e) => onUpdateTodo?.(selectedTodo.id, { title: e.target.value })}
                  className="flex-1 text-2xl font-bold border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 shadow-none h-auto focus:ring-0 focus:outline-none"
                  placeholder="Project name..."
                />
              </div>
              <Textarea
                id="projectNotes"
                value={selectedTodo.details || ""}
                onChange={(e) => onUpdateTodo?.(selectedTodo.id, { details: e.target.value })}
                className="resize-none min-h-[80px] bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 focus:ring-0 focus:outline-none shadow-none"
                placeholder="Add project notes..."
              />
            </div>

            <SidebarSeparator className="mx-0" />

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium px-1 text-muted-foreground">
                <span>Project progress</span>
                <span className="text-xs tabular-nums">{projectCompletionPercent}%</span>
              </div>
              <ProgressIndicator
                completed={completedCount}
                total={totalCount}
                showLabel={false}
                showCount={false}
              />
              <p className="text-xs text-muted-foreground px-1">
                {completedCount} of {totalCount} subtasks complete
              </p>
            </div>

            <SidebarSeparator className="mx-0" />

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <FolderIcon className="h-4 w-4" weight="fill" />
                <span>Subtasks</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground gap-1.5"
                onClick={handleAddSubtask}
              >
                <PlusCircleIcon className="h-4 w-4" weight="bold" />
                Add subtask
              </Button>
            </div>

            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
              {subTasks.map((subtask) => (
                <TaskItem
                  key={subtask.id}
                  todo={subtask}
                  size="sm"
                  variant="icon"
                  className="bg-transparent hover:bg-muted/50 transition-colors"
                  onStatusChange={(id, status) => {
                    onUpdateTodo?.(id, {
                      status,
                      completed: status === "done",
                      completedAt: status === "done" ? new Date().toISOString() : undefined
                    })
                  }}
                  onToggle={(id) => {
                    const newCompleted = !subtask.completed
                    onUpdateTodo?.(id, {
                      completed: newCompleted,
                      status: newCompleted ? "done" : "due",
                      completedAt: newCompleted ? new Date().toISOString() : undefined
                    })
                  }}
                  onSelect={handleSelectSubtask}
                  mode="readonly"
                  interactive
                />
              ))}
            </div>
          </div>
        ) : (
          <div key={selectedTodo.id} className="flex-1 flex flex-col pt-0 px-4 pb-4 gap-4 group-data-[collapsible=icon]:hidden">
            {/* Header section: Title and Notes with no gap */}
            <div className="flex-1 flex flex-col">
              {/* Title */}
            <div className="space-y-0 p-0">
              <Textarea
                ref={titleInputRef}
                id="title"
                value={selectedTodo.title}
                onChange={(e) => onUpdateTodo?.(selectedTodo.id, { title: e.target.value })}
                rows={1}
                className={cn(
                  "resize-none min-h-0 overflow-hidden text-2xl font-bold border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 shadow-none leading-tight focus:ring-0 focus:outline-none",
                  selectedTodo.completed && "line-through text-muted-foreground"
                )}
                placeholder="Task title..."
              />
            </div>

            {/* Notes */}
            <div className="flex-1 flex flex-col p-0">
              <Textarea
                id="notes"
                value={selectedTodo.details || ""}
                onChange={(e) => onUpdateTodo?.(selectedTodo.id, { details: e.target.value })}
                className="flex-1 resize-none min-h-0 bg-transparent border-none p-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 focus:ring-0 focus:outline-none shadow-none"
                placeholder="Add notes..."
              />
            </div>
          </div>

          {totalCount > 0 && (
            <>
              <SidebarSeparator className="mx-0" />
              <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm font-medium px-1">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <FolderIcon className="h-4 w-4" />
                  Subtasks
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {projectCompletionPercent}%
                </span>
              </div>

                <ProgressIndicator
                  completed={completedCount}
                  total={totalCount}
                  showLabel={false}
                  showCount={false}
                  className="h-1.5"
                />

                <div className="flex flex-col gap-1 mt-1">
                  {subTasks.map((subtask) => (
                    <TaskItem
                      key={subtask.id}
                      todo={subtask}
                      size="sm"
                      variant="checkbox"
                      className="bg-transparent hover:bg-muted/50 transition-colors -mx-2 px-2"
                      onStatusChange={(id, status) => {
                        onUpdateTodo?.(id, {
                          status,
                          completed: status === "done",
                          completedAt: status === "done" ? new Date().toISOString() : undefined
                        })
                      }}
                      onToggle={(id) => {
                        const newCompleted = !subtask.completed
                        onUpdateTodo?.(id, {
                          completed: newCompleted,
                          status: newCompleted ? "done" : "due",
                          completedAt: newCompleted ? new Date().toISOString() : undefined
                        })
                      }}
                      mode="readonly"
                      interactive={true}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <SidebarSeparator className="mx-0" />

          {/* Properties */}
          {/* Priority */}
          <div className="p-0">
            <Select
              value={selectedTodo.priority || "none"}
              onValueChange={(value) =>
                onUpdateTodo?.(selectedTodo.id, {
                  priority: value === "none" ? undefined : (value as Todo["priority"]),
                })
              }
            >
              <SelectTrigger className="w-full border-border">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="p-0">
            <DatePicker
              date={selectedTodo.dueDate ? new Date(selectedTodo.dueDate) : undefined}
              setDate={(date) =>
                onUpdateTodo?.(selectedTodo.id, {
                  dueDate: date ? date.toISOString() : undefined,
                })
              }
              placeholder="Pick a due date"
            />
          </div>

          {/* Project (Parent) */}
          <div className="p-0">
            {editingProject ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editingProjectValue}
                  onChange={(e) => setEditingProjectValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editingProjectValue.trim()) {
                      // Simplify: just close for now in refactor
                      setEditingProject(false)
                      setEditingProjectValue("")
                    } else if (e.key === "Escape") {
                      setEditingProject(false)
                      setEditingProjectValue("")
                    }
                  }}
                  className="border-border"
                  placeholder="New project name..."
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingProject(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select
                value={parentTodo?.id || "none"}
                onValueChange={(value: string) => {
                  if (value === "__new__") {
                    // setEditingProject(true)
                  } else {
                    // Move logic needs to be robust for hierarchy
                  }
                }}
                disabled={true}
              >
                <SelectTrigger className="w-full border-border">
                  <SelectValue placeholder="Select parent" />
                  <div className="flex items-center gap-2">
                    {parentTodo ? (
                      <>
                        <FolderIcon className="h-4 w-4 text-muted-foreground shrink-0" weight="fill" />
                        <span>{parentTodo.title}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No parent project</span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent project</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Category */}
          <div className="p-0">
            {editingCategory ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editingCategoryValue}
                  onChange={(e) => setEditingCategoryValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editingCategoryValue.trim()) {
                      if (editingCategory === "__new__") {
                        onUpdateTodo?.(selectedTodo.id, { category: editingCategoryValue.trim() })
                      } else if (editingCategoryValue !== editingCategory) {
                        onRenameCategory?.(editingCategory, editingCategoryValue.trim())
                      }
                      setEditingCategory(null)
                      setEditingCategoryValue("")
                    } else if (e.key === "Escape") {
                      setEditingCategory(null)
                      setEditingCategoryValue("")
                    }
                  }}
                  className="border-border"
                  placeholder={editingCategory === "__new__" ? "New category name..." : "Rename category..."}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingCategory(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Select
                  value={selectedTodo.category || "none"}
                  onValueChange={(value: string) => {
                    if (value === "__new__") {
                      setEditingCategory("__new__")
                      setEditingCategoryValue("")
                    } else {
                      onUpdateTodo?.(selectedTodo.id, {
                        category: value === "none" ? undefined : value,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="flex-1 border-border">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {existingCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Add new category</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTodo.category && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      setEditingCategory(selectedTodo.category!)
                      setEditingCategoryValue(selectedTodo.category!)
                    }}
                    title="Edit category name globally"
                  >
                    <PencilSimpleIcon className="h-4 w-4" weight="bold" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="p-0">
            <Select
              value={selectedTodo.status || "due"}
              onValueChange={(value: TodoStatus) => {
                onUpdateTodo?.(selectedTodo.id, {
                  status: value,
                  completed: value === "done" || value === "archived",
                  completedAt: (value === "done" || value === "archived") ? new Date().toISOString() : undefined,
                })
              }}
            >
              <SelectTrigger className="w-full border-border">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        )}
      </SidebarContent>
    </Sidebar>
  )
}
