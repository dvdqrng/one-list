"use client"

import { useState, useMemo, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react"
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react"
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
import { SortableItem } from "@/components/sortable-item"
import { DraggableItem } from "@/components/draggable-item"
import { DueDateHeader } from "@/components/ui/collapsible-header"
import { TaskItem } from "@/components/ui/task-item"
import { useGroupedItems, getItemIdsFromGroups } from "@/lib/grouping"
import { useFocusManager, type KeyboardActions } from "@/hooks/use-focus-manager"
import { getDateForCategory, type DueDateCategory } from "@/lib/format"
import { sortItemsByPosition, isTodo, isTitle } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import type { Item, Todo } from "@/lib/types"

// Constants
const MAX_INDENT_LEVEL = 3

// ============================================
// TitleInput Component (uncontrolled for focus stability)
// ============================================

interface TitleInputProps {
  id: string
  text: string
  onTextChange: (id: string, text: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onFocus: () => void
}

const TitleInput = forwardRef<HTMLInputElement, TitleInputProps>(
  function TitleInput({ id, text, onTextChange, onKeyDown, onFocus }, ref) {
    const inputRef = useRef<HTMLInputElement>(null)
    const isInitialMount = useRef(true)
    const lastSyncedText = useRef(text || "")
    const clearPendingFocus = useStore((state) => state.clearPendingFocus)

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    // On mount: check if this title should be focused via pendingFocusId
    useEffect(() => {
      if (clearPendingFocus(id)) {
        inputRef.current?.focus()
      }
    }, [id, clearPendingFocus])

    // Sync value only when not focused AND text changed externally
    useEffect(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false
        return
      }

      if (
        inputRef.current &&
        document.activeElement !== inputRef.current &&
        text !== lastSyncedText.current
      ) {
        inputRef.current.value = text || ""
        lastSyncedText.current = text || ""
      }
    }, [text])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      lastSyncedText.current = e.target.value
      onTextChange(id, e.target.value)
    }, [id, onTextChange])

    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={text || ''}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        placeholder="Type a title..."
        className="flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
      />
    )
  }
)

interface TodoTextEditorProps {
  onStartFocus?: () => void
}

