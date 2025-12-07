/**
 * Ultra-simple Focus Target Registry
 *
 * Problem: When creating a new item, React re-renders and the new input
 * needs to focus. But the ref doesn't exist when we call focus.
 *
 * Solution: Store the target ID. New inputs check on mount if they're the target.
 * If yes, focus themselves and clear the target.
 *
 * This is a singleton - no React state, no hooks, just a simple mutable value.
 */

let focusTargetId: string | null = null

export function setFocusTarget(id: string | null) {
  focusTargetId = id
}

export function getFocusTarget(): string | null {
  return focusTargetId
}

export function clearFocusTarget() {
  focusTargetId = null
}

/**
 * Check if this id is the focus target, and if so, clear it and return true.
 * Call this in useEffect on mount to know if you should focus.
 */
export function claimFocusTarget(id: string): boolean {
  if (focusTargetId === id) {
    focusTargetId = null
    return true
  }
  return false
}
