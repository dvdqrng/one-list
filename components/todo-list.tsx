"use client"

import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Trash2, AlertCircle } from "lucide-react"
import type { Todo } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Todo>) => void
  onSelect: (id: string) => void
  selectedTodoId: string | null
}

export function TodoList({ todos, onToggle, onDelete, onSelect, selectedTodoId }: TodoListProps) {
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
            <h3 className="text-sm font-medium mb-1">No tasks yet</h3>
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
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDelete={onDelete}
                onSelect={onSelect}
                isSelected={selectedTodoId === todo.id}
              />
            ))}
          </div>
        </div>
      )}

      {completedTodos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">Completed ({completedTodos.length})</h3>
          <div className="space-y-2">
            {completedTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDelete={onDelete}
                onSelect={onSelect}
                isSelected={selectedTodoId === todo.id}
              />
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
  onSelect,
  isSelected,
}: {
  todo: Todo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  isSelected: boolean
}) {
  return (
    <Card
      className={cn(
        "transition-all hover:shadow-md cursor-pointer",
        todo.completed && "opacity-60",
        isSelected && "ring-2 ring-primary",
      )}
      onClick={() => onSelect(todo.id)}
    >
      <div className="p-3 flex items-start gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={todo.completed} onCheckedChange={() => onToggle(todo.id)} className="mt-1" />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm leading-relaxed",
              todo.completed && "line-through text-muted-foreground",
            )}
          >
            {todo.title}
          </p>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(todo.id)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