export function TodoTextEditor({ onStartFocus }: TodoTextEditorProps) {
  // ============================================
  // Store - single source of truth
  // ============================================

  const {
    items,
    showMetadata,
    showCompleted,
    listGroupBy,
    updateItemDebounced,
    deleteItem,
    reorderItems,
    setActiveItem,
    setPendingFocus,
    insertItemAfter,
  } = useStore()
  // ============================================
  // State
  // ============================================

  const [collapsedTitles, setCollapsedTitles] = useState<Set<string>>(new Set())
  const [collapsedDueDateGroups, setCollapsedDueDateGroups] = useState<Set<string>>(new Set())
  const [placeholderTitles, setPlaceholderTitles] = useState<Record<string, string>>({})

  // ============================================
  // Grouping
  // ============================================

  const groupByDueDate = listGroupBy === "dueDate"

  const groups = useGroupedItems(items, listGroupBy, {
    hideCompleted: !showCompleted,
    collapsedGroups: groupByDueDate ? collapsedDueDateGroups : undefined,
    collapsedTitles: !groupByDueDate ? collapsedTitles : undefined,
  })

  // Get flat list of focusable IDs
  const focusableIds = useMemo(() => {
    const ids: string[] = []
    for (const group of groups) {
      for (const item of group.items) {
        ids.push(item.id)
      }
    }
    // Add placeholder IDs for empty due date groups
    if (groupByDueDate) {
      for (const group of groups) {
        if (group.items.length === 0 && group.metadata?.showEmpty) {
          ids.push(`placeholder-${group.key}`)
        }
      }
    }
    return ids
  }, [groups, groupByDueDate])

  // ============================================
  // Focus Management
  // ============================================

  const focusManager = useFocusManager(focusableIds)

  // ============================================
  // Drag and Drop
  // ============================================

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const sortedItems = useMemo(() => sortItemsByPosition(items), [items])

  const sortableIds = useMemo(() => {
    if (groupByDueDate) {
      return getItemIdsFromGroups(groups)
    }
    return sortedItems.map(item => item.id)
  }, [groupByDueDate, groups, sortedItems])

  // Build category map for due date view
  const itemCategoryMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (groupByDueDate) {
      for (const group of groups) {
        for (const item of group.items) {
          map[item.id] = group.key
        }
      }
    }
    return map
  }, [groups, groupByDueDate])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    if (groupByDueDate) {
      const overId = over.id as string
      const sourceCategory = itemCategoryMap[active.id as string]
      let targetCategory: string | undefined

      if (overId.startsWith('drop-')) {
        targetCategory = overId.replace('drop-', '')
      } else if (overId.startsWith('item-')) {
        targetCategory = over.data?.current?.category
      }

      if (targetCategory && targetCategory !== sourceCategory) {
        if (targetCategory === "now") {
          updateItemDebounced(active.id as string, { isNow: true })
        } else {
          const newDueDate = getDateForCategory(targetCategory as DueDateCategory)
          if (sourceCategory === "now") {
            updateItemDebounced(active.id as string, { isNow: false, dueDate: newDueDate })
          } else {
            updateItemDebounced(active.id as string, { dueDate: newDueDate })
          }
        }
      }
      return
    }

    // Position-based reordering
    const oldIndex = sortedItems.findIndex(item => item.id === active.id)
    const newIndex = sortedItems.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(sortedItems, oldIndex, newIndex)
    const updated = reordered.map((item, idx) => ({ ...item, position: idx }))
    reorderItems(updated)
  }, [groupByDueDate, itemCategoryMap, updateItemDebounced, sortedItems, reorderItems])

  // ============================================
  // Collapse Handlers
  // ============================================

  const toggleTitleCollapse = useCallback((titleId: string) => {
    setCollapsedTitles(prev => {
      const next = new Set(prev)
      next.has(titleId) ? next.delete(titleId) : next.add(titleId)
      return next
    })
  }, [])

  const toggleDueDateGroupCollapse = useCallback((category: string) => {
    setCollapsedDueDateGroups(prev => {
      const next = new Set(prev)
      next.has(category) ? next.delete(category) : next.add(category)
      return next
    })
  }, [])

  // ============================================
  // Keyboard Handlers Factory
  // ============================================

  const createKeyboardHandlers = useCallback((
    item: Item,
    options?: { category?: string }
  ): KeyboardActions => ({
    onAltTab: () => {
      if (isTodo(item)) {
        // Convert todo to title
        const newId = insertItemAfter(item.id, 'title')
        updateItemDebounced(newId, { text: item.title || '' })
        setPendingFocus(newId)
        deleteItem(item.id)
      } else if (isTitle(item)) {
        // Convert title to todo
        const newId = insertItemAfter(item.id, 'todo')
        updateItemDebounced(newId, { title: item.text || '' })
        setPendingFocus(newId)
        deleteItem(item.id)
      }
    },
    onTab: () => {
      if (isTodo(item)) {
        updateItemDebounced(item.id, { indent: Math.min(MAX_INDENT_LEVEL, (item.indent ?? 0) + 1) })
      }
    },
    onShiftTab: () => {
      if (isTodo(item)) {
        updateItemDebounced(item.id, { indent: Math.max(0, (item.indent ?? 0) - 1) })
      }
    },
    onArrowUp: () => {
      const prevId = focusManager.getPrevId(item.id)
      if (prevId) {
        setActiveItem(prevId)
        focusManager.focus(prevId)
      }
    },
    onArrowDown: () => {
      const nextId = focusManager.getNextId(item.id)
      if (nextId) {
        setActiveItem(nextId)
        focusManager.focus(nextId)
      }
    },
    onEnter: () => {
      const initialData: Partial<Todo> = {}
      if (options?.category === "now") {
        initialData.isNow = true
      } else if (options?.category) {
        const dueDate = getDateForCategory(options.category as DueDateCategory)
        if (dueDate) initialData.dueDate = dueDate
      }
      const newId = insertItemAfter(item.id, 'todo', initialData)
      setPendingFocus(newId)
    },
    onBackspaceEmpty: () => {
      const targetId = focusManager.getPrevId(item.id)
      if (targetId) {
        setActiveItem(targetId)
        focusManager.focus(targetId)
      }
      deleteItem(item.id)
    },
  }), [insertItemAfter, updateItemDebounced, deleteItem, focusManager, setActiveItem, setPendingFocus])

  // ============================================
  // Initial Item Effect
  // ============================================

  useEffect(() => {
    if (sortedItems.length === 0) {
      insertItemAfter(null, 'todo')
    }
  }, [sortedItems.length, insertItemAfter])

  // ============================================
  // Render Helpers
  // ============================================

  const renderTodo = useCallback((item: Item, options?: { category?: string; indentLevel?: number }) => (
    <TaskItem
      ref={(el) => focusManager.registerRef(item.id, el)}
      todo={{
        id: item.id,
        title: item.title || "",
        completed: item.completed || false,
        status: item.status,
        priority: item.priority,
        dueDate: item.dueDate,
        category: item.category,
        aiProcessingStatus: item.aiProcessingStatus,
        indent: item.indent,
      }}
      onStatusChange={(id, status) => {
        const completed = status === "done"
        updateItemDebounced(id, { status, completed })
      }}
      onSelect={setActiveItem}
      onTitleChange={(id, title) => updateItemDebounced(id, { title })}
      mode="always"
      indentLevel={options?.indentLevel ?? 0}
      showMetadata={showMetadata}
      keyboard={createKeyboardHandlers(item, options)}
    />
  ), [focusManager, setActiveItem, updateItemDebounced, showMetadata, createKeyboardHandlers])

  const renderTitle = useCallback((item: Item, _isFirst: boolean) => {
    const isCollapsed = collapsedTitles.has(item.id)
    const handlers = createKeyboardHandlers(item)

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const inputValue = (e.target as HTMLInputElement).value
      if (e.key === "Tab" && e.altKey) {
        e.preventDefault()
        handlers.onAltTab?.()
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        handlers.onArrowUp?.()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        handlers.onArrowDown?.()
      } else if (e.key === "Enter") {
        e.preventDefault()
        handlers.onEnter?.()
      } else if (e.key === "Backspace" && !inputValue) {
        e.preventDefault()
        handlers.onBackspaceEmpty?.()
      }
    }

    return (
      <div
        className="group flex items-center gap-1 px-3 py-2 transition-colors cursor-pointer"
        onClick={() => setActiveItem(item.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleTitleCollapse(item.id)
          }}
          className="p-0.5 rounded shrink-0"
        >
          {isCollapsed ? (
            <CaretRightIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
          ) : (
            <CaretDownIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
          )}
        </button>
        <TitleInput
          ref={(el) => focusManager.registerRef(item.id, el)}
          id={item.id}
          text={item.text || ''}
          onTextChange={(id, text) => updateItemDebounced(id, { text })}
          onKeyDown={handleKeyDown}
          onFocus={() => setActiveItem(item.id)}
        />
      </div>
    )
  }, [collapsedTitles, focusManager, setActiveItem, updateItemDebounced, createKeyboardHandlers, toggleTitleCollapse])

  const renderPlaceholder = useCallback((category: string) => {
    const placeholderId = `placeholder-${category}`
    const value = placeholderTitles[category] || ""

    return (
      <TaskItem
        ref={(el) => focusManager.registerRef(placeholderId, el)}
        todo={{
          id: placeholderId,
          title: value,
          completed: false,
        }}
        mode="always"
        onTitleChange={(_, title) => {
          setPlaceholderTitles(prev => ({ ...prev, [category]: title }))
        }}
        onToggle={() => {}}
        keyboard={{
          onEnter: () => {
            const title = (placeholderTitles[category] || "").trim()
            if (!title) return
            const initialData: Partial<Todo> = { title }
            if (category === "now") {
              initialData.isNow = true
            } else {
              const dueDate = getDateForCategory(category as DueDateCategory)
              if (dueDate) initialData.dueDate = dueDate
            }
            const newId = insertItemAfter(null, 'todo', initialData)
            setPlaceholderTitles(prev => ({ ...prev, [category]: "" }))
            setPendingFocus(newId)
          },
        }}
        placeholder="Type to add a task..."
      />
    )
  }, [placeholderTitles, insertItemAfter, focusManager, setPendingFocus])

  // ============================================
  // Render Due Date View
  // ============================================

  const renderDueDateView = () => (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => {
        const isNowCategory = group.key === "now"
        const isFirst = groupIndex === 0
        const isCollapsed = collapsedDueDateGroups.has(group.key)

        return (
          <div
            key={group.key}
            className={cn("rounded-lg transition-colors", isNowCategory && "bg-primary/5")}
          >
            <DueDateHeader
              category={group.key}
              label={group.label}
              isCollapsed={isCollapsed}
              isFirst={isFirst}
              onToggle={() => toggleDueDateGroupCollapse(group.key)}
              onStartFocus={isNowCategory ? onStartFocus : undefined}
            />
            {!isCollapsed && (
              <div className={cn(isNowCategory && "pb-2")}>
                {group.items.length > 0 ? (
                  group.items.map((item) => (
                    <DraggableItem key={item.id} id={item.id} category={group.key}>
                      {renderTodo(item, { category: group.key })}
                    </DraggableItem>
                  ))
                ) : (
                  group.metadata?.showEmpty && renderPlaceholder(group.key)
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ============================================
  // Render Position View
  // ============================================

  const renderPositionView = () => (
    <div className="space-y-0">
      {groups.map((group, groupIndex) => {
        // Title group
        if (group.metadata?.titleItem) {
          const titleItem = group.metadata.titleItem
          const isCollapsed = collapsedTitles.has(titleItem.id)
          const isFirst = groupIndex === 0

          return (
            <div
              key={group.key}
              className={cn("rounded-lg", !isFirst && "mt-4")}
            >
              <SortableItem id={titleItem.id}>
                {renderTitle(titleItem, isFirst)}
              </SortableItem>
              {!isCollapsed && group.items.length > 1 && (
                <div className="pb-2">
                  {group.items.slice(1).map((item) => (
                    <SortableItem key={item.id} id={item.id}>
                      {renderTodo(item, { indentLevel: 1 })}
                    </SortableItem>
                  ))}
                </div>
              )}
            </div>
          )
        }

        // Separator group
        if (group.key.startsWith('separator-')) {
          const item = group.items[0]
          return (
            <SortableItem key={group.key} id={item.id}>
              <div
                className="h-4 flex items-center px-3 cursor-pointer hover:bg-muted/20"
                onClick={() => deleteItem(item.id)}
              >
                <div className="w-full h-px bg-border/30" />
              </div>
            </SortableItem>
          )
        }

        // Standalone todos (ungrouped)
        return (
          <div key={group.key}>
            {group.items.map((item) => {
              if (isTodo(item)) {
                return (
                  <SortableItem key={item.id} id={item.id}>
                    {renderTodo(item)}
                  </SortableItem>
                )
              }
              return null
            })}
          </div>
        )
      })}
    </div>
  )

  // ============================================
  // Main Render
  // ============================================

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {groupByDueDate ? (
        renderDueDateView()
      ) : (
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {renderPositionView()}
        </SortableContext>
      )}
    </DndContext>
  )
}
