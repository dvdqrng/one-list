"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from "react"
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
import {
  getDueDateCategory,
  getDateForCategory,
  DUE_DATE_GROUP_ORDER,
  DUE_DATE_LABELS,
  type DueDateCategory
} from "@/lib/format"
import { sortItemsByPosition, isTodo, isTitle, isSeparator } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { Item, Todo } from "@/lib/types"

// Constants
const MAX_INDENT_LEVEL = 3

// Type definitions for render items
type RenderItem =
  | { type: 'item'; item: Item; parentTitleId?: string; dueDateCategory?: DueDateCategory }
  | { type: 'due-date-header'; category: DueDateCategory; label: string; itemCount: number }
  | { type: 'empty-placeholder'; category: DueDateCategory }

type DueDateGroup = {
  category: DueDateCategory
  label: string
  items: Item[]
  isCollapsed: boolean
}

// Focus action types for unified focus management
type FocusAction =
  | { type: 'id'; id: string }
  | { type: 'prev'; fromId: string }
  | { type: 'next'; fromId: string }
  | { type: 'first' }
  | { type: 'last' }
  | null

interface TodoTextEditorProps {
  items: Item[]
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  onUpdateTitle: (id: string, text: string) => void
  onDeleteItem: (id: string) => void
  onToggleTodo: (id: string) => void
  onSelectTodo: (id: string) => void
  onSelectTitle: (id: string) => void
  onReorderItems: (items: Item[]) => void
  onInsertItemAfter: (afterId: string | null, type: 'todo' | 'title' | 'separator', initialData?: Partial<Todo>) => string
  showMetadata: boolean
  hideCompleted: boolean
  groupByDueDate: boolean
  onStartFocus?: () => void
}

