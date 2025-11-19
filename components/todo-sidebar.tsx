"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarBlankIcon, WarningCircleIcon, TagIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import type { Todo } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TodoSidebarProps {
  selectedTodo: Todo | undefined
  onUpdate: (id: string, updates: Partial<Todo>) => void
}

export function TodoSidebar({ selectedTodo }: TodoSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (isCollapsed) {
    return (
      <div className="w-12 shrink-0 border-l bg-muted/30 flex items-start justify-center pt-4 md:pt-8 px-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          title="Expand sidebar"
          className="h-8 w-8"
        >
          <CaretLeftIcon className="h-4 w-4" weight="bold" />
        </Button>
      </div>
    )
  }

  if (!selectedTodo) {
    return (
      <div className="w-80 shrink-0 border-l bg-muted/30 overflow-auto flex flex-col">
        <div className="flex-1 px-6 pt-4 pb-6 md:pt-8 flex flex-col">
          <div className="flex items-center justify-between mb-6">
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
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <WarningCircleIcon className="h-8 w-8 text-muted-foreground" weight="fill" />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">No task selected</h3>
              <p className="text-sm text-muted-foreground">Click on a task to view details</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 shrink-0 border-l bg-muted/30 overflow-auto flex flex-col">
      <div className="flex-1 px-6 pt-4 pb-6 md:pt-8">
        <div className="flex items-center justify-between mb-6">
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
        <div className="space-y-6">
          <div>
            <h2 className={cn("text-sm font-medium", selectedTodo.completed && "line-through text-muted-foreground")}>
              {selectedTodo.title}
            </h2>
          </div>

          {selectedTodo.details && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Description</p>
              <p className="text-sm leading-relaxed">{selectedTodo.details}</p>
            </div>
          )}

          <div className="space-y-4 pt-4 border-t">
            {selectedTodo.priority && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Priority</p>
                <Badge variant="secondary" className="text-sm">
                  {selectedTodo.priority}
                </Badge>
              </div>
            )}

            {selectedTodo.dueDate && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Due Date</p>
                <Badge variant="secondary" className="text-sm gap-1.5">
                  <CalendarBlankIcon className="h-4 w-4" weight="fill" />
                  {new Date(selectedTodo.dueDate).toLocaleDateString()}
                </Badge>
              </div>
            )}

            {selectedTodo.category && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Category</p>
                <Badge variant="secondary" className="text-sm gap-1.5">
                  <TagIcon className="h-4 w-4" weight="fill" />
                  {selectedTodo.category}
                </Badge>
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground mb-2">Status</p>
              <Badge variant={selectedTodo.completed ? "default" : "secondary"} className="text-sm">
                {selectedTodo.completed ? "Completed" : "Active"}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
