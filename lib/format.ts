/**
 * Format a due date string into a human-readable format.
 * Returns "Today", "Tomorrow", or a short date like "Jan 15"
 */
export function formatDueDate(dateString: string): string {
  const date = new Date(dateString)

  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return dateString
  }

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.toDateString() === today.toDateString()) {
    return "Today"
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return "Tomorrow"
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }
}

// ============================================
// Due Date Categories
// ============================================

export type DueDateCategory = "now" | "overdue" | "today" | "tomorrow" | "this-week" | "later" | "no-date"

export const DUE_DATE_GROUP_ORDER: DueDateCategory[] = [
  "now",
  "overdue",
  "today",
  "tomorrow",
  "this-week",
  "later",
  "no-date"
]

export const DUE_DATE_LABELS: Record<DueDateCategory, string> = {
  "now": "Now",
  "overdue": "Overdue",
  "today": "Today",
  "tomorrow": "Tomorrow",
  "this-week": "This Week",
  "later": "Later",
  "no-date": "No Due Date",
}

export const DUE_DATE_COLORS: Record<DueDateCategory, string> = {
  "now": "hsl(var(--primary))",
  "overdue": "#ef4444",
  "today": "#f59e0b",
  "tomorrow": "#84cc16",
  "this-week": "#06b6d4",
  "later": "#8b5cf6",
  "no-date": "#6b7280",
}

// ============================================
// Date Utilities
// ============================================

/**
 * Format a Date object as YYYY-MM-DD in local timezone (not UTC)
 * This avoids timezone conversion issues when storing dates
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Determine the due date category for a given date string
 * Note: "now" is determined by isNow flag, not by this function
 */
export function getDueDateCategory(dueDate: string | undefined, isNow?: boolean): DueDateCategory {
  if (isNow) return "now"
  if (!dueDate) return "no-date"

  // Parse date string as local date (YYYY-MM-DD format)
  // This avoids timezone issues when parsing ISO date strings
  const parts = dueDate.split('-')
  if (parts.length !== 3) return "no-date"

  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1 // JS months are 0-indexed
  const day = parseInt(parts[2], 10)
  const date = new Date(year, month, day)

  if (isNaN(date.getTime())) return "no-date"

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))

  if (date < today) return "overdue"
  if (date.getTime() === today.getTime()) return "today"
  if (date.getTime() === tomorrow.getTime()) return "tomorrow"
  if (date <= endOfWeek) return "this-week"
  return "later"
}

/**
 * Get a representative date string for a due date category
 * Used when dragging items into a category group
 */
export function getDateForCategory(category: DueDateCategory): string | undefined {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (category) {
    case "now":
    case "today":
      return formatDateLocal(today)
    case "overdue":
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return formatDateLocal(yesterday)
    case "tomorrow":
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return formatDateLocal(tomorrow)
    case "this-week":
      const endOfWeek = new Date(today)
      endOfWeek.setDate(today.getDate() + (6 - today.getDay()))
      return formatDateLocal(endOfWeek)
    case "later":
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)
      return formatDateLocal(nextWeek)
    case "no-date":
      return undefined
  }
}