export function TodoTextEditor({
  items,
  onUpdateTodo,
  onUpdateTitle,
  onDeleteItem,
  onToggleTodo,
  onSelectTodo,
  onSelectTitle,
  onReorderItems,
  onInsertItemAfter,
  showMetadata,
  hideCompleted,
  groupByDueDate,
  onStartFocus,
}: TodoTextEditorProps) {
  // ============================================
  // State
  // ============================================

  // Track collapsed title IDs
  const [collapsedTitles, setCollapsedTitles] = useState<Set<string>>(new Set())
  // Track collapsed due date categories
  const [collapsedDueDateGroups, setCollapsedDueDateGroups] = useState<Set<DueDateCategory>>(new Set())
  // Unified focus management - stores the action to perform after next render
  const [pendingFocus, setPendingFocus] = useState<FocusAction>(null)
  // Track placeholder text for empty due date groups
  const [placeholderTitles, setPlaceholderTitles] = useState<Record<DueDateCategory, string>>({
    "now": "",
    "overdue": "",
    "today": "",
    "tomorrow": "",
    "this-week": "",
    "later": "",
    "no-date": "",
  })

  // ============================================
  // Refs
  // ============================================

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Track if initial empty item has been inserted
  const hasInsertedInitial = useRef(false)

  // ============================================
  // Collapse Handlers
  // ============================================

  const toggleTitleCollapse = useCallback((titleId: string) => {
    setCollapsedTitles(prev => {
      const next = new Set(prev)
      if (next.has(titleId)) {
        next.delete(titleId)
      } else {
        next.add(titleId)
      }
      return next
    })
  }, [])

  const toggleDueDateGroupCollapse = useCallback((category: DueDateCategory) => {
    setCollapsedDueDateGroups(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

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

  // Single source of truth for items (sorted by position)
  const sortedItems = useMemo(
    () => sortItemsByPosition(items),
    [items]
  )

  // Build id-to-index map for O(1) lookups
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    sortedItems.forEach((item, idx) => map.set(item.id, idx))
    return map
  }, [sortedItems])

  // Helper to find parent title for a todo by its id
  // Stops at separators AND empty todos (both act as group boundaries)
  const findParentTitleId = useCallback((itemId: string): string | undefined => {
    const itemIndex = itemIndexMap.get(itemId)
    if (itemIndex === undefined) return undefined

    for (let i = itemIndex - 1; i >= 0; i--) {
      const item = sortedItems[i]
      if (isSeparator(item)) {
        return undefined
      }
      // Empty todos also act as group boundaries
      if (isTodo(item) && !item.title?.trim()) {
        return undefined
      }
      if (isTitle(item)) {
        return item.id
      }
    }
    return undefined
  }, [itemIndexMap, sortedItems])

  // Filter out completed todos if hideCompleted is true
  const filteredItems = useMemo(
    () => hideCompleted
      ? sortedItems.filter(item => !(isTodo(item) && item.completed))
      : sortedItems,
    [sortedItems, hideCompleted]
  )

  // Group todos by due date category (only used when groupByDueDate is true)
  const groupedTodos = useMemo(() => {
    if (!groupByDueDate) return null

    const todoItems = filteredItems.filter(item => isTodo(item))
    const groups: Record<DueDateCategory, Item[]> = {
      "now": [],
      "overdue": [],
      "today": [],
      "tomorrow": [],
      "this-week": [],
      "later": [],
      "no-date": [],
    }

    for (const todo of todoItems) {
      if (todo.isNow) {
        groups["now"].push(todo)
      } else {
        const category = getDueDateCategory(todo.dueDate)
        groups[category].push(todo)
      }
    }

    return groups
  }, [filteredItems, groupByDueDate])

  // Build due date groups for rendering
  const dueDateGroups = useMemo((): DueDateGroup[] | undefined => {
    if (!groupByDueDate || !groupedTodos) return undefined

    const alwaysShowCategories: DueDateCategory[] = ["now", "today", "tomorrow"]
    const groups: DueDateGroup[] = []

    for (const category of DUE_DATE_GROUP_ORDER) {
      const todosInCategory = groupedTodos[category]
      const shouldShow = todosInCategory.length > 0 || alwaysShowCategories.includes(category)
      if (shouldShow) {
        const isCollapsed = collapsedDueDateGroups.has(category)
        groups.push({
          category,
          label: DUE_DATE_LABELS[category],
          items: isCollapsed ? [] : todosInCategory,
          isCollapsed,
        })
      }
    }

    return groups
  }, [groupByDueDate, groupedTodos, collapsedDueDateGroups])

  // Build render items and sortable IDs
  const { allItems, sortableIds, dueDateItemCategories } = useMemo(() => {
    if (groupByDueDate && dueDateGroups) {
      const renderItems: RenderItem[] = []
      const ids: string[] = []
      const itemCategories: Record<string, DueDateCategory> = {}

      for (const group of dueDateGroups) {
        renderItems.push({
          type: 'due-date-header',
          category: group.category,
          label: group.label,
          itemCount: groupedTodos?.[group.category]?.length ?? 0,
        })

        if (!group.isCollapsed) {
          for (const todo of group.items) {
            renderItems.push({ type: 'item', item: todo, dueDateCategory: group.category })
            ids.push(todo.id)
            itemCategories[todo.id] = group.category
          }
          if (group.items.length === 0) {
            renderItems.push({ type: 'empty-placeholder', category: group.category })
          }
        }
      }

      return { allItems: renderItems, sortableIds: ids, dueDateItemCategories: itemCategories }
    }

    // Default: position-based ordering with parent title tracking
    const renderItems: RenderItem[] = filteredItems.map((item) => {
      const parentTitleId = isTodo(item) ? findParentTitleId(item.id) : undefined
      return { type: 'item', item, parentTitleId, dueDateCategory: undefined }
    })
    const ids = filteredItems.map(item => item.id)

    return { allItems: renderItems, sortableIds: ids, dueDateItemCategories: {} as Record<string, DueDateCategory> }
  }, [filteredItems, groupByDueDate, dueDateGroups, groupedTodos, findParentTitleId])

  // ============================================
  // Focus Management (ID-based, not index-based)
  // ============================================

  // Build ordered list of focusable item IDs
  const focusableIds = useMemo(() => {
    return allItems
      .filter(item => item.type === 'item')
      .map(item => (item as { type: 'item'; item: Item }).item.id)
  }, [allItems])

  // Find previous focusable ID (used for pre-calculating focus target before deletion)
  const getPrevFocusableId = useCallback((fromId: string): string | null => {
    const index = focusableIds.indexOf(fromId)
    if (index <= 0) return null
    return focusableIds[index - 1]
  }, [focusableIds])

  // Unified focus effect - handles all focus actions after render
  // All keyboard navigation goes through this for consistency
  useEffect(() => {
    if (!pendingFocus) return

    let targetId: string | null = null

    switch (pendingFocus.type) {
      case 'id':
        targetId = pendingFocus.id
        break
      case 'prev': {
        // For 'prev', the fromId might already be deleted from focusableIds
        // Try to find it first, if not found, use the ID we calculated before deletion
        const index = focusableIds.indexOf(pendingFocus.fromId)
        if (index > 0) {
          targetId = focusableIds[index - 1]
        } else if (index === 0) {
          // At first item, stay there (or could wrap to last)
          targetId = focusableIds[0]
        }
        // If index === -1, fromId was deleted - fallback handled below
        break
      }
      case 'next': {
        const index = focusableIds.indexOf(pendingFocus.fromId)
        if (index !== -1 && index < focusableIds.length - 1) {
          targetId = focusableIds[index + 1]
        } else if (index === focusableIds.length - 1) {
          // At last item, stay there (or could wrap to first)
          targetId = focusableIds[focusableIds.length - 1]
        }
        break
      }
      case 'first':
        targetId = focusableIds[0] ?? null
        break
      case 'last':
        targetId = focusableIds[focusableIds.length - 1] ?? null
        break
    }

    // Try to focus the target
    if (targetId && inputRefs.current[targetId]) {
      inputRefs.current[targetId]?.focus()
    } else if (focusableIds.length > 0) {
      // Fallback: if target not found, focus first available item
      const fallbackId = focusableIds[0]
      inputRefs.current[fallbackId]?.focus()
    }

    setPendingFocus(null)
  }, [pendingFocus, focusableIds])

  // Clean up stale refs when items change
  useEffect(() => {
    const validIds = new Set(focusableIds)
    // Also keep placeholder refs
    for (const category of DUE_DATE_GROUP_ORDER) {
      validIds.add(`placeholder-${category}`)
    }
    // Remove refs that no longer exist
    for (const id of Object.keys(inputRefs.current)) {
      if (!validIds.has(id)) {
        delete inputRefs.current[id]
      }
    }
  }, [focusableIds])

  // ============================================
  // Keyboard Handlers
  // ============================================

  // Factory to create keyboard handlers for todos
  // All focus changes go through pendingFocus for consistency
  const createTodoKeyboardHandlers = useCallback((
    todo: Todo,
    options?: { category?: DueDateCategory }
  ) => ({
    onAltTab: () => {
      // Convert todo to title: create title, copy text, delete original, focus new
      const newId = onInsertItemAfter(todo.id, 'title')
      onUpdateTitle(newId, todo.title || '')
      setPendingFocus({ type: 'id', id: newId })
      // Delete after setting focus target (focus effect will find newId)
      onDeleteItem(todo.id)
    },
    onTab: () => onUpdateTodo(todo.id, { indent: Math.min(MAX_INDENT_LEVEL, (todo.indent ?? 0) + 1) }),
    onShiftTab: () => onUpdateTodo(todo.id, { indent: Math.max(0, (todo.indent ?? 0) - 1) }),
    // Use pendingFocus for ALL navigation (unified approach)
    onArrowUp: () => setPendingFocus({ type: 'prev', fromId: todo.id }),
    onArrowDown: () => setPendingFocus({ type: 'next', fromId: todo.id }),
    onEnter: () => {
      const initialData: Partial<Todo> = {}
      if (options?.category === "now") {
        initialData.isNow = true
      } else if (options?.category) {
        const dueDate = getDateForCategory(options.category)
        if (dueDate) {
          initialData.dueDate = dueDate
        }
      }
      const newId = onInsertItemAfter(todo.id, 'todo', initialData)
      setPendingFocus({ type: 'id', id: newId })
    },
    onBackspaceEmpty: () => {
      // IMPORTANT: Calculate target ID BEFORE deleting to avoid stale focusableIds
      const targetId = getPrevFocusableId(todo.id)
      onDeleteItem(todo.id)
      // Focus previous if exists, otherwise focus first remaining item
      if (targetId) {
        setPendingFocus({ type: 'id', id: targetId })
      } else {
        setPendingFocus({ type: 'first' })
      }
    },
  }), [onInsertItemAfter, onUpdateTitle, onDeleteItem, onUpdateTodo, getPrevFocusableId])

  // Keyboard handler for title items
  // Uses same unified focus approach as todos
  const handleTitleKeyDown = useCallback((item: Item, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isTitle(item)) return

    // Option+Tab (Alt+Tab) - convert title to todo
    if (e.key === "Tab" && e.altKey) {
      e.preventDefault()
      const newId = onInsertItemAfter(item.id, 'todo')
      onUpdateTodo(newId, { title: item.text || '' })
      setPendingFocus({ type: 'id', id: newId })
      // Delete after setting focus target
      onDeleteItem(item.id)
      return
    }

    // Arrow Up - navigate to previous item (unified via pendingFocus)
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setPendingFocus({ type: 'prev', fromId: item.id })
      return
    }

    // Arrow Down - navigate to next item (unified via pendingFocus)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setPendingFocus({ type: 'next', fromId: item.id })
      return
    }

    // Enter - insert new todo after title
    if (e.key === "Enter") {
      e.preventDefault()
      const newId = onInsertItemAfter(item.id, 'todo')
      setPendingFocus({ type: 'id', id: newId })
      return
    }

    // Backspace - delete empty title
    if (e.key === "Backspace" && !item.text) {
      e.preventDefault()
      // Calculate target BEFORE deleting
      const targetId = getPrevFocusableId(item.id)
      onDeleteItem(item.id)
      if (targetId) {
        setPendingFocus({ type: 'id', id: targetId })
      } else {
        setPendingFocus({ type: 'first' })
      }
    }
  }, [onInsertItemAfter, onUpdateTodo, onDeleteItem, getPrevFocusableId])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    if (groupByDueDate) {
      // In due date view, dragging changes the due date or isNow flag
      const overId = over.id as string
      const sourceCategory = dueDateItemCategories[active.id as string]
      let targetCategory: DueDateCategory | undefined

      // Check if dropping on a category header (drop zone)
      if (overId.startsWith('drop-')) {
        targetCategory = overId.replace('drop-', '') as DueDateCategory
      }
      // Check if dropping on another todo item (item-{id} format from DraggableItem)
      else if (overId.startsWith('item-')) {
        // Get category from the drop target's data
        targetCategory = over.data?.current?.category as DueDateCategory
      }

      if (targetCategory && targetCategory !== sourceCategory) {
        // Handle "now" category specially - set isNow flag instead of due date
        if (targetCategory === "now") {
          onUpdateTodo(active.id as string, { isNow: true })
        } else {
          // Moving out of "now" or between other categories
          const newDueDate = getDateForCategory(targetCategory)
          // If moving from "now", clear the isNow flag
          if (sourceCategory === "now") {
            onUpdateTodo(active.id as string, { isNow: false, dueDate: newDueDate })
          } else {
            onUpdateTodo(active.id as string, { dueDate: newDueDate })
          }
        }
      }
      return
    }

    // Normal position-based reordering
    const oldIndex = sortedItems.findIndex((item) => item.id === active.id)
    const newIndex = sortedItems.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const reorderedItems = arrayMove(sortedItems, oldIndex, newIndex)

    // Update positions to reflect the new order
    const updatedItems = reorderedItems.map((item: Item, idx: number) => ({
      ...item,
      position: idx,
    }))

    onReorderItems(updatedItems)
  }, [groupByDueDate, dueDateItemCategories, onUpdateTodo, sortedItems, onReorderItems])

  // ============================================
  // Initial Item Effect
  // ============================================

  // Ensure there's always at least one empty todo to type into
  useEffect(() => {
    // Only insert if truly empty and we haven't already done so
    if (sortedItems.length === 0 && !hasInsertedInitial.current) {
      hasInsertedInitial.current = true
      onInsertItemAfter(null, 'todo')
    }
    // Reset flag when items exist (allows re-insertion if ALL items deleted later)
    if (sortedItems.length > 0) {
      hasInsertedInitial.current = false
    }
  }, [sortedItems.length, onInsertItemAfter])

  // ============================================
  // Render Helpers
  // ============================================

  // Helper to render a todo item in due date view
  const renderDueDateTodo = useCallback((todo: Todo, category: DueDateCategory) => (
    <DraggableItem key={todo.id} id={todo.id} category={category}>
      <TaskItem
        ref={(el) => { inputRefs.current[todo.id] = el }}
        todo={todo}
        onToggle={onToggleTodo}
        onClick={onSelectTodo}
        onTitleChange={(id, title) => onUpdateTodo(id, { title })}
        onFocus={onSelectTodo}
        editable
        indentLevel={0}
        showMetadata={showMetadata}
        onMetadataClick={onSelectTodo}
        keyboard={createTodoKeyboardHandlers(todo, { category })}
      />
    </DraggableItem>
  ), [onToggleTodo, onSelectTodo, onUpdateTodo, showMetadata, createTodoKeyboardHandlers])

  // Helper to render empty placeholder for a due date category
  const renderEmptyPlaceholder = useCallback((category: DueDateCategory) => {
    const placeholderId = `placeholder-${category}`
    const placeholderTodo: Todo = {
      id: placeholderId,
      title: placeholderTitles[category],
      completed: false,
      createdAt: new Date().toISOString(),
    }
    return (
      <TaskItem
        key={placeholderId}
        ref={(el) => { inputRefs.current[placeholderId] = el }}
        todo={placeholderTodo}
        editable
        onTitleChange={(_id, title) => {
          setPlaceholderTitles(prev => ({ ...prev, [category]: title }))
        }}
        onToggle={() => {}}
        keyboard={{
          onEnter: () => {
            const title = placeholderTitles[category].trim()
            if (!title) return
            const initialData: Partial<Todo> = { title }
            if (category === "now") {
              initialData.isNow = true
            } else {
              const dueDate = getDateForCategory(category)
              if (dueDate) {
                initialData.dueDate = dueDate
              }
            }
            const newId = onInsertItemAfter(null, 'todo', initialData)
            setPlaceholderTitles(prev => ({ ...prev, [category]: "" }))
            setPendingFocus({ type: 'id', id: newId })
          },
        }}
        placeholder="Type to add a task..."
      />
    )
  }, [placeholderTitles, onInsertItemAfter])

  // Content for due date grouped view - renders groups with wrapper divs
  const dueDateContent = dueDateGroups ? (
    <div className="space-y-4">
      {dueDateGroups.map((group, groupIndex) => {
        const isNowCategory = group.category === "now"
        const isFirst = groupIndex === 0

        return (
          <div
            key={group.category}
            className={cn(
              "rounded-lg transition-colors",
              isNowCategory && "bg-primary/5"
            )}
          >
            <DueDateHeader
              category={group.category}
              label={group.label}
              isCollapsed={group.isCollapsed}
              isFirst={isFirst}
              onToggle={() => toggleDueDateGroupCollapse(group.category)}
              onStartFocus={isNowCategory ? onStartFocus : undefined}
              itemCount={group.items.length}
            />
            {!group.isCollapsed && (
              <div className={cn(isNowCategory && "pb-2")}>
                {group.items.length > 0 ? (
                  group.items.map((item) => {
                    const todo = item as Todo
                    return renderDueDateTodo(todo, group.category)
                  })
                ) : (
                  renderEmptyPlaceholder(group.category)
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  ) : null

  // Helper to find todos that belong to a title group (by ID, not index)
  const getTodosForTitle = useCallback((titleId: string): Item[] => {
    const titleIndex = allItems.findIndex(
      ri => ri.type === 'item' && ri.item.id === titleId
    )
    if (titleIndex === -1) return []

    const todos: Item[] = []
    for (let i = titleIndex + 1; i < allItems.length; i++) {
      const renderItem = allItems[i]
      if (renderItem.type !== 'item') break
      const checkItem = renderItem.item
      // Stop at separators or other titles
      if (isSeparator(checkItem) || isTitle(checkItem)) break
      // Stop at empty todos (group boundary)
      if (isTodo(checkItem) && !checkItem.title?.trim()) break
      if (isTodo(checkItem) && renderItem.parentTitleId === titleId) {
        todos.push(checkItem)
      } else {
        break
      }
    }
    return todos
  }, [allItems])

  // Helper to render a separator item
  const renderSeparator = useCallback((item: Item) => (
    <SortableItem key={item.id} id={item.id}>
      <div
        className="h-4 flex items-center px-3 cursor-pointer hover:bg-muted/20"
        onClick={() => onDeleteItem(item.id)}
      >
        <div className="w-full h-px bg-border/30" />
      </div>
    </SortableItem>
  ), [onDeleteItem])

  // Helper to render a standalone todo (not in a title group)
  const renderStandaloneTodo = useCallback((todo: Todo) => (
    <SortableItem key={todo.id} id={todo.id}>
      <TaskItem
        ref={(el) => { inputRefs.current[todo.id] = el }}
        todo={todo}
        onToggle={onToggleTodo}
        onClick={onSelectTodo}
        onTitleChange={(id, title) => onUpdateTodo(id, { title })}
        onFocus={onSelectTodo}
        editable
        indentLevel={0}
        showMetadata={showMetadata}
        onMetadataClick={onSelectTodo}
        keyboard={createTodoKeyboardHandlers(todo)}
      />
    </SortableItem>
  ), [onToggleTodo, onSelectTodo, onUpdateTodo, showMetadata, createTodoKeyboardHandlers])

  // Helper to render a grouped todo (used in title groups)
  const renderGroupedTodo = useCallback((todo: Todo) => (
    <SortableItem key={todo.id} id={todo.id}>
      <TaskItem
        ref={(el) => { inputRefs.current[todo.id] = el }}
        todo={todo}
        onToggle={onToggleTodo}
        onClick={onSelectTodo}
        onTitleChange={(id, title) => onUpdateTodo(id, { title })}
        onFocus={onSelectTodo}
        editable
        indentLevel={1}
        showMetadata={showMetadata}
        onMetadataClick={onSelectTodo}
        keyboard={createTodoKeyboardHandlers(todo)}
      />
    </SortableItem>
  ), [onToggleTodo, onSelectTodo, onUpdateTodo, showMetadata, createTodoKeyboardHandlers])

  // Helper to check if this is the first visible title (for margin)
  const isFirstTitle = useCallback((titleId: string): boolean => {
    const firstTitleItem = allItems.find(
      ri => ri.type === 'item' && isTitle(ri.item)
    )
    return firstTitleItem?.type === 'item' && firstTitleItem.item.id === titleId
  }, [allItems])

  // Helper to render a title with its child todos
  const renderTitleGroup = useCallback((item: Item) => {
    if (!isTitle(item)) return null

    const isCollapsed = collapsedTitles.has(item.id)
    const isFirst = isFirstTitle(item.id)
    const groupTodos = getTodosForTitle(item.id)

    return (
      <div
        key={item.id}
        className={cn(
          "rounded-lg bg-primary/5",
          !isFirst && "mt-4"
        )}
      >
        <SortableItem id={item.id}>
          <div
            className="group flex items-center gap-1 px-3 py-2 transition-colors hover:bg-primary/10 cursor-pointer"
            onClick={() => onSelectTitle(item.id)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleTitleCollapse(item.id)
              }}
              className="p-0.5 hover:bg-muted rounded shrink-0"
            >
              {isCollapsed ? (
                <CaretRightIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
              ) : (
                <CaretDownIcon className="h-4 w-4 text-muted-foreground" weight="bold" />
              )}
            </button>
            <input
              ref={(el) => { inputRefs.current[item.id] = el }}
              type="text"
              value={item.text || ''}
              onChange={(e) => onUpdateTitle(item.id, e.target.value)}
              onKeyDown={(e) => handleTitleKeyDown(item, e)}
              onFocus={() => onSelectTitle(item.id)}
              placeholder="Type a title..."
              className="flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
            />
          </div>
        </SortableItem>
        {!isCollapsed && groupTodos.length > 0 && (
          <div className="pb-2">
            {groupTodos.map((todoItem) =>
              renderGroupedTodo(todoItem as Todo)
            )}
          </div>
        )}
      </div>
    )
  }, [collapsedTitles, isFirstTitle, getTodosForTitle, onSelectTitle, toggleTitleCollapse, onUpdateTitle, handleTitleKeyDown, renderGroupedTodo])

  // Render a single item based on its type
  const renderPositionItem = useCallback((renderItem: RenderItem) => {
    // Skip non-item types (shouldn't occur in position mode)
    if (renderItem.type !== 'item') return null

    const item = renderItem.item

    if (isSeparator(item)) {
      return renderSeparator(item)
    }

    if (isTodo(item)) {
      // Skip if this todo belongs to a title group (rendered with the title)
      if (renderItem.parentTitleId) return null
      return renderStandaloneTodo(item as Todo)
    }

    if (isTitle(item)) {
      return renderTitleGroup(item)
    }

    return null
  }, [renderSeparator, renderStandaloneTodo, renderTitleGroup])

  // Content for position-based view (non-grouped)
  const positionContent = (
    <div className="space-y-0">
      {allItems.map((renderItem) => renderPositionItem(renderItem))}
    </div>
  )

  // In due date mode, use DndContext without SortableContext
  // (DraggableItem uses useDraggable, not useSortable)
  // In normal mode, use SortableContext for sortable behavior
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {groupByDueDate ? (
        dueDateContent
      ) : (
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {positionContent}
        </SortableContext>
      )}
    </DndContext>
  )
}
