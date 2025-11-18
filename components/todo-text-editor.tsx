"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { processSingleTodo } from "@/lib/process-single-todo"
import type { Todo } from "@/lib/types"

interface Block {
  id: string
  text: string
  todo?: Todo // Once processed by AI
  isProcessing: boolean
}

interface TodoTextEditorProps {
  todos: Todo[]
  onAddTodo: (todo: Todo) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onDeleteTodo: (id: string) => void
  onToggleTodo: (id: string) => void
  onSelectTodo: (id: string) => void
  selectedTodoId: string | null
}

export function TodoTextEditor({
  todos,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onToggleTodo,
  onSelectTodo,
  selectedTodoId,
}: TodoTextEditorProps) {
  const [draftBlocks, setDraftBlocks] = useState<Block[]>([{ id: crypto.randomUUID(), text: "", isProcessing: false }])
  const timeoutRef = useRef<Record<string, NodeJS.Timeout>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const processingRef = useRef<Set<string>>(new Set())

  // Ensure we always have at least one draft block at the end
  useEffect(() => {
    if (draftBlocks.length === 0) {
      setDraftBlocks([{ id: crypto.randomUUID(), text: "", isProcessing: false }])
    }
  }, [draftBlocks.length])

  // Combine todos and draft blocks for rendering
  const blocks: Block[] = [
    ...todos.map((todo) => ({
      id: todo.id,
      text: todo.title,
      todo,
      isProcessing: processingRef.current.has(todo.id),
    })),
    ...draftBlocks,
  ]

  const processBlock = useCallback(
    async (blockId: string, text: string) => {
      if (!text.trim()) return

      // Prevent duplicate processing
      if (processingRef.current.has(blockId)) return
      processingRef.current.add(blockId)

      setDraftBlocks((prev) => prev.map((block) => (block.id === blockId ? { ...block, isProcessing: true } : block)))

      try {
        const result = await processSingleTodo(text, todos)

        if (result.todo) {
          onAddTodo(result.todo)
          // Remove this draft block and ensure we have an empty one
          setDraftBlocks((prev) => {
            const filtered = prev.filter((block) => block.id !== blockId)
            const hasEmpty = filtered.some((b) => b.text.trim() === "" && !b.isProcessing)
            if (!hasEmpty) {
              return [...filtered, { id: crypto.randomUUID(), text: "", isProcessing: false }]
            }
            return filtered
          })
        }
      } catch (error) {
        console.error("Error processing block:", error)
        setDraftBlocks((prev) => prev.map((block) => (block.id === blockId ? { ...block, isProcessing: false } : block)))
      } finally {
        processingRef.current.delete(blockId)
      }
    },
    [todos, onAddTodo]
  )

  const handleBlockChange = (blockId: string, newText: string) => {
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return

    // If it's a processed todo, update it directly
    if (block.todo) {
      onUpdateTodo(blockId, { title: newText })
      return
    }

    // Otherwise, it's a draft block - update local state
    setDraftBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, text: newText } : b)))

    // Clear existing timeout
    if (timeoutRef.current[blockId]) {
      clearTimeout(timeoutRef.current[blockId])
    }

    // Set new timeout for processing (2 seconds after stop typing)
    if (newText.trim()) {
      timeoutRef.current[blockId] = setTimeout(() => {
        processBlock(blockId, newText)
      }, 2000)
    }
  }

  const handleKeyDown = (blockId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    const blockIndex = blocks.findIndex((b) => b.id === blockId)
    const block = blocks[blockIndex]

    if (e.key === "Enter") {
      e.preventDefault()

      // Clear any pending timeout for this block
      if (timeoutRef.current[blockId]) {
        clearTimeout(timeoutRef.current[blockId])
        delete timeoutRef.current[blockId]
      }

      // If this block has text and is a draft, process it immediately
      if (block.text.trim() && !block.todo) {
        processBlock(blockId, block.text)
      }

      // Create new draft block
      const newBlock: Block = { id: crypto.randomUUID(), text: "", isProcessing: false }
      setDraftBlocks((prev) => [...prev, newBlock])

      // Focus the new block
      setTimeout(() => {
        inputRefs.current[newBlock.id]?.focus()
      }, 0)
    } else if (e.key === "Backspace" && block.text === "" && blocks.length > 1) {
      e.preventDefault()

      // Delete this block if it's empty
      if (block.todo) {
        onDeleteTodo(blockId)
      } else {
        setDraftBlocks((prev) => prev.filter((b) => b.id !== blockId))
      }

      // Focus previous block
      if (blockIndex > 0) {
        const prevBlock = blocks[blockIndex - 1]
        setTimeout(() => {
          inputRefs.current[prevBlock.id]?.focus()
        }, 0)
      }
    }
  }

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow"
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }
  }

  const getPriorityColor = (priority: "low" | "medium" | "high") => {
    switch (priority) {
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
    }
  }

  return (
    <div className="space-y-1">
      {blocks.map((block, index) => {
        const todo = block.todo

        return (
          <div
            key={block.id}
            className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/30"
          >
            {todo && (
              <Checkbox
                checked={todo.completed}
                onCheckedChange={() => onToggleTodo(todo.id)}
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectTodo(todo.id)
                }}
              />
            )}

            <input
              ref={(el) => {
                inputRefs.current[block.id] = el
              }}
              type="text"
              value={todo ? todo.title : block.text}
              onChange={(e) => handleBlockChange(block.id, e.target.value)}
              onKeyDown={(e) => handleKeyDown(block.id, e)}
              onFocus={() => {
                if (todo) {
                  onSelectTodo(todo.id)
                }
              }}
              placeholder="Type a task..."
              className={`flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground ${
                todo?.completed ? "line-through opacity-60" : ""
              }`}
              autoFocus={index === blocks.length - 1 && index > 0}
            />

            {block.isProcessing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            {todo && !block.isProcessing && (
              <div className="flex items-center gap-1" onClick={() => onSelectTodo(todo.id)}>
                {todo.priority && (
                  <Badge variant={getPriorityColor(todo.priority)} className="text-xs cursor-pointer">
                    {todo.priority}
                  </Badge>
                )}
                {todo.dueDate && (
                  <Badge variant="outline" className="text-xs cursor-pointer">
                    📅 {formatDueDate(todo.dueDate)}
                  </Badge>
                )}
                {todo.category && (
                  <Badge variant="outline" className="text-xs cursor-pointer">
                    {todo.category}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
