/**
 * Zustand Store - Central state management for the todo app
 *
 * This store provides:
 * - Single source of truth for all items
 * - Type-safe actions
 * - Optimistic updates with database persistence
 * - Derived state via selectors
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useMemo } from "react"
import { itemsDB } from "@/lib/electron/database"
import type { Item, Todo, Title, ChangelogSession, ProposedChange, ViewMode, KanbanGroupBy, ListGroupBy } from "@/lib/types"
import { sortItemsByPosition, isTodo, isTitle, isSeparator, itemToTodo, itemToTitle } from "@/lib/types"

// ============================================
// Store Types
// ============================================

interface AppState {
  // Core state
  items: Item[]
  isLoading: boolean
  error: string | null

  // Selection (keep flat for backwards compatibility)
  selectedTodoId: string | null
  selectedTitleId: string | null

  // UI state
  showMetadata: boolean
  showCompleted: boolean
  listGroupBy: ListGroupBy
  viewMode: ViewMode
  kanbanGroupBy: KanbanGroupBy

  // Focus session state
  isFocusMode: boolean
  focusTimeRemaining: number
  focusTimerRunning: boolean
  distractionNotes: string
  previousTheme: string | null

  // Changelog/AI state
  changelogSession: ChangelogSession | null
  showChangelog: boolean
}

interface AppActions {
  // Data loading
  loadItems: () => Promise<void>

  // Item CRUD
  addItem: (item: Item) => Promise<void>
  updateItem: (id: string, updates: Partial<Item>) => void
  updateItemDebounced: (id: string, updates: Partial<Item>) => void
  deleteItem: (id: string) => Promise<void>
  toggleItem: (id: string) => Promise<void>

  // Batch operations
  addItems: (items: Item[]) => Promise<void>
  reorderItems: (items: Item[]) => Promise<void>

  // Selection
  selectTodo: (id: string | null) => void
  selectTitle: (id: string | null) => void

  // UI toggles
  setShowMetadata: (show: boolean) => void
  setShowCompleted: (show: boolean) => void
  setListGroupBy: (groupBy: ListGroupBy) => void
  setViewMode: (mode: ViewMode) => void
  setKanbanGroupBy: (groupBy: KanbanGroupBy) => void

  // Changelog
  setChangelogSession: (session: ChangelogSession | null) => void
  setShowChangelog: (show: boolean) => void
  applyChanges: (changes: ProposedChange[]) => Promise<void>

  // Focus Mode
  setFocusMode: (active: boolean) => void
  setFocusTimeRemaining: (seconds: number) => void
  setFocusTimerRunning: (running: boolean) => void
  setDistractionNotes: (notes: string) => void
  setPreviousTheme: (theme: string | null) => void
  toggleNow: (id: string) => void
  clearNowItems: () => void

  // Utility
  getNextPosition: () => number
  insertItemAfter: (afterId: string | null, type: "todo" | "title" | "separator", initialData?: Partial<Item>) => string
  moveToProject: (todoId: string, projectId: string | null) => Promise<void>
}

// ============================================
// Private state (not exposed in store)
// ============================================

const pendingWrites: Record<string, NodeJS.Timeout> = {}

// ============================================
// Store Creation
// ============================================

export const useStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      // Initial state
      items: [],
      isLoading: true,
      error: null,

      // Selection
      selectedTodoId: null,
      selectedTitleId: null,

      // UI state
      showMetadata: false,
      showCompleted: true,
      listGroupBy: "position",
      viewMode: "list",
      kanbanGroupBy: "dueDate",

      // Focus session
      isFocusMode: false,
      focusTimeRemaining: 1500,
      focusTimerRunning: false,
      distractionNotes: "",
      previousTheme: null,

      // Changelog
      changelogSession: null,
      showChangelog: false,

      // ============================================
      // Data Loading
      // ============================================

      loadItems: async () => {
        set({ isLoading: true, error: null })
        try {
          const items = await itemsDB.getItems()
          set({ items, isLoading: false })
        } catch (error) {
          console.error("Failed to load items:", error)
          set({ error: "Failed to load items", isLoading: false })
        }
      },

      // ============================================
      // Item CRUD
      // ============================================

      addItem: async (item: Item) => {
        set((state) => ({ items: [...state.items, item] }))
        try {
          await itemsDB.createItem(item)
        } catch (error) {
          console.error("Failed to create item:", error)
          set((state) => ({ items: state.items.filter((i) => i.id !== item.id) }))
        }
      },

      addItems: async (items: Item[]) => {
        set((state) => ({ items: [...state.items, ...items] }))
        try {
          await itemsDB.createItems(items)
        } catch (error) {
          console.error("Failed to create items:", error)
          const ids = new Set(items.map((i) => i.id))
          set((state) => ({ items: state.items.filter((i) => !ids.has(i.id)) }))
        }
      },

      updateItem: (id: string, updates: Partial<Item>) => {
        const previousItem = get().items.find((i) => i.id === id)
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i
          ),
        }))
        itemsDB.updateItem(id, updates).catch((error) => {
          console.error("Failed to update item:", error)
          if (previousItem) {
            set((state) => ({
              items: state.items.map((i) => (i.id === id ? previousItem : i)),
            }))
          }
        })
      },

      updateItemDebounced: (id: string, updates: Partial<Item>) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i
          ),
        }))
        if (pendingWrites[id]) {
          clearTimeout(pendingWrites[id])
        }
        pendingWrites[id] = setTimeout(async () => {
          try {
            await itemsDB.updateItem(id, updates)
          } catch (error) {
            console.error("Failed to update item:", error)
          }
          delete pendingWrites[id]
        }, 300)
      },

      deleteItem: async (id: string) => {
        const item = get().items.find((i) => i.id === id)
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }))

        // Clear selection if deleted
        const { selectedTodoId, selectedTitleId } = get()
        if (selectedTodoId === id) set({ selectedTodoId: null })
        if (selectedTitleId === id) set({ selectedTitleId: null })

        try {
          await itemsDB.deleteItem(id)
        } catch (error) {
          console.error("Failed to delete item:", error)
          if (item) {
            set((state) => ({ items: [...state.items, item] }))
          }
        }
      },

      toggleItem: async (id: string) => {
        const item = get().items.find((i) => i.id === id)
        if (!item || !isTodo(item)) return

        const newCompleted = !item.completed
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, completed: newCompleted, updatedAt: new Date().toISOString() } : i
          ),
        }))

        try {
          await itemsDB.toggleItem(id)
        } catch (error) {
          console.error("Failed to toggle item:", error)
          set((state) => ({
            items: state.items.map((i) =>
              i.id === id ? { ...i, completed: !newCompleted } : i
            ),
          }))
        }
      },

      reorderItems: async (items: Item[]) => {
        const updatedItems = items.map((item, idx) => ({
          ...item,
          position: idx,
        }))
        set({ items: updatedItems })

        const positionUpdates = updatedItems.map((item) => ({
          id: item.id,
          position: item.position,
        }))

        try {
          await itemsDB.updateItemPositions(positionUpdates)
        } catch (error) {
          console.error("Failed to update positions:", error)
          get().loadItems()
        }
      },

      // ============================================
      // Selection
      // ============================================

      selectTodo: (id: string | null) => {
        set((state) => ({
          selectedTodoId: state.selectedTodoId === id ? null : id,
          selectedTitleId: null,
        }))
      },

      selectTitle: (id: string | null) => {
        set({ selectedTitleId: id, selectedTodoId: null })
      },

      // ============================================
      // UI Toggles
      // ============================================

      setShowMetadata: (show: boolean) => set({ showMetadata: show }),
      setShowCompleted: (show: boolean) => set({ showCompleted: show }),
      setListGroupBy: (groupBy: ListGroupBy) => set({ listGroupBy: groupBy }),
      setViewMode: (mode: ViewMode) => set({ viewMode: mode }),
      setKanbanGroupBy: (groupBy: KanbanGroupBy) => set({ kanbanGroupBy: groupBy }),

      // ============================================
      // Changelog
      // ============================================

      setChangelogSession: (session: ChangelogSession | null) => set({ changelogSession: session }),
      setShowChangelog: (show: boolean) => set({ showChangelog: show }),

      applyChanges: async (changes: ProposedChange[]) => {
        const { addItem, updateItem, deleteItem, getNextPosition } = get()

        for (const change of changes) {
          switch (change.type) {
            case "add":
              if (change.newTodo) {
                const newItem: Item = {
                  id: change.newTodo.id,
                  type: "todo",
                  position: getNextPosition(),
                  title: change.newTodo.title,
                  details: change.newTodo.details,
                  completed: change.newTodo.completed,
                  priority: change.newTodo.priority,
                  dueDate: change.newTodo.dueDate,
                  category: change.newTodo.category,
                  createdAt: change.newTodo.createdAt,
                }
                await addItem(newItem)
              }
              break

            case "update":
            case "complete":
            case "uncomplete":
              if (change.existingTodo && change.updates) {
                updateItem(change.existingTodo.id, change.updates as Partial<Item>)
              }
              break

            case "delete":
              if (change.deleteTodo) {
                await deleteItem(change.deleteTodo.id)
              }
              break

            case "merge":
              if (change.mergeGroup) {
                for (const source of change.mergeGroup.sourceTodos) {
                  await deleteItem(source.id)
                }
                const merged = change.mergeGroup.mergedResult
                const mergedItem: Item = {
                  id: merged.id,
                  type: "todo",
                  position: getNextPosition(),
                  title: merged.title,
                  details: merged.details,
                  completed: merged.completed,
                  priority: merged.priority,
                  dueDate: merged.dueDate,
                  category: merged.category,
                  createdAt: merged.createdAt,
                }
                await addItem(mergedItem)
              }
              break
          }
        }

        set({ changelogSession: null, showChangelog: false })
      },

      // ============================================
      // Focus Mode
      // ============================================

      setFocusMode: (active: boolean) => set({ isFocusMode: active }),
      setFocusTimeRemaining: (seconds: number) => set({ focusTimeRemaining: seconds }),
      setFocusTimerRunning: (running: boolean) => set({ focusTimerRunning: running }),
      setDistractionNotes: (notes: string) => set({ distractionNotes: notes }),
      setPreviousTheme: (theme: string | null) => set({ previousTheme: theme }),

      toggleNow: (id: string) => {
        const { items, updateItem } = get()
        const item = items.find((i) => i.id === id)
        if (!item || !isTodo(item)) return
        updateItem(id, { isNow: !item.isNow })
      },

      clearNowItems: () => {
        const { items, updateItem } = get()
        items
          .filter((i) => isTodo(i) && i.isNow)
          .forEach((item) => updateItem(item.id, { isNow: false }))
      },

      // ============================================
      // Utility
      // ============================================

      getNextPosition: () => {
        const { items } = get()
        if (items.length === 0) return 0
        return Math.max(...items.map((i) => i.position)) + 1
      },

      insertItemAfter: (afterId: string | null, type: "todo" | "title" | "separator", initialData?: Partial<Item>) => {
        const { items, addItem } = get()
        const id = crypto.randomUUID()
        const now = new Date().toISOString()

        let position: number
        let parentId: string | undefined

        if (afterId === null) {
          position = 0
          const updatedItems = items.map((item) => ({
            ...item,
            position: item.position + 1,
          }))
          set({ items: updatedItems })
          itemsDB.updateItemPositions(updatedItems.map((i) => ({ id: i.id, position: i.position })))
        } else {
          const afterItem = items.find((i) => i.id === afterId)
          if (afterItem) {
            position = afterItem.position + 1
            if (isTodo(afterItem)) {
              parentId = afterItem.parentId
            }
            const updatedItems = items.map((item) =>
              item.position >= position ? { ...item, position: item.position + 1 } : item
            )
            set({ items: updatedItems })
            itemsDB.updateItemPositions(
              updatedItems
                .filter((i) => i.position >= position)
                .map((i) => ({ id: i.id, position: i.position }))
            )
          } else {
            position = get().getNextPosition()
          }
        }

        const newItem: Item = {
          id,
          type,
          position,
          parentId,
          createdAt: now,
          ...(type === "todo" ? { completed: false, title: "" } : {}),
          ...(type === "title" ? { text: "" } : {}),
          ...initialData,
        }

        addItem(newItem)
        return id
      },

      moveToProject: async (todoId: string, projectId: string | null) => {
        const { items, updateItem, reorderItems } = get()
        const todo = items.find((i) => i.id === todoId)
        if (!todo || !isTodo(todo)) return

        updateItem(todoId, { parentId: projectId || undefined })

        if (projectId) {
          const project = items.find((i) => i.id === projectId)
          if (project) {
            const sorted = sortItemsByPosition(items)
            const projectIndex = sorted.findIndex((i) => i.id === projectId)

            let insertIndex = projectIndex + 1
            for (let i = projectIndex + 1; i < sorted.length; i++) {
              const item = sorted[i]
              if (isTitle(item) || isSeparator(item)) break
              if (isTodo(item) && item.parentId === projectId) {
                insertIndex = i + 1
              }
            }

            const withoutTodo = sorted.filter((i) => i.id !== todoId)
            withoutTodo.splice(
              insertIndex > sorted.findIndex((i) => i.id === todoId) ? insertIndex - 1 : insertIndex,
              0,
              { ...todo, parentId: projectId }
            )

            await reorderItems(withoutTodo)
          }
        }
      },
    }),
    {
      name: "todo-app-ui-preferences",
      partialize: (state) => ({
        viewMode: state.viewMode,
        kanbanGroupBy: state.kanbanGroupBy,
        showMetadata: state.showMetadata,
        showCompleted: state.showCompleted,
        listGroupBy: state.listGroupBy,
      }),
    }
  )
)

// ============================================
// Hook helpers
// ============================================

export function useTodos(): Todo[] {
  const items = useStore((state) => state.items)
  return useMemo(() => {
    return items
      .filter(isTodo)
      .map((item) => itemToTodo(item, items))
      .filter((t): t is Todo => t !== null)
  }, [items])
}

export function useTitles(): Title[] {
  const items = useStore((state) => state.items)
  return useMemo(() => {
    return items
      .filter(isTitle)
      .map(itemToTitle)
      .filter((t): t is Title => t !== null)
  }, [items])
}

export function useSortedItems(): Item[] {
  const items = useStore((state) => state.items)
  return useMemo(() => sortItemsByPosition(items), [items])
}

export function useSelectedTodo(): Todo | undefined {
  const items = useStore((state) => state.items)
  const selectedTodoId = useStore((state) => state.selectedTodoId)
  return useMemo(() => {
    if (!selectedTodoId) return undefined
    const item = items.find((i) => i.id === selectedTodoId)
    return item ? itemToTodo(item, items) ?? undefined : undefined
  }, [items, selectedTodoId])
}

export function useSelectedTitle(): Title | undefined {
  const items = useStore((state) => state.items)
  const selectedTitleId = useStore((state) => state.selectedTitleId)
  return useMemo(() => {
    if (!selectedTitleId) return undefined
    const item = items.find((i) => i.id === selectedTitleId)
    return item ? itemToTitle(item) ?? undefined : undefined
  }, [items, selectedTitleId])
}

export function useCategories(): string[] {
  const items = useStore((state) => state.items)
  return useMemo(() => {
    const cats = items
      .filter(isTodo)
      .map((i) => i.category)
      .filter((c): c is string => !!c)
    return [...new Set(cats)].sort()
  }, [items])
}

export function useNowTodos(): Todo[] {
  const items = useStore((state) => state.items)
  return useMemo(() => {
    return items
      .filter((i) => isTodo(i) && i.isNow)
      .map((item) => itemToTodo(item, items))
      .filter((t): t is Todo => t !== null)
  }, [items])
}
