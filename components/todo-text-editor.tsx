"use client"

import { useState, useRef, useMemo } from "react"
import { SpinnerIcon, CalendarBlankIcon, DotsSixVerticalIcon } from "@phosphor-icons/react"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { aiQueueManager } from "@/lib/ai-queue-manager"
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

type BlockType = "todo" | "title"

interface DraftBlock {
  id: string
  type: BlockType
  text: string
}

interface SortableItemProps {
  id: string
  children: React.ReactNode
}

function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[18px] opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity z-10"
      >
        <DotsSixVerticalIcon size={12} weight="bold" className="text-muted-foreground" />
      </div>
      {children}
    </div>
  )
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
  selectedTodoId: string | null
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
  selectedTodoId,
  showMetadata,
}: TodoTextEditorProps) {
  // Only store draft blocks locally
  const [drafts, setDrafts] = useState<DraftBlock[]>([{
    id: crypto.randomUUID(),
    type: "todo",
    text: ""
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

  // Combine saved items with drafts for rendering
  // Saved items come from props, drafts from state
  const allItems = useMemo(() => {
    // Merge todos, titles, and separators, sorted by creation time
    const savedItems: BlockItem[] = [
      ...todos.map(todo => todo as BlockItem),
      ...titles.map(title => title as BlockItem),
      ...separators.map(separator => separator as BlockItem),
    ].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime()
      const timeB = new Date(b.createdAt).getTime()
      return timeA - timeB
    })

    const items: Array<{ type: 'saved', item: BlockItem } | { type: 'draft', item: DraftBlock }> = [
      ...savedItems.map(item => ({ type: 'saved' as const, item })),
      ...drafts.map(draft => ({ type: 'draft' as const, item: draft })),
    ]
    return items
  }, [todos, titles, separators, drafts])

  const handleDraftChange = (draftId: string, newText: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, text: newText } : d
    ))
  }

  const handleKeyDown = (item: typeof allItems[number], index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab - toggle between todo and title (draft only)
    if (e.key === "Tab" && item.type === 'draft') {
      e.preventDefault()
      setDrafts(prev => prev.map(d =>
        d.id === item.item.id
          ? { ...d, type: d.type === "todo" ? "title" : "todo" }
          : d
      ))
      return
    }

    // Arrow Up
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (index > 0) {
        const prevItem = allItems[index - 1]
        const prevId = prevItem.type === 'saved' ? prevItem.item.id : prevItem.item.id
        inputRefs.current[prevId]?.focus()
      }
      return
    }

    // Arrow Down
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (index < allItems.length - 1) {
        const nextItem = allItems[index + 1]
        const nextId = nextItem.type === 'saved' ? nextItem.item.id : nextItem.item.id
        inputRefs.current[nextId]?.focus()
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
                const isSeparator = !('completed' in saved) && !('text' in saved)
                if (isSeparator) {
                  // Hit a separator - stop searching
                  break
                }
                if ('text' in saved && !('completed' in saved)) {
                  // Found a title
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

      // Add new draft below
      const newDraft: DraftBlock = {
        id: crypto.randomUUID(),
        type: "todo",
        text: "",
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
        const text = 'title' in saved ? saved.title : saved.text
        if (!text) {
          e.preventDefault()
          if ('completed' in saved) {
            onDeleteTodo(saved.id)
          } else {
            onDeleteTitle(saved.id)
          }

          // Focus previous
          if (index > 0) {
            setTimeout(() => {
              const prevItem = allItems[index - 1]
              const prevId = prevItem.type === 'saved' ? prevItem.item.id : prevItem.item.id
              inputRefs.current[prevId]?.focus()
            }, 0)
          }
        }
      } else {
        // Draft
        if (!item.item.text && allItems.length > 1) {
          e.preventDefault()
          setDrafts(prev => prev.filter(d => d.id !== item.item.id))

          // Focus previous
          if (index > 0) {
            setTimeout(() => {
              const prevItem = allItems[index - 1]
              const prevId = prevItem.type === 'saved' ? prevItem.item.id : prevItem.item.id
              inputRefs.current[prevId]?.focus()
            }, 0)
          }
        }
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
    return "secondary"
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    // Only reorder saved items, not drafts
    const savedItems: BlockItem[] = [
      ...todos.map(todo => todo as BlockItem),
      ...titles.map(title => title as BlockItem),
      ...separators.map(separator => separator as BlockItem),
    ].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime()
      const timeB = new Date(b.createdAt).getTime()
      return timeA - timeB
    })

    const oldIndex = savedItems.findIndex((item) => item.id === active.id)
    const newIndex = savedItems.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const reorderedItems = arrayMove(savedItems, oldIndex, newIndex)
    onReorderItems(reorderedItems)
  }

  // Only saved items can be dragged
  const savedItems = useMemo(() => {
    return [
      ...todos.map(todo => todo as BlockItem),
      ...titles.map(title => title as BlockItem),
      ...separators.map(separator => separator as BlockItem),
    ].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime()
      const timeB = new Date(b.createdAt).getTime()
      return timeA - timeB
    })
  }, [todos, titles, separators])

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
          const isTodo = 'completed' in saved
          const isTitle = 'text' in saved && !('completed' in saved)
          const isSeparator = !('completed' in saved) && !('text' in saved)
          const todo = isTodo ? saved as Todo : undefined
          const title = isTitle ? saved as Title : undefined
          const separator = isSeparator ? saved as Separator : undefined

          // Render separator as visual spacer
          if (separator) {
            return (
              <SortableItem key={saved.id} id={saved.id}>
                <div
                  className="h-4 flex items-center px-3 cursor-pointer hover:bg-muted/20"
                  onClick={() => {
                    // Delete separator and create a new draft
                    onDeleteSeparator(separator.id)
                    const newDraft: DraftBlock = {
                      id: crypto.randomUUID(),
                      type: "todo",
                      text: "",
                    }
                    setDrafts(prev => {
                      // Insert at the end (will be sorted by createdAt)
                      return [...prev, newDraft]
                    })
                    // Focus the input
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

          const text = isTodo ? (saved as Todo).title : (saved as Title).text

          return (
            <SortableItem key={saved.id} id={saved.id}>
              <div
                className={`group flex items-center gap-2 rounded-md border border-transparent px-3 transition-colors ${
                  isTitle ? "py-2 mt-4 first:mt-0" : "py-1 hover:bg-muted/30"
                }`}
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
                  inputRefs.current[saved.id] = el
                }}
                type="text"
                value={text}
                onChange={(e) => {
                  if (todo) {
                    onUpdateTodo(saved.id, { title: e.target.value })
                  } else if (title) {
                    onUpdateTitle(saved.id, e.target.value)
                  }
                }}
                onKeyDown={(e) => handleKeyDown(item, index, e)}
                onFocus={() => {
                  if (todo) {
                    onSelectTodo(todo.id)
                  }
                }}
                placeholder="Type a task..."
                className={`flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${
                  isTitle ? "text-lg font-semibold" : "text-sm"
                } ${todo?.completed ? "line-through opacity-60" : ""}`}
              />

              {todo && todo.aiProcessingStatus && (todo.aiProcessingStatus === "processing" || todo.aiProcessingStatus === "pending") && (
                <SpinnerIcon className="h-4 w-4 animate-spin text-muted-foreground" weight="bold" />
              )}

              {todo && showMetadata && (
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
        } else {
          // Draft
          const draft = item.item
          const isTitle = draft.type === "title"

          return (
            <div
              key={draft.id}
              className={`group flex items-center gap-2 rounded-md border border-transparent px-3 transition-colors ${
                isTitle ? "py-2" : "py-1 hover:bg-muted/30"
              }`}
            >
              <input
                ref={(el) => {
                  inputRefs.current[draft.id] = el
                }}
                type="text"
                value={draft.text}
                onChange={(e) => handleDraftChange(draft.id, e.target.value)}
                onKeyDown={(e) => handleKeyDown(item, index, e)}
                placeholder={
                  isTitle
                    ? "Title (Tab to switch to todo)..."
                    : "Type a task (Tab for title)..."
                }
                className={`flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${
                  isTitle ? "text-lg font-semibold" : "text-sm"
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
