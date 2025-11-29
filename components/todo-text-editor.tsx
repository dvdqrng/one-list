"use client"

import { useState, useRef, useMemo } from "react"
import { SpinnerIcon, CalendarBlankIcon } from "@phosphor-icons/react"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { SortableItem } from "@/components/sortable-item"
import { aiQueueManager } from "@/lib/ai-queue-manager"
import { formatDueDate } from "@/lib/format"
import { mergeBlockItems } from "@/lib/types"
import type { Todo, Title, Separator, BlockItem } from "@/lib/types"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

type BlockType = "todo" | "title"

interface DraftBlock {
  id: string
  type: BlockType
  text: string
  indent: number // 0-3
}

interface TodoTextEditorProps {
  todos: Todo[]
  titles: Title[]
  separators: Separator[]
  onAddTodo: (todo: Todo) => void
  onAddTitle: (title: Title) => void
  onAddSeparator: (separator: Separator) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onUpdateTitle: (id: string, text: string) => void
  onDeleteTodo: (id: string) => void
  onDeleteTitle: (id: string) => void
  onDeleteSeparator: (id: string) => void
  onToggleTodo: (id: string) => void
  onSelectTodo: (id: string) => void
  onReorderItems: (items: BlockItem[]) => void
  showMetadata: boolean
}

