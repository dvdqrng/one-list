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
import { DatePicker } from "@/components/ui/date-picker"
import { LightningIcon, WarningCircleIcon, FolderIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import { aiQueueManager } from "@/lib/ai"
import { useStore } from "@/lib/store"
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
  const [editingProject, setEditingProject] = useState(false)
  const [editingProjectValue, setEditingProjectValue] = useState("")
  const titleInputRef = useRef<HTMLTextAreaElement>(null)
  const { clearPendingFocus, insertItemAfter } = useStore()

  // Auto-focus title input when this todo has pending focus and empty title
  useEffect(() => {
    if (selectedTodo && clearPendingFocus(selectedTodo.id) && !selectedTodo.title?.trim()) {
      titleInputRef.current?.focus()
    }
  }, [selectedTodo?.id, clearPendingFocus])

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
  // Auto-resize title textarea
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.style.height = "auto"
      titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`
    }
  }, [selectedTodo?.title])

  return (
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="bg-transparent border-l">
      <SidebarHeader className="h-11 flex flex-row items-center justify-end px-4">
        {selectedTodo && (
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
        )}
      </SidebarHeader>
      <SidebarContent>
        {/* Project/Title Details View */}
        {selectedTitle ? (
          <div className="pt-0 px-4 pb-4 space-y-4 group-data-[collapsible=icon]:hidden">
            {/* Project Title */}
            <div className="space-y-0">
              <div className="flex items-center gap-2">
                <FolderIcon className="h-6 w-6 text-muted-foreground shrink-0" weight="fill" />
                <Input
                  id="projectTitle"
                  value={selectedTitle.text}
                  onChange={(e) => onUpdateTitle?.(selectedTitle.id, e.target.value)}
                  className="flex-1 text-2xl font-bold border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 shadow-none h-auto focus:ring-0 focus:outline-none"
                  placeholder="Project name..."
                />
              </div>
            </div>

            <SidebarSeparator />

            {/* Progress */}
            <ProgressIndicator
              completed={completedCount}
              total={totalCount}
              label="tasks"
              showLabel={false}
            />

            <SidebarSeparator />

            {/* Tasks List */}
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
        ) : !selectedTodo ? (
          <EmptyState
            icon={<WarningCircleIcon className="h-8 w-8 text-muted-foreground" weight="fill" />}
            title="No task selected"
            description="Click on a task or project to view details"
            className="flex-1 p-6 group-data-[collapsible=icon]:hidden"
          />
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

              {/* Notes (Expands to fill space within this group) */}
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

            <SidebarSeparator className="mx-0" />

            {/* Properties (Naturally sitting at the bottom) */}
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

            {/* Project */}
            <div className="p-0">
              {editingProject ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editingProjectValue}
                    onChange={(e) => setEditingProjectValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editingProjectValue.trim()) {
                        const newProjectId = insertItemAfter(null, "title", { text: editingProjectValue.trim() })
                        onMoveToProject?.(selectedTodo.id, newProjectId)
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
                    onClick={() => {
                      if (editingProjectValue.trim()) {
                        const newProjectId = insertItemAfter(null, "title", { text: editingProjectValue.trim() })
                        onMoveToProject?.(selectedTodo.id, newProjectId)
                      }
                      setEditingProject(false)
                      setEditingProjectValue("")
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <Select
                  value={parentTitle?.id || "none"}
                  onValueChange={(value: string) => {
                    if (value === "__new__") {
                      setEditingProject(true)
                      setEditingProjectValue("")
                    } else {
                      onMoveToProject?.(selectedTodo.id, value === "none" ? null : value)
                    }
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
                    <SelectItem value="__new__">+ Add new project</SelectItem>
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
            <div className="p-0">
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
