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
