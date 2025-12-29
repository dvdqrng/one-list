"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
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
import { sortItemsByPosition, isTodo, isSeparator } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import type { Item, Todo } from "@/lib/types"

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
  // Sorted Items & Visibility Logic (For Position View)
  // ============================================

  const sortedItems = useMemo(() => sortItemsByPosition(items), [items])

  const visibleSortedItems = useMemo(() => {
    if (groupByDueDate) return [] // Not used for due date view

    const visible: Item[] = []
    let skipUntilLevelUnder = -1

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i]

      // Filter out completed if hidden
      if (!showCompleted && isTodo(item) && item.completed) continue

      const indent = item.indent || 0

      // If we are effectively inside a collapsed parent
      if (skipUntilLevelUnder !== -1) {
        if (indent > skipUntilLevelUnder) {
          continue // Skip this child
        } else {
          skipUntilLevelUnder = -1 // Hierarchy returned to parent level or higher
        }
      }

      visible.push(item)

      // Check if this item is collapsed and has children
      if (collapsedItems.has(item.id)) {
        // Peek ahead to see if next item is a child
        if (i + 1 < sortedItems.length) {
          const nextItem = sortedItems[i + 1]
          const nextIndent = nextItem.indent || 0
          // If next item is indented deeper, we are a parent with children to hide
          if (nextIndent > indent) {
            skipUntilLevelUnder = indent
          }
        }
      }
    }
    return visible
  }, [sortedItems, collapsedItems, showCompleted, groupByDueDate])


  // ============================================
  // Focus Management
  // ============================================

  const focusableIds = useMemo(() => {
    if (groupByDueDate) {
      // Logic for groups
      const ids: string[] = []
      for (const group of groups) {
        for (const item of group.items) ids.push(item.id)
        if (group.items.length === 0 && group.metadata?.showEmpty) {
          ids.push(`placeholder-${group.key}`)
        }
      }
      return ids
    } else {
      return visibleSortedItems.map(i => i.id)
    }
  }, [groups, groupByDueDate, visibleSortedItems])

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
      isFirstProjectHeader?: boolean
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
            className={cn("rounded-lg transition-colors")}
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
                      {renderTodo(item, {
                        category: group.key,
                        indentLevel: item.indent ?? 0,
                      })}
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

  const renderPositionView = () => {
    let projectGroupIndex = 0

    return (
      <div className="space-y-0 relative">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {visibleSortedItems.map((item, index) => {
          // Simplify: We need to know if it's a parent to render caret
          // We can check global sortedItems to optimize? 
          // Or just check visible items... NO. If it is collapsed, visible items won't show the child.
          // So we must check the original sortedItems to see if any child exists.
          // Finding index in global list...
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
                  isFirstProjectHeader,
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
      {groupByDueDate ? (
        renderDueDateView()
      ) : (
        renderPositionView()
      )}
    </DndContext>
  )
}
