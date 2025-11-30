"use client"

import { useState, useMemo } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WarningCircleIcon, FolderIcon, CheckCircleIcon, CircleIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import type { Todo, Title, TodoStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TodoSidebarProps {
  selectedTodo: Todo | undefined
  selectedTitle: Title | undefined
  allTodos: Todo[]
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void
  onUpdateTitle?: (id: string, text: string) => void
  onRenameCategory?: (oldName: string, newName: string) => void
  onDeleteCategory?: (categoryName: string) => void
}

export function TodoSidebar({ selectedTodo, selectedTitle, allTodos, onUpdateTodo, onUpdateTitle, onRenameCategory }: TodoSidebarProps) {
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryValue, setEditingCategoryValue] = useState("")

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
    return allTodos.filter((todo) => todo.groupTitleId === selectedTitle.id)
  }, [selectedTitle, allTodos])

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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{completedCount} of {totalCount} tasks completed</span>
              </div>
              {totalCount > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(completedCount / totalCount) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <SidebarSeparator />

            {/* Tasks List */}
            <div className="space-y-2">
              <Label>Tasks ({totalCount})</Label>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {projectTodos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No tasks in this project</p>
                ) : (
                  projectTodos.map((todo) => (
                    <div
                      key={todo.id}
                      className={cn(
                        "flex items-center gap-2 py-1.5 px-2 rounded-md text-sm",
                        todo.completed && "text-muted-foreground"
                      )}
                    >
                      {todo.completed ? (
                        <CheckCircleIcon className="h-4 w-4 shrink-0 text-primary" weight="fill" />
                      ) : (
                        <CircleIcon className="h-4 w-4 shrink-0" weight="regular" />
                      )}
                      <span className={cn(todo.completed && "line-through")}>{todo.title}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : !selectedTodo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6 group-data-[collapsible=icon]:hidden">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <WarningCircleIcon className="h-8 w-8 text-muted-foreground" weight="fill" />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">No task selected</h3>
              <p className="text-sm text-muted-foreground">Click on a task or project to view details</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4 group-data-[collapsible=icon]:hidden">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Textarea
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
              <Input
                value={selectedTodo.project || ""}
                readOnly
                disabled
                placeholder="No project"
                className="bg-muted/50 border-border"
              />
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
