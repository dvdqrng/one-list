/**
 * Type-safe Electron IPC API
 *
 * This file provides TypeScript definitions for the Electron IPC bridge,
 * eliminating `any` types and providing autocomplete support.
 */

import type { Item, Todo, ProposedChange } from "./types"

// ============================================
// API Type Definitions
// ============================================

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface ElectronAPI {
  // Items API
  getItems: () => Promise<Item[]>
  createItem: (item: Item) => Promise<Item>
  createItems: (items: Item[]) => Promise<Item[]>
  updateItem: (id: string, updates: Partial<Item>) => Promise<void>
  updateItemPositions: (updates: { id: string; position: number }[]) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  toggleItem: (id: string) => Promise<Item | null>
  getMaxPosition: () => Promise<number>

  // AI Processing
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<string>
  processTodoText: (input: string, existingTodos: Todo[]) => Promise<ProposedChange[]>
  findSimilarTasks: (todos: Todo[]) => Promise<ProposedChange[]>

  // Auto-updates
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void

  // Focus Timer
  startFocusTimer: (duration?: number) => Promise<{ success: boolean; timeRemaining: number }>
  pauseFocusTimer: () => Promise<{ success: boolean; timeRemaining: number }>
  resumeFocusTimer: () => Promise<{ success: boolean; timeRemaining: number }>
  resetFocusTimer: () => Promise<{ success: boolean; timeRemaining: number }>
  getFocusState: () => Promise<{ isRunning: boolean; timeRemaining: number }>
  onFocusTimerTick: (callback: (timeRemaining: number) => void) => void
  onFocusTimerComplete: (callback: () => void) => void
  removeFocusTimerListeners: () => void
}

// ============================================
// Global type declaration
// ============================================

declare global {
  interface Window {
    electronDB?: ElectronAPI
  }
}

// ============================================
// Type-safe API accessor
// ============================================

/**
 * Check if running in Electron environment
 */
export const isElectron = typeof window !== "undefined" && window.electronDB !== undefined

/**
 * Get the Electron API (throws if not in Electron)
 */
export function getElectronAPI(): ElectronAPI {
  if (!isElectron) {
    throw new Error("Not running in Electron environment")
  }
  return window.electronDB!
}

/**
 * Get the Electron API or undefined if not available
 */
export function getElectronAPIOrNull(): ElectronAPI | undefined {
  return isElectron ? window.electronDB : undefined
}
