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
import type { Item, Todo, ChangelogSession, ProposedChange, ViewMode, KanbanGroupBy, ListGroupBy } from "@/lib/types"
import { sortItemsByPosition, isTodo, itemToTodo } from "@/lib/types"

// ============================================
// Store Types
// ============================================

interface AppState {
  // Core state
  items: Item[]
  isLoading: boolean
  error: string | null

  // Unified selection & focus
  activeItemId: string | null
  pendingFocusId: string | null

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
  archiveOldDoneTasks: () => Promise<void>

  // Batch operations
  addItems: (items: Item[]) => Promise<void>
  reorderItems: (items: Item[]) => Promise<void>

  // Unified selection & focus
  setActiveItem: (id: string | null) => void
  setActiveItemAndFocus: (id: string | null) => void
  setPendingFocus: (id: string | null) => void
  clearPendingFocus: (id: string) => boolean

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
  insertItemAfter: (afterId: string | null, initialData?: Partial<Item>) => string
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

      // Unified selection & focus
      activeItemId: null,
      pendingFocusId: null,

      // UI state
      showMetadata: false,
      showCompleted: true,
      listGroupBy: "project",
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

        // Clear active item if deleted
        if (get().activeItemId === id) set({ activeItemId: null })

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
        if (!item) return

        const newCompleted = !item.completed
        const now = new Date().toISOString()
        const updates: Partial<Item> = {
          completed: newCompleted,
          updatedAt: now,
          status: newCompleted ? "done" : "due",
          completedAt: newCompleted ? now : undefined,
        }

        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, ...updates } : i
          ),
        }))

        try {
          await itemsDB.updateItem(id, updates)
        } catch (error) {
          console.error("Failed to toggle item:", error)
          set((state) => ({
            items: state.items.map((i) =>
              i.id === id ? { ...i, completed: !newCompleted, status: !newCompleted ? "done" : "due", completedAt: !newCompleted ? item.completedAt : undefined } : i
            ),
          }))
        }
      },

      archiveOldDoneTasks: async () => {
        const { items, updateItem } = get()
        const now = new Date()
        const ARCHIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

        const itemsToArchive = items.filter((item) => {
          if (!isTodo(item) || !item.completed || !item.completedAt || item.status === "archived") {
            return false
          }
          const completedAt = new Date(item.completedAt)
          return now.getTime() - completedAt.getTime() > ARCHIVE_THRESHOLD_MS
        })

        if (itemsToArchive.length === 0) return

        for (const item of itemsToArchive) {
          updateItem(item.id, { status: "archived" })
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
      // Unified Selection & Focus
      // ============================================

      setActiveItem: (id: string | null) => {
        set({ activeItemId: id })
      },

      setActiveItemAndFocus: (id: string | null) => {
        set({ activeItemId: id, pendingFocusId: id })
      },

      setPendingFocus: (id: string | null) => {
        set({ pendingFocusId: id })
      },

      clearPendingFocus: (id: string): boolean => {
        if (get().pendingFocusId === id) {
          set({ pendingFocusId: null })
          return true
        }
        return false
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
                  indent: change.newTodo.indent || 0,
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
                  indent: 0,
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

      insertItemAfter: (afterId: string | null, initialData?: Partial<Item>) => {
        const { items, addItem, getNextPosition } = get()
        const id = crypto.randomUUID()
        const now = new Date().toISOString()

        let position: number
        let indent = 0

        if (afterId === null) {
          // If inserting at the very end or start without reference
          position = items.length > 0 ? getNextPosition() : 0
          const lastItem = sortItemsByPosition(items).pop()
          // Optionally reuse last item indent, but defaults to 0 suitable for "root"
          if (lastItem) indent = lastItem.indent || 0
        } else {
          // Insert after specific item
          const afterItem = items.find((i) => i.id === afterId)
          if (afterItem) {
            position = afterItem.position + 1
            indent = afterItem.indent || 0

            // Shift all subsequent items down
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
            position = getNextPosition()
          }
        }

        const newItem: Item = {
          id,
          type: "todo",
          position,
          indent,
          createdAt: now,
          title: "",
          completed: false,
          ...initialData,
        }

        addItem(newItem)
        return id
      },

      // Deprecated/Modified for hierarchy: Moves a task to be a child of another task
      // or "project" in the new sense.
      // For now, simple implementation updating parentId if we decide to use it,
      // but primarily rely on reorder + indent for now.
      moveToProject: async (todoId: string, projectId: string | null) => {
        // Implementation pending specific drag-to-make-child logic
        // For now, this is a placeholder or legacy cleaner
        console.warn("moveToProject called but logic is now hierarchy-based")
      },
    }),
    {
      name: "todo-app-ui-preferences",
      version: 2,
      migrate: (persistedState: any, version) => {
        if (!persistedState) return persistedState
        if (version < 2 && persistedState.listGroupBy === "position") {
          return { ...persistedState, listGroupBy: "project" }
        }
        return persistedState
      },
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
      .filter((item) => isTodo(item) && item.status !== "archived")
      .map((item) => itemToTodo(item))
      .filter((t): t is Todo => t !== null)
  }, [items])
}

// Replaced useActiveItem to just return Todo
export function useActiveItem(): Todo | undefined {
  const items = useStore((state) => state.items)
  const activeItemId = useStore((state) => state.activeItemId)
  return useMemo(() => {
    if (!activeItemId) return undefined
    const item = items.find((i) => i.id === activeItemId)
    if (!item || !isTodo(item)) return undefined
    return itemToTodo(item) ?? undefined
  }, [items, activeItemId])
}

// For compatibility if components import these
export function useSelectedTodo(): Todo | undefined {
  return useActiveItem()
}

export function useSelectedTitle(): any | undefined {
  // Deprecated
  return undefined
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
      .filter((i) => isTodo(i) && i.isNow && i.status !== "archived")
      .map((item) => itemToTodo(item))
      .filter((t): t is Todo => t !== null)
  }, [items])
}

export function useSortedItems(): Item[] {
  const items = useStore((state) => state.items)
  return useMemo(() => sortItemsByPosition(items), [items])
}
