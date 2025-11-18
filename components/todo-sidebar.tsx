"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, AlertCircle, Tag, ChevronLeft, ChevronRight } from "lucide-react"
import type { Todo } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TodoSidebarProps {
  selectedTodo: Todo | undefined
  onUpdate: (id: string, updates: Partial<Todo>) => void
}

export function TodoSidebar({ selectedTodo }: TodoSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (isCollapsed) {
    return (
      <div className="shrink-0 border-l bg-muted/30 flex items-start justify-center pt-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          title="Expand sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (!selectedTodo) {
    return (
      <div className="w-80 shrink-0 border-l bg-muted/30 overflow-auto">
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold">Task Details</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              className="h-8 w-8"
              title="Collapse sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">No task selected</h3>
              <p className="text-sm text-muted-foreground">Click on a task to view details</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 shrink-0 border-l bg-muted/30 overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-semibold">Task Details</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            className="h-8 w-8"
            title="Collapse sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-6">
          <div>
            <h2 className={cn("text-xl font-semibold", selectedTodo.completed && "line-through text-muted-foreground")}>
              {selectedTodo.title}
            </h2>
          </div>

          {selectedTodo.details && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Description</p>
              <p className="text-sm leading-relaxed">{selectedTodo.details}</p>
            </div>
          )}

          <div className="space-y-4 pt-4 border-t">
            {selectedTodo.priority && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Priority</p>
                <Badge
                  variant={
                    selectedTodo.priority === "high"
                      ? "destructive"
                      : selectedTodo.priority === "medium"
                        ? "default"
                        : "secondary"
                  }
                  className="text-sm"
                >
                  {selectedTodo.priority}
                </Badge>
              </div>
            )}

            {selectedTodo.dueDate && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Due Date</p>
                <Badge variant="outline" className="text-sm gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {new Date(selectedTodo.dueDate).toLocaleDateString()}
                </Badge>
              </div>
            )}

            {selectedTodo.category && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Category</p>
                <Badge variant="outline" className="text-sm gap-1.5">
                  <Tag className="h-4 w-4" />
                  {selectedTodo.category}
                </Badge>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Status</p>
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
