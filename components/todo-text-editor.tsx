"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { SortableItem } from "@/components/sortable-item"
import { DraggableItem } from "@/components/draggable-item"
import { TaskItem } from "@/components/ui/task-item"
import { useGroupedItems, getItemIdsFromGroups } from "@/lib/grouping"
import { useFocusManager, type KeyboardActions } from "@/hooks/use-focus-manager"
import { getDateForCategory, type DueDateCategory } from "@/lib/format"
import { sortItemsByPosition, isTodo, isSeparator } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import type { Item, Todo } from "@/lib/types"
import { CaretDownIcon, CaretRightIcon, PlayIcon } from "@phosphor-icons/react"

type ListEntry =
  | { kind: "header"; key: string; label: string; isFirst: boolean; isNow: boolean }
  | { kind: "placeholder"; key: string }
  | { kind: "item"; item: Item; category?: string }

// Constants
const MAX_INDENT_LEVEL = 5 // Increased depth for hierarchy

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

  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set())
  const [collapsedDueDateGroups, setCollapsedDueDateGroups] = useState<Set<string>>(new Set())
  const [placeholderTitles, setPlaceholderTitles] = useState<Record<string, string>>({})

  // ============================================
  // Grouping
  // ============================================

  const groupByDueDate = listGroupBy === "dueDate"

  const groups = useGroupedItems(items, listGroupBy, {
    hideCompleted: !showCompleted,
    collapsedGroups: groupByDueDate ? collapsedDueDateGroups : undefined,
  })

  // ============================================
  // Sorted Items (used for drag/drop reordering)
  // ============================================

  const sortedItems = useMemo(() => sortItemsByPosition(items), [items])

  const visibleSortedItems = useMemo(() => {
    const visible: Item[] = []
    let skipUntilLevelUnder = -1

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i]

      if (!showCompleted && isTodo(item) && item.completed) continue

      const indent = item.indent || 0

      if (skipUntilLevelUnder !== -1) {
        if (indent > skipUntilLevelUnder) {
          continue
        } else {
          skipUntilLevelUnder = -1
        }
      }

      visible.push(item)

      if (collapsedItems.has(item.id)) {
        if (i + 1 < sortedItems.length) {
          const nextItem = sortedItems[i + 1]
          const nextIndent = nextItem.indent || 0
          if (nextIndent > indent) {
            skipUntilLevelUnder = indent
          }
        }
      }
    }
    return visible
  }, [sortedItems, collapsedItems, showCompleted])

  const listEntries = useMemo((): ListEntry[] => {
    if (!groupByDueDate) {
      return visibleSortedItems.map(item => ({ kind: "item", item }))
    }

    const entries: ListEntry[] = []
    groups.forEach((group, index) => {
      const isCollapsed = collapsedDueDateGroups.has(group.key)
      entries.push({
        kind: "header",
        key: group.key,
        label: group.label,
        isFirst: index === 0,
        isNow: group.key === "now"
      })

      if (!isCollapsed) {
        if (group.items.length > 0) {
          group.items.forEach(item => {
            entries.push({ kind: "item", item, category: group.key })
          })
        } else if (group.metadata?.showEmpty) {
          entries.push({ kind: "placeholder", key: group.key })
        }
      }
    })
    return entries
  }, [groupByDueDate, groups, collapsedDueDateGroups, visibleSortedItems])


  // ============================================
  // Focus Management
  // ============================================

  const focusableIds = useMemo(() => {
    const ids: string[] = []
    for (const entry of listEntries) {
      if (entry.kind === "item") ids.push(entry.item.id)
      if (entry.kind === "placeholder") ids.push(`placeholder-${entry.key}`)
    }
    return ids
  }, [listEntries])

  const focusManager = useFocusManager(focusableIds)

  // ============================================
  // Drag and Drop
  // ============================================

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const sortableIds = useMemo(() => {
    if (groupByDueDate) {
      return getItemIdsFromGroups(groups)
    }
    return visibleSortedItems.map(item => item.id)
  }, [groupByDueDate, groups, visibleSortedItems])

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
      // Logic for moving between date groups
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

    // Position-based reordering in list view
    // We must reorder based on the global sortedItems, but find indices via IDs
    const oldIndex = sortedItems.findIndex(item => item.id === active.id)
    // For drop target, if we dropped between items in visible list, we map back to global list
    // Use ID to find target in global list
    const newIndex = sortedItems.findIndex(item => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(sortedItems, oldIndex, newIndex)
    const updated = reordered.map((item, idx) => ({ ...item, position: idx }))
    reorderItems(updated)
  }, [groupByDueDate, itemCategoryMap, updateItemDebounced, sortedItems, reorderItems])

  // ============================================
  // Collapse Handlers
  // ============================================

  const toggleItemCollapse = useCallback((itemId: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
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
      // Legacy behavior: convert to title? No, just maybe toggle completed or maximize?
      // Leaving empty for now as requested "delete logic", preventing accidental behavior
    },
    onTab: () => {
      // Indent
      updateItemDebounced(item.id, { indent: Math.min(MAX_INDENT_LEVEL, (item.indent ?? 0) + 1) })
    },
    onShiftTab: () => {
      // Outdent
      updateItemDebounced(item.id, { indent: Math.max(0, (item.indent ?? 0) - 1) })
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

      // Inherit indent from current item
      // But if item is collapsed, inserting after it should maybe put it at same level
      initialData.indent = item.indent || 0;

      const newId = insertItemAfter(item.id, initialData)
      setPendingFocus(newId)
    },
    onBackspaceEmpty: () => {
      // If indented, outdent first?
      if ((item.indent || 0) > 0) {
        updateItemDebounced(item.id, { indent: (item.indent || 0) - 1 })
        return
      }

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
      insertItemAfter(null)
    }
  }, [sortedItems.length, insertItemAfter])

  // ============================================
  // Render Helpers
  // ============================================

  const renderTodo = useCallback((
    item: Item,
    options?: {
      category?: string
      indentLevel?: number
      isParent?: boolean
      isCollapsed?: boolean
      isProjectHeader?: boolean
    }
  ) => {
    const visualIndent = options?.indentLevel ?? item.indent ?? 0
    const isProjectGroupHeader = Boolean(options?.isProjectHeader)

    return (
      <div className="relative group/wrapper">
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
            indent: 0,
          }}
          size="md"
          onStatusChange={(id, status) => {
            const completed = status === "done"
            updateItemDebounced(id, { status, completed })
          }}
          onSelect={setActiveItem}
          onTitleChange={(id, title) => updateItemDebounced(id, { title })}
          mode="always"
          className={cn(
            options?.isParent && !isProjectGroupHeader && "font-medium",
            isProjectGroupHeader &&
              "text-lg font-semibold py-0 cursor-pointer hover:opacity-80"
          )}
          indentLevel={visualIndent}
          showMetadata={showMetadata && !isProjectGroupHeader}
          interactive={false}
          keyboard={createKeyboardHandlers(item, options)}
          onCollapseToggle={options?.isParent && !groupByDueDate ? () => toggleItemCollapse(item.id) : undefined}
          isCollapsed={options?.isCollapsed}
        />
      </div>
    )
  }, [focusManager, setActiveItem, updateItemDebounced, showMetadata, createKeyboardHandlers, toggleItemCollapse, groupByDueDate])

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
            const newId = insertItemAfter(null, initialData)
            setPlaceholderTitles(prev => ({ ...prev, [category]: "" }))
            setPendingFocus(newId)
          },
        }}
        placeholder="Type to add a task..."
      />
    )
  }, [placeholderTitles, insertItemAfter, focusManager, setPendingFocus])

  // ============================================
  // Render Unified Grouped View
  // ============================================

  const renderGroupedView = () => {
    let projectGroupIndex = 0

    return (
      <div className={groupByDueDate ? "space-y-4" : "space-y-0 relative"}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {listEntries.map((entry) => {
            if (entry.kind === "header") {
              return (
                <DueDateGroupRow
                  key={`header-${entry.key}`}
                  entry={entry}
                  isCollapsed={collapsedDueDateGroups.has(entry.key)}
                  onToggle={() => toggleDueDateGroupCollapse(entry.key)}
                  onStartFocus={entry.isNow ? onStartFocus : undefined}
                />
              )
            }

            if (entry.kind === "placeholder") {
              return (
                <div key={`placeholder-${entry.key}`} className="pl-3">
                  {renderPlaceholder(entry.key)}
                </div>
              )
            }

            const item = entry.item

            const globalIndex = sortedItems.findIndex(i => i.id === item.id)
            let isParent = false
            if (globalIndex !== -1 && globalIndex + 1 < sortedItems.length) {
              const nextItem = sortedItems[globalIndex + 1]
              if ((nextItem.indent || 0) > (item.indent || 0)) {
                isParent = true
              }
            }

            if (isSeparator(item)) {
              return (
                <SortableItem key={item.id} id={item.id}>
                  <div
                    className="h-4 flex items-center px-3 cursor-pointer hover:bg-muted/20"
                    onClick={() => deleteItem(item.id)}
                  >
                    <div className="w-full h-px bg-border/30" />
                  </div>
                </SortableItem>
              )
            }

            if (isTodo(item)) {
              const itemIndent = item.indent ?? 0
              const isCollapsed = collapsedItems.has(item.id)
              const isProjectHeader = !groupByDueDate && itemIndent === 0 && isParent
              const isFirstProjectHeader = isProjectHeader && projectGroupIndex === 0

              if (groupByDueDate) {
                return (
                  <DraggableItem key={item.id} id={item.id} category={entry.category}>
                    {renderTodo(item, {
                      category: entry.category,
                      indentLevel: item.indent ?? 0,
                    })}
                  </DraggableItem>
                )
              }

              const element = (
                <SortableItem
                  key={item.id}
                  id={item.id}
                  className={cn(isProjectHeader && (isFirstProjectHeader ? "mt-0" : "mt-8"))}
                >
                  {renderTodo(item, {
                    indentLevel: itemIndent,
                    isParent,
                    isCollapsed,
                    isProjectHeader,
                  })}
                </SortableItem>
              )

              if (isProjectHeader) {
                projectGroupIndex += 1
              }

              return element
            }
            return null
          })}
        </SortableContext>
      </div>
    )
  }

  // ============================================
  // Main Render
  // ============================================

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {renderGroupedView()}
    </DndContext>
  )
}

interface DueDateGroupRowProps {
  entry: Extract<ListEntry, { kind: "header" }>
  isCollapsed: boolean
  onToggle: () => void
  onStartFocus?: () => void
}

function DueDateGroupRow({ entry, isCollapsed, onToggle, onStartFocus }: DueDateGroupRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${entry.key}`,
    data: { category: entry.key },
    disabled: false,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground",
        !entry.isFirst && "mt-6",
        isOver && "bg-muted/40 rounded-md"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 text-muted-foreground hover:opacity-80"
      >
        {isCollapsed ? (
          <CaretRightIcon className="h-4 w-4" weight="bold" />
        ) : (
          <CaretDownIcon className="h-4 w-4" weight="bold" />
        )}
      </button>
      <span className={cn("text-base", entry.isNow && "text-primary")}>{entry.label}</span>
      <div className="ml-auto flex items-center gap-2">
        {entry.isNow && onStartFocus && (
          <button
            type="button"
            onClick={onStartFocus}
            className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
          >
            <PlayIcon className="h-3 w-3" weight="fill" />
            Focus
          </button>
        )}
      </div>
    </div>
  )
}
