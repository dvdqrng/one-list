import type { Priority } from "../types"

export const DEFAULT_PRIORITY: Priority = "low"
export const DEFAULT_CATEGORY = "uncategorized"

export function normalizePriority(priority?: Priority | null): Priority {
  return priority ?? DEFAULT_PRIORITY
}

export function normalizeCategory(category?: string | null): string {
  const trimmed = category?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CATEGORY
}
