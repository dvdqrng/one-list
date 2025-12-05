"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { EmptyState } from "@/components/ui/empty-state"
import { TaskItem } from "@/components/ui/task-item"
import { ProgressIndicator } from "@/components/ui/progress-indicator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WarningCircleIcon, FolderIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import type { Todo, Title, TodoStatus, Item } from "@/lib/types"
import { sortItemsByPosition, isTodo, isTitle, isSeparator } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TodoSidebarProps {
  selectedTodo: Todo | undefined
  selectedTitle: Title | undefined
  allTodos: Todo[]
  allItems: Item[]
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void
  onUpdateTitle?: (id: string, text: string) => void
  onRenameCategory?: (oldName: string, newName: string) => void
  onDeleteCategory?: (categoryName: string) => void
  onMoveToProject?: (todoId: string, targetProjectId: string | null) => void
}

export function TodoSidebar({ selectedTodo, selectedTitle, allTodos, allItems, onUpdateTodo, onUpdateTitle, onRenameCategory, onMoveToProject }: TodoSidebarProps) {
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryValue, setEditingCategoryValue] = useState("")
  const titleInputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus title input when a new todo with empty title is selected
  useEffect(() => {
    if (selectedTodo && !selectedTodo.title?.trim()) {
      // Small delay to ensure the sidebar is open and rendered
      const timer = setTimeout(() => {
        titleInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [selectedTodo?.id])

  // Sort items by position for group calculations
  const sortedItems = useMemo(() => sortItemsByPosition(allItems), [allItems])

  // Helper to find parent title for a todo
  const findParentTitle = useMemo(() => {
    return (todoId: string): Title | undefined => {
      const todoIndex = sortedItems.findIndex(item => item.id === todoId)
      if (todoIndex === -1) return undefined

      // Look backwards for a title, stopping at separators or empty todos
      for (let i = todoIndex - 1; i >= 0; i--) {
        const item = sortedItems[i]
        if (isSeparator(item)) return undefined
        if (isTodo(item) && !item.title?.trim()) return undefined
        if (isTitle(item)) {
          return { id: item.id, text: item.text || '', createdAt: item.createdAt }
        }
      }
      return undefined
    }
  }, [sortedItems])

  // Get the parent title for the selected todo
  const parentTitle = useMemo(() => {
    if (!selectedTodo) return undefined
    return findParentTitle(selectedTodo.id)
  }, [selectedTodo, findParentTitle])

  // Get all available projects (titles)
  const allProjects = useMemo(() => {
    return sortedItems
      .filter(item => isTitle(item))
      .map(item => ({ id: item.id, text: item.text || '' }))
  }, [sortedItems])

  // Extract unique categories from all todos
  const existingCategories = useMemo(() => {
    const categories = allTodos
      .map((todo) => todo.category)
      .filter((cat): cat is string => !!cat)
    return [...new Set(categories)].sort()
  }, [allTodos])

  // Get todos belonging to the selected title (project)
  const projectTodos = useMemo(() => {
    if (!selectedTitle) return []
    // Find all todos that have this title as their parent
    return sortedItems
      .filter(item => isTodo(item))
      .filter(item => {
        const parent = findParentTitle(item.id)
        return parent?.id === selectedTitle.id
      })
      .map(item => allTodos.find(t => t.id === item.id))
      .filter((t): t is Todo => t !== undefined)
  }, [selectedTitle, sortedItems, findParentTitle, allTodos])

  const completedCount = projectTodos.filter((t) => t.completed).length
  const totalCount = projectTodos.length

  return (
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="bg-sidebar">
      <SidebarHeader
        className="h-11 p-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <SidebarContent>
        {/* Project/Title Details View */}
        {selectedTitle ? (
          <div className="p-4 space-y-4 group-data-[collapsible=icon]:hidden">
            {/* Project Title */}
            <div className="space-y-2">
              <Label htmlFor="projectTitle">Project Name</Label>
              <div className="flex items-center gap-2">
                <FolderIcon className="h-5 w-5 text-muted-foreground shrink-0" weight="fill" />
                <Input
                  id="projectTitle"
                  value={selectedTitle.text}
                  onChange={(e) => onUpdateTitle?.(selectedTitle.id, e.target.value)}
                  className="flex-1 border-border"
                  placeholder="Project name..."
                />
              </div>
            </div>

            <SidebarSeparator />

            {/* Progress */}
            <div className="space-y-2">
              <Label>Progress</Label>
              <ProgressIndicator
                completed={completedCount}
                total={totalCount}
                label="tasks"
                showLabel={false}
              />
            </div>

            <SidebarSeparator />

            {/* Tasks List */}
            <div className="space-y-2">
              <Label>Tasks ({totalCount})</Label>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {projectTodos.length === 0 ? (
                  <EmptyState
                    title="No tasks in this project"
                    className="py-2"
                  />
                ) : (
                  projectTodos.map((todo) => (
                    <TaskItem
                      key={todo.id}
                      todo={todo}
                      size="sm"
                      variant="icon"
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : !selectedTodo ? (
          <EmptyState
            icon={<WarningCircleIcon className="h-8 w-8 text-muted-foreground" weight="fill" />}
            title="No task selected"
            description="Click on a task or project to view details"
            className="flex-1 p-6 group-data-[collapsible=icon]:hidden"
          />
        ) : (
          <div className="p-4 space-y-4 group-data-[collapsible=icon]:hidden">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Textarea
                ref={titleInputRef}
                id="title"
                value={selectedTodo.title}
                onChange={(e) => onUpdateTodo?.(selectedTodo.id, { title: e.target.value })}
                className={cn(
                  "resize-none min-h-[60px] bg-transparent border-border",
                  selectedTodo.completed && "line-through text-muted-foreground"
                )}
                placeholder="Task title..."
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={selectedTodo.details || ""}
                onChange={(e) => onUpdateTodo?.(selectedTodo.id, { details: e.target.value })}
                className="resize-y min-h-[200px] bg-transparent border-border"
                placeholder="Add notes..."
              />
            </div>

            <SidebarSeparator />

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
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
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="dueDate"
                  type="date"
                  value={selectedTodo.dueDate ? selectedTodo.dueDate.split("T")[0] : ""}
                  onChange={(e) =>
                    onUpdateTodo?.(selectedTodo.id, {
                      dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    })
                  }
                  className="border-border"
                />
                {selectedTodo.dueDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUpdateTodo?.(selectedTodo.id, { dueDate: undefined })}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Project */}
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={parentTitle?.id || "none"}
                onValueChange={(value: string) => {
                  onMoveToProject?.(selectedTodo.id, value === "none" ? null : value)
                }}
              >
                <SelectTrigger className="w-full border-border">
                  <SelectValue placeholder="Select project">
                    <div className="flex items-center gap-2">
                      {parentTitle ? (
                        <>
                          <FolderIcon className="h-4 w-4 text-muted-foreground shrink-0" weight="fill" />
                          <span>{parentTitle.text}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No project</span>
                      )}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {allProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <FolderIcon className="h-4 w-4 text-muted-foreground shrink-0" weight="fill" />
                        <span>{project.text || "Untitled"}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              {editingCategory ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editingCategoryValue}
                    onChange={(e) => setEditingCategoryValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editingCategoryValue.trim()) {
                        if (editingCategory === "__new__") {
                          // Adding new category
                          onUpdateTodo?.(selectedTodo.id, { category: editingCategoryValue.trim() })
                        } else if (editingCategoryValue !== editingCategory) {
                          // Renaming existing category globally
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
                      if (editingCategoryValue.trim()) {
                        if (editingCategory === "__new__") {
                          onUpdateTodo?.(selectedTodo.id, { category: editingCategoryValue.trim() })
                        } else if (editingCategoryValue !== editingCategory) {
                          onRenameCategory?.(editingCategory, editingCategoryValue.trim())
                        }
                      }
                      setEditingCategory(null)
                      setEditingCategoryValue("")
                    }}
                  >
                    Save
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
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={selectedTodo.status || "due"}
                onValueChange={(value: TodoStatus) => {
                  onUpdateTodo?.(selectedTodo.id, {
                    status: value,
                    completed: value === "done",
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
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  )
}
