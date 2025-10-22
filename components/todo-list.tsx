"use client"

import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Calendar, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"
import type { Todo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Todo>) => void
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  const activeTodos = todos.filter((t) => !t.completed)
  const completedTodos = todos.filter((t) => t.completed)

  if (todos.length === 0) {
    return (
      <Card className="p-12 text-center border-none">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">No tasks yet</h3>
            <p className="text-sm text-muted-foreground">Add your first task using natural language above</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {activeTodos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">Active Tasks ({activeTodos.length})</h3>
          <div className="space-y-2">
            {activeTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}

      {completedTodos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">Completed ({completedTodos.length})</h3>
          <div className="space-y-2">
            {completedTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasDetails = todo.details || todo.priority || todo.dueDate || todo.category

  return (
    <Card className={cn("transition-all hover:shadow-md", todo.completed && "opacity-60")}>
      <div className="p-4 flex items-start gap-3">
        <Checkbox checked={todo.completed} onCheckedChange={() => onToggle(todo.id)} className="mt-1" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {hasDetails && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 mt-0.5"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            <p
              className={cn(
                "font-medium leading-relaxed flex-1",
                todo.completed && "line-through text-muted-foreground",
                !hasDetails && "ml-8",
              )}
            >
              {todo.title}
            </p>
          </div>

          {hasDetails && isExpanded && (
            <div className="mt-3 ml-8 space-y-3 p-3 rounded-lg bg-muted/50 border">
              {todo.details && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Details</p>
                  <p className="text-sm leading-relaxed">{todo.details}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {todo.priority && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Priority:</span>
                    <Badge
                      variant={
                        todo.priority === "high" ? "destructive" : todo.priority === "medium" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {todo.priority}
                    </Badge>
                  </div>
                )}
                {todo.dueDate && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Due:</span>
                    <Badge variant="outline" className="text-xs gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(todo.dueDate).toLocaleDateString()}
                    </Badge>
                  </div>
                )}
                {todo.category && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Category:</span>
                    <Badge variant="outline" className="text-xs">
                      {todo.category}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(todo.id)}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
