"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WarningCircleIcon, CaretLeftIcon, CaretRightIcon, CheckIcon, XIcon } from "@phosphor-icons/react"
import type { Todo } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TodoSidebarProps {
  selectedTodo: Todo | undefined
  allTodos: Todo[]
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void
}

export function TodoSidebar({ selectedTodo, allTodos, onUpdateTodo }: TodoSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState("")

  // Extract unique categories from all todos
  const existingCategories = useMemo(() => {
    const categories = allTodos
      .map((todo) => todo.category)
      .filter((cat): cat is string => !!cat)
    return [...new Set(categories)].sort()
  }, [allTodos])

  if (isCollapsed) {
    return (
      <aside className="w-12 shrink-0 border-l bg-muted/30 flex items-start justify-center pt-4 md:pt-8 px-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          title="Expand sidebar"
          className="h-8 w-8"
        >
          <CaretLeftIcon className="h-4 w-4" weight="bold" />
        </Button>
      </aside>
    )
  }

  if (!selectedTodo) {
    return (
      <aside className="w-80 shrink-0 border-l bg-muted/30 flex flex-col">
        <div className="shrink-0 h-14 px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center">
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-medium">Task Details</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              className="h-8 w-8 -mr-2"
              title="Collapse sidebar"
            >
              <CaretRightIcon className="h-4 w-4" weight="bold" />
            </Button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <WarningCircleIcon className="h-8 w-8 text-muted-foreground" weight="fill" />
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1">No task selected</h3>
            <p className="text-sm text-muted-foreground">Click on a task to view details</p>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-80 shrink-0 border-l bg-muted/30 flex flex-col">
      {/* Sidebar Header */}
      <div className="shrink-0 h-14 px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-medium">Task Details</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            className="h-8 w-8 -mr-2"
            title="Collapse sidebar"
          >
            <CaretRightIcon className="h-4 w-4" weight="bold" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Textarea
              id="title"
              value={selectedTodo.title}
              onChange={(e) => onUpdateTodo?.(selectedTodo.id, { title: e.target.value })}
              className={cn(
                "resize-none min-h-[60px]",
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
              className="resize-none min-h-[100px]"
              placeholder="Add notes..."
            />
          </div>

          <Separator />

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
              <SelectTrigger className="w-full">
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

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            {isAddingCategory ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCategory.trim()) {
                      onUpdateTodo?.(selectedTodo.id, { category: newCategory.trim() })
                      setNewCategory("")
                      setIsAddingCategory(false)
                    } else if (e.key === "Escape") {
                      setNewCategory("")
                      setIsAddingCategory(false)
                    }
                  }}
                  placeholder="New category..."
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    if (newCategory.trim()) {
                      onUpdateTodo?.(selectedTodo.id, { category: newCategory.trim() })
                    }
                    setNewCategory("")
                    setIsAddingCategory(false)
                  }}
                >
                  <CheckIcon className="h-4 w-4" weight="bold" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    setNewCategory("")
                    setIsAddingCategory(false)
                  }}
                >
                  <XIcon className="h-4 w-4" weight="bold" />
                </Button>
              </div>
            ) : (
              <Select
                value={selectedTodo.category || "none"}
                onValueChange={(value) => {
                  if (value === "__new__") {
                    setIsAddingCategory(true)
                  } else {
                    onUpdateTodo?.(selectedTodo.id, {
                      category: value === "none" ? undefined : value,
                    })
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {existingCategories.length > 0 && <SelectSeparator />}
                  {existingCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value="__new__">+ Add new category</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Button
              variant={selectedTodo.completed ? "default" : "outline"}
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => onUpdateTodo?.(selectedTodo.id, { completed: !selectedTodo.completed })}
            >
              {selectedTodo.completed && <CheckIcon className="h-4 w-4" weight="bold" />}
              {selectedTodo.completed ? "Completed" : "Mark as Complete"}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
