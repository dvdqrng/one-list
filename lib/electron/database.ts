import type { Item } from "@/lib/types"
import { isElectron, getElectronAPIOrNull } from "@/lib/electron-api"

// Re-export isElectron for backwards compatibility
export { isElectron }

// ============================================
// In-memory fallback for web mode
// ============================================

class WebDatabase {
  private items: Item[] = []

  async getItems(): Promise<Item[]> {
    return [...this.items].sort((a, b) => a.position - b.position)
  }

  async createItem(item: Item): Promise<Item> {
    this.items.push(item)
    return item
  }

  async createItems(items: Item[]): Promise<Item[]> {
    this.items.push(...items)
    return items
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const index = this.items.findIndex((i) => i.id === id)
    if (index !== -1) {
      this.items[index] = { ...this.items[index], ...updates, updatedAt: new Date().toISOString() }
    }
  }

  async updateItemPositions(positionUpdates: { id: string; position: number }[]): Promise<void> {
    const now = new Date().toISOString()
    for (const { id, position } of positionUpdates) {
      const index = this.items.findIndex((i) => i.id === id)
      if (index !== -1) {
        this.items[index] = { ...this.items[index], position, updatedAt: now }
      }
    }
  }

  async deleteItem(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id)
  }

  async toggleItem(id: string): Promise<Item | null> {
    const index = this.items.findIndex((i) => i.id === id)
    if (index !== -1) {
      this.items[index] = {
        ...this.items[index],
        completed: !this.items[index].completed,
        updatedAt: new Date().toISOString()
      }
      return this.items[index]
    }
    return null
  }

  async getMaxPosition(): Promise<number> {
    if (this.items.length === 0) return -1
    return Math.max(...this.items.map(i => i.position))
  }
}

// Create database instance
const webDB = typeof window !== "undefined" ? new WebDatabase() : null

// ============================================
// Items API (type-safe)
// ============================================

export const itemsDB = {
  getItems: async (): Promise<Item[]> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.getItems()
    }
    return webDB?.getItems() || []
  },

  createItem: async (item: Item): Promise<Item> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.createItem(item)
    }
    return webDB?.createItem(item) || item
  },

  createItems: async (items: Item[]): Promise<Item[]> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.createItems(items)
    }
    return webDB?.createItems(items) || items
  },

  updateItem: async (id: string, updates: Partial<Item>): Promise<void> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.updateItem(id, updates)
    }
    return webDB?.updateItem(id, updates)
  },

  updateItemPositions: async (positionUpdates: { id: string; position: number }[]): Promise<void> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.updateItemPositions(positionUpdates)
    }
    return webDB?.updateItemPositions(positionUpdates)
  },

  deleteItem: async (id: string): Promise<void> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.deleteItem(id)
    }
    return webDB?.deleteItem(id)
  },

  toggleItem: async (id: string): Promise<Item | null> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.toggleItem(id)
    }
    return webDB?.toggleItem(id) || null
  },

  getMaxPosition: async (): Promise<number> => {
    const api = getElectronAPIOrNull()
    if (api) {
      return api.getMaxPosition()
    }
    return webDB?.getMaxPosition() ?? -1
  },
}
