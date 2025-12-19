/**
 * Focus Manager
 *
 * Manages refs for programmatic focus (arrow key navigation).
 * Focus for new items is handled via store.pendingFocusId where
 * new components check on mount if they should focus themselves.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"

// ============================================
// Types
// ============================================

export interface FocusManager {
  /** Register an input ref for an item */
  registerRef: (id: string, ref: HTMLInputElement | null) => void
  /** Get ref for an item */
  getRef: (id: string) => HTMLInputElement | null
  /** Focus a specific item by ID */
  focus: (id: string) => void
  /** Focus previous item */
  focusPrev: (fromId: string) => void
  /** Focus next item */
  focusNext: (fromId: string) => void
  /** Get the previous focusable ID */
  getPrevId: (fromId: string) => string | null
  /** Get the next focusable ID */
  getNextId: (fromId: string) => string | null
}

export interface KeyboardActions {
  onEnter?: () => void
  onBackspaceEmpty?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onTab?: () => void
  onShiftTab?: () => void
  onAltTab?: () => void
  onEscape?: () => void
}

// ============================================
// Hook Implementation
// ============================================

export function useFocusManager(itemIds: string[]): FocusManager {
  // Refs for input elements
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Keep itemIds in a ref for stable access
  const itemIdsRef = useRef(itemIds)
  itemIdsRef.current = itemIds

  // Build ID-to-index map
  const idIndexMap = useRef(new Map<string, number>())
  useEffect(() => {
    const map = new Map<string, number>()
    itemIds.forEach((id, idx) => map.set(id, idx))
    idIndexMap.current = map
  }, [itemIds])

  // Register a ref
  const registerRef = useCallback((id: string, ref: HTMLInputElement | null) => {
    if (ref) {
      inputRefs.current.set(id, ref)
    } else {
      inputRefs.current.delete(id)
    }
  }, [])

  // Get a ref
  const getRef = useCallback((id: string) => {
    return inputRefs.current.get(id) ?? null
  }, [])

  // Focus a specific item
  const focus = useCallback((id: string) => {
    const ref = inputRefs.current.get(id)
    if (ref) {
      ref.focus()
    }
  }, [])

  // Get previous ID
  const getPrevId = useCallback((fromId: string): string | null => {
    const index = idIndexMap.current.get(fromId)
    if (index === undefined || index <= 0) return null
    return itemIdsRef.current[index - 1] ?? null
  }, [])

  // Get next ID
  const getNextId = useCallback((fromId: string): string | null => {
    const index = idIndexMap.current.get(fromId)
    if (index === undefined || index >= itemIdsRef.current.length - 1) return null
    return itemIdsRef.current[index + 1] ?? null
  }, [])

  // Focus previous
  const focusPrev = useCallback((fromId: string) => {
    const prevId = getPrevId(fromId)
    if (prevId) focus(prevId)
  }, [getPrevId, focus])

  // Focus next
  const focusNext = useCallback((fromId: string) => {
    const nextId = getNextId(fromId)
    if (nextId) focus(nextId)
  }, [getNextId, focus])

  // Clean up stale refs
  useEffect(() => {
    const validIds = new Set(itemIds)
    for (const id of inputRefs.current.keys()) {
      if (!validIds.has(id)) {
        inputRefs.current.delete(id)
      }
    }
  }, [itemIds])

  return useMemo(() => ({
    registerRef,
    getRef,
    focus,
    focusPrev,
    focusNext,
    getPrevId,
    getNextId,
  }), [registerRef, getRef, focus, focusPrev, focusNext, getPrevId, getNextId])
}