export function TodoTextEditor({
  todos,
  titles,
  separators,
  onAddTodo,
  onAddTitle,
  onAddSeparator,
  onUpdateTodo,
  onUpdateTitle,
  onDeleteTodo,
  onDeleteTitle,
  onDeleteSeparator,
  onToggleTodo,
  onSelectTodo,
  onReorderItems,
  showMetadata,
}: TodoTextEditorProps) {
  // Only store draft blocks locally
  const [drafts, setDrafts] = useState<DraftBlock[]>([{
    id: crypto.randomUUID(),
    type: "todo",
    text: "",
    indent: 0
  }])

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Set up drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Single source of truth for saved items (sorted by createdAt)
  const savedItems = useMemo(
    () => mergeBlockItems(todos, titles, separators),
    [todos, titles, separators]
  )

  // Combine saved items with drafts for rendering
  const allItems = useMemo(() => {
    const items: Array<{ type: 'saved', item: BlockItem } | { type: 'draft', item: DraftBlock }> = [
      ...savedItems.map(item => ({ type: 'saved' as const, item })),
      ...drafts.map(draft => ({ type: 'draft' as const, item: draft })),
    ]
    return items
  }, [savedItems, drafts])

  const handleDraftChange = (draftId: string, newText: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, text: newText } : d
    ))
  }

  const handleKeyDown = (item: typeof allItems[number], index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Option+Tab (Alt+Tab) - toggle between todo and title (draft only)
    if (e.key === "Tab" && e.altKey && item.type === 'draft') {
      e.preventDefault()
      setDrafts(prev => prev.map(d =>
        d.id === item.item.id
          ? { ...d, type: d.type === "todo" ? "title" : "todo" }
          : d
      ))
      return
    }

    // Tab - increase indent (for todos and drafts, not titles)
    if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
      const isTodoOrDraft = item.type === 'draft'
        ? item.item.type === 'todo'
        : 'completed' in item.item

      if (isTodoOrDraft) {
        e.preventDefault()
        if (item.type === 'draft') {
          setDrafts(prev => prev.map(d =>
            d.id === item.item.id
              ? { ...d, indent: Math.min(3, d.indent + 1) }
              : d
          ))
        } else {
          const todo = item.item as Todo
          onUpdateTodo(todo.id, { indent: Math.min(3, (todo.indent ?? 0) + 1) })
        }
        return
      }
    }

    // Shift+Tab - decrease indent (for todos and drafts, not titles)
    if (e.key === "Tab" && e.shiftKey && !e.altKey) {
      const isTodoOrDraft = item.type === 'draft'
        ? item.item.type === 'todo'
        : 'completed' in item.item

      if (isTodoOrDraft) {
        e.preventDefault()
        if (item.type === 'draft') {
          setDrafts(prev => prev.map(d =>
            d.id === item.item.id
              ? { ...d, indent: Math.max(0, d.indent - 1) }
              : d
          ))
        } else {
          const todo = item.item as Todo
          onUpdateTodo(todo.id, { indent: Math.max(0, (todo.indent ?? 0) - 1) })
        }
        return
      }
    }

    // Arrow Up
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (index > 0) {
        inputRefs.current[allItems[index - 1].item.id]?.focus()
      }
      return
    }

    // Arrow Down
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (index < allItems.length - 1) {
        inputRefs.current[allItems[index + 1].item.id]?.focus()
      }
      return
    }

    // Enter - create block or move to next
    if (e.key === "Enter") {
      e.preventDefault()

      if (item.type === 'draft') {
        const draft = item.item

        if (draft.text.trim()) {
          // Has text - create the item
          if (draft.type === "title") {
            // Create title
            const newTitle: Title = {
              id: crypto.randomUUID(),
              text: draft.text,
              createdAt: new Date().toISOString(),
            }
            onAddTitle(newTitle)
          } else {
            // Create todo - determine which title group it belongs to
            let groupTitleId: string | undefined = undefined

            // Find the most recent title before this draft, stopping at separators
            for (let i = index - 1; i >= 0; i--) {
              const prevItem = allItems[i]
              if (prevItem.type === 'saved') {
                const saved = prevItem.item
                const isSeparatorItem = !('completed' in saved) && !('text' in saved)
                const isTitleItem = 'text' in saved && !('completed' in saved)
                if (isSeparatorItem) {
                  break
                }
                if (isTitleItem) {
                  groupTitleId = saved.id
                  break
                }
              }
            }

            const newTodo: Todo = {
              id: crypto.randomUUID(),
              title: draft.text,
              completed: false,
              createdAt: new Date().toISOString(),
              aiProcessingStatus: "pending",
              groupTitleId,
              indent: draft.indent,
            }
            onAddTodo(newTodo)

            // Enqueue for AI enhancement
            aiQueueManager.enqueue({
              todoId: newTodo.id,
              inputText: draft.text,
              type: "enhance",
            })
          }

          // Remove this draft
          setDrafts(prev => prev.filter(d => d.id !== draft.id))
        } else {
          // Empty draft - create a separator entity
          const newSeparator: Separator = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          }
          onAddSeparator(newSeparator)

          // Remove this draft
          setDrafts(prev => prev.filter(d => d.id !== draft.id))
        }
      }

      // Add new draft below (inherit indent from current item)
      const currentIndent = item.type === 'draft'
        ? item.item.indent
        : ('indent' in item.item ? (item.item as Todo).indent ?? 0 : 0)
      const newDraft: DraftBlock = {
        id: crypto.randomUUID(),
        type: "todo",
        text: "",
        indent: currentIndent,
      }

      const draftIndex = item.type === 'draft'
        ? drafts.findIndex(d => d.id === item.item.id)
        : drafts.length - 1

      setDrafts(prev => {
        const newDrafts = [...prev]
        newDrafts.splice(draftIndex + 1, 0, newDraft)
        return newDrafts
      })

      // Focus new draft
      setTimeout(() => {
        inputRefs.current[newDraft.id]?.focus()
      }, 0)

      return
    }

    // Backspace - delete empty block
    if (e.key === "Backspace") {
      if (item.type === 'saved') {
        const saved = item.item
        const isTodoItem = 'completed' in saved
        const isTitleItem = 'text' in saved && !('completed' in saved)
        const text = isTodoItem ? (saved as Todo).title : isTitleItem ? (saved as Title).text : ''
        if (!text) {
          e.preventDefault()
          if (isTodoItem) {
            onDeleteTodo(saved.id)
          } else if (isTitleItem) {
            onDeleteTitle(saved.id)
          }
          focusPreviousItem(index)
        }
      } else {
        // Draft
        if (!item.item.text && allItems.length > 1) {
          e.preventDefault()
          setDrafts(prev => prev.filter(d => d.id !== item.item.id))
          focusPreviousItem(index)
        }
      }
    }
  }

  const focusPreviousItem = (currentIndex: number) => {
    if (currentIndex > 0) {
      setTimeout(() => {
        const prevItem = allItems[currentIndex - 1]
        inputRefs.current[prevItem.item.id]?.focus()
      }, 0)
    }
  }

  const getPriorityColor = (_priority: "low" | "medium" | "high"): "secondary" => {
    return "secondary"
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = savedItems.findIndex((item) => item.id === active.id)
    const newIndex = savedItems.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const reorderedItems = arrayMove(savedItems, oldIndex, newIndex)
    onReorderItems(reorderedItems)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={savedItems.map(item => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0">
          {allItems.map((item, index) => {
        if (item.type === 'saved') {
          const saved = item.item
          const isTodoItem = 'completed' in saved
          const isTitleItem = 'text' in saved && !('completed' in saved)
          const isSeparatorItem = !('completed' in saved) && !('text' in saved)

          // Render separator as visual spacer
          if (isSeparatorItem) {
            const separator = saved as Separator
            return (
              <SortableItem key={separator.id} id={separator.id}>
                <div
                  className="h-4 flex items-center px-3 cursor-pointer hover:bg-muted/20"
                  onClick={() => {
                    onDeleteSeparator(separator.id)
                    const newDraft: DraftBlock = {
                      id: crypto.randomUUID(),
                      type: "todo",
                      text: "",
                      indent: 0,
                    }
                    setDrafts(prev => [...prev, newDraft])
                    setTimeout(() => {
                      inputRefs.current[newDraft.id]?.focus()
                    }, 0)
                  }}
                >
                  <div className="w-full h-px bg-border/30" />
                </div>
              </SortableItem>
            )
          }

          // Render todo
          if (isTodoItem) {
            const todo = saved as Todo
            const indentLevel = todo.indent ?? 0
            return (
              <SortableItem key={todo.id} id={todo.id}>
                <div
                  className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-1 hover:bg-muted/30 transition-colors"
                  style={{ paddingLeft: `${12 + indentLevel * 24}px` }}
                >
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() => onToggleTodo(todo.id)}
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectTodo(todo.id)
                    }}
                  />
                  <input
                    ref={(el) => { inputRefs.current[todo.id] = el }}
                    type="text"
                    value={todo.title}
                    onChange={(e) => onUpdateTodo(todo.id, { title: e.target.value })}
                    onKeyDown={(e) => handleKeyDown(item, index, e)}
                    onFocus={() => onSelectTodo(todo.id)}
                    placeholder="Type a task..."
                    className={`flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground ${
                      todo.completed ? "line-through opacity-60" : ""
                    }`}
                  />
                  {todo.aiProcessingStatus && (todo.aiProcessingStatus === "processing" || todo.aiProcessingStatus === "pending") && (
                    <SpinnerIcon className="h-4 w-4 animate-spin text-muted-foreground" weight="bold" />
                  )}
                  {showMetadata && (
                    <div className="flex items-center gap-1" onClick={() => onSelectTodo(todo.id)}>
                      {todo.priority && (
                        <Badge variant={getPriorityColor(todo.priority)} className="cursor-pointer">
                          {todo.priority}
                        </Badge>
                      )}
                      {todo.dueDate && (
                        <Badge variant="secondary" className="cursor-pointer gap-1">
                          <CalendarBlankIcon className="h-3 w-3" weight="fill" />
                          {formatDueDate(todo.dueDate)}
                        </Badge>
                      )}
                      {todo.category && (
                        <Badge variant="secondary" className="cursor-pointer">
                          {todo.category}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </SortableItem>
            )
          }

          // Must be a title
          if (isTitleItem) {
            const title = saved as Title
            return (
              <SortableItem key={title.id} id={title.id}>
                <div className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-2 mt-4 first:mt-0 transition-colors">
                  <input
                    ref={(el) => { inputRefs.current[title.id] = el }}
                    type="text"
                    value={title.text}
                    onChange={(e) => onUpdateTitle(title.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(item, index, e)}
                    placeholder="Type a title..."
                    className="flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </SortableItem>
            )
          }

          return null
        } else {
          // Draft
          const draft = item.item
          const isDraftTitle = draft.type === "title"
          const indentLevel = isDraftTitle ? 0 : draft.indent

          return (
            <div
              key={draft.id}
              className={`group flex items-center gap-2 rounded-md border border-transparent px-3 transition-colors ${
                isDraftTitle ? "py-2" : "py-1 hover:bg-muted/30"
              }`}
              style={{ paddingLeft: `${12 + indentLevel * 24}px` }}
            >
              <input
                ref={(el) => { inputRefs.current[draft.id] = el }}
                type="text"
                value={draft.text}
                onChange={(e) => handleDraftChange(draft.id, e.target.value)}
                onKeyDown={(e) => handleKeyDown(item, index, e)}
                placeholder={
                  isDraftTitle
                    ? "Title (⌥Tab to switch to todo)..."
                    : "Type a task (⌥Tab for title)..."
                }
                className={`flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${
                  isDraftTitle ? "text-lg font-semibold" : "text-sm"
                }`}
                autoFocus={index === allItems.length - 1}
              />
            </div>
          )
        }
      })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
