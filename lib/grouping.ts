/**
 * Centralized Grouping Engine
 *
 * Single source of truth for grouping items across all views.
 */

import { useMemo } from "react"
import type { Item } from "./types"
import { isTodo, isSeparator, sortItemsByPosition } from "./types"
import {
  getDueDateCategory,
  DUE_DATE_GROUP_ORDER,
  DUE_DATE_LABELS,
  type DueDateCategory
} from "./format"

// ============================================
// Types
// ============================================

export type GroupBy = "position" | "dueDate" | "priority" | "category" | "status" | "project"

export interface ItemGroup {
  key: string
  label: string
  items: Item[]
  /** Original items count */
  totalCount?: number
  /** Group metadata for styling/behavior */
  metadata?: {
    color?: string
    isCollapsible?: boolean
    showEmpty?: boolean
  }
}

export interface GroupingOptions {
  /** Filter out completed items */
  hideCompleted?: boolean
  /** Set of collapsed group keys */
  collapsedGroups?: Set<string>
  /** For position grouping: set of collapsed title IDs (deprecated but kept for compat) */
  collapsedTitles?: Set<string>
}

// ============================================
// Priority/Status Config
// ============================================

const PRIORITY_ORDER = ["high", "medium", "low", "none"] as const
const PRIORITY_LABELS: Record<string, string> = {
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority",
  none: "No Priority",
}
const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
  none: "#6b7280",
}

const STATUS_ORDER = ["due", "in-progress", "done"] as const
const STATUS_LABELS: Record<string, string> = {
  due: "To Do",
  "in-progress": "In Progress",
  done: "Done",
}

// ============================================
// Grouping Functions
// ============================================

/**
 * Group items by position (default list view)
 * Now returns a single flat group (hierarchy handled by render indentation)
 */
function groupByPosition(items: Item[], options: GroupingOptions): ItemGroup[] {
  const sorted = sortItemsByPosition(items)
  const { hideCompleted } = options

  const filtered = hideCompleted
    ? sorted.filter(item => !(isTodo(item) && item.completed))
    : sorted

  // Return single group
  return [{
    key: "all",
    label: "",
    items: filtered,
    totalCount: filtered.length,
    metadata: { isCollapsible: false }
  }]
}

/**
 * Group items by due date category
 */
function groupByDueDate(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  const todos = items.filter(isTodo)
  const filtered = hideCompleted
    ? todos.filter(item => !item.completed)
    : todos

  const groupMap: Record<DueDateCategory, Item[]> = {
    "now": [],
    "overdue": [],
    "today": [],
    "tomorrow": [],
    "this-week": [],
    "later": [],
    "no-date": [],
  }

  for (const todo of filtered) {
    const category = getDueDateCategory(todo.dueDate, todo.isNow)
    groupMap[category].push(todo)
  }

  const alwaysShow: DueDateCategory[] = ["now", "today", "tomorrow"]

  return DUE_DATE_GROUP_ORDER
    .filter(category => groupMap[category].length > 0 || alwaysShow.includes(category))
    .map(category => {
      const isCollapsed = collapsedGroups?.has(category) ?? false
      return {
        key: category,
        label: DUE_DATE_LABELS[category],
        items: isCollapsed ? [] : groupMap[category],
        totalCount: groupMap[category].length,
        metadata: {
          isCollapsible: true,
          showEmpty: alwaysShow.includes(category)
        }
      }
    })
}

/**
 * Group items by priority
 */
function groupByPriority(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  const todos = items.filter(isTodo)
  const filtered = hideCompleted
    ? todos.filter(item => !item.completed)
    : todos

  const groupMap: Record<string, Item[]> = { high: [], medium: [], low: [], none: [] }

  for (const todo of filtered) {
    const priority = todo.priority || "none"
    groupMap[priority].push(todo)
  }

  return PRIORITY_ORDER.map(priority => {
    const isCollapsed = collapsedGroups?.has(priority) ?? false
    return {
      key: priority,
      label: PRIORITY_LABELS[priority],
      items: isCollapsed ? [] : groupMap[priority],
      totalCount: groupMap[priority].length,
      metadata: {
        color: PRIORITY_COLORS[priority],
        isCollapsible: true
      }
    }
  })
}

/**
 * Group items by status
 */
function groupByStatus(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  const todos = items.filter(isTodo)
  const filtered = hideCompleted
    ? todos.filter(item => !item.completed)
    : todos

  const groupMap: Record<string, Item[]> = { "due": [], "in-progress": [], "done": [] }

  for (const todo of filtered) {
    let status = todo.status
    if (!status) status = todo.completed ? "done" : "due"
    groupMap[status].push(todo)
  }

  return STATUS_ORDER.map(status => {
    const isCollapsed = collapsedGroups?.has(status) ?? false
    return {
      key: status,
      label: STATUS_LABELS[status],
      items: isCollapsed ? [] : groupMap[status],
      totalCount: groupMap[status].length,
      metadata: { isCollapsible: true }
    }
  })
}

/**
 * Group items by category
 */
function groupByCategory(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  const todos = items.filter(isTodo)
  const filtered = hideCompleted
    ? todos.filter(item => !item.completed)
    : todos

  const categorySet = new Set<string>()
  for (const todo of filtered) {
    if (todo.category) categorySet.add(todo.category)
  }
  const categories = Array.from(categorySet).sort()

  const groupMap: Record<string, Item[]> = {}
  for (const cat of categories) groupMap[cat] = []
  groupMap["uncategorized"] = []

  for (const todo of filtered) {
    const cat = todo.category || "uncategorized"
    if (!groupMap[cat]) groupMap[cat] = []
    groupMap[cat].push(todo)
  }

  const groups: ItemGroup[] = categories.map(cat => {
    const isCollapsed = collapsedGroups?.has(cat) ?? false
    return {
      key: cat,
      label: cat,
      items: isCollapsed ? [] : groupMap[cat],
      totalCount: groupMap[cat].length,
      metadata: { isCollapsible: true }
    }
  })

  if (groupMap["uncategorized"].length > 0) {
    const isCollapsed = collapsedGroups?.has("uncategorized") ?? false
    groups.push({
      key: "uncategorized",
      label: "Uncategorized",
      items: isCollapsed ? [] : groupMap["uncategorized"],
      totalCount: groupMap["uncategorized"].length,
      metadata: { isCollapsible: true }
    })
  }

  return groups
}

/**
 * Group items by Root Project (Indent 0 items)
 */
function groupByProject(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options
  const sorted = sortItemsByPosition(items) // Ensure order

  // Strategy: Find root items (indent 0). All subsequent items until next root item belong to it.
  const groups: ItemGroup[] = []

  let currentRoot: Item | null = null
  let currentItems: Item[] = []

  const flush = () => {
    if (currentRoot) {
      const isCollapsed = collapsedGroups?.has(currentRoot.id) ?? false
      groups.push({
        key: currentRoot.id,
        label: currentRoot.title || "Untitled Project",
        items: isCollapsed ? [] : currentItems,
        totalCount: currentItems.length,
        metadata: { isCollapsible: true }
      })
    } else if (currentItems.length > 0) {
      // Orphaned items at start? Or simply non-indented items that are just tasks?
      // User says: level 0 is just a task. But if grouping by project, implies task is a project.
      // We will treat Level 0 tasks as the "Project" headers for this view.
    }
  }

  for (const item of sorted) {
    if (!isTodo(item)) continue;

    if ((item.indent || 0) === 0) {
      // New root found
      flush()
      currentRoot = item
      currentItems = [item] // Include the root item itself? Usually Kanban doesn't show the column header as card.
      // If we want Kanban columns to be "Projects", the column is the project. Cards are children.
      // So we reset currentItems to [] if we don't want root item in the column.
      currentItems = []
    } else {
      // Child item
      if (currentRoot) {
        if (!hideCompleted || !item.completed) {
          currentItems.push(item)
        }
      }
    }
  }
  flush()

  return groups
}

/**
 * Main Grouping Function
 */
export function groupItems(
  items: Item[],
  groupBy: GroupBy,
  options: GroupingOptions = {}
): ItemGroup[] {
  const activeItems = items.filter(item => !(isTodo(item) && item.status === "archived"))

  switch (groupBy) {
    case "position": return groupByPosition(activeItems, options)
    case "dueDate": return groupByDueDate(activeItems, options)
    case "priority": return groupByPriority(activeItems, options)
    case "status": return groupByStatus(activeItems, options)
    case "category": return groupByCategory(activeItems, options)
    case "project": return groupByProject(activeItems, options) // Logic updated to root tasks
    default: return groupByPosition(activeItems, options)
  }
}

export function useGroupedItems(
  items: Item[],
  groupBy: GroupBy,
  options: GroupingOptions = {}
): ItemGroup[] {
  return useMemo(
    () => groupItems(items, groupBy, options),
    [items, groupBy, options.hideCompleted, options.collapsedGroups, options.collapsedTitles]
  )
}

export function getItemIdsFromGroups(groups: ItemGroup[]): string[] {
  const ids: string[] = []
  for (const group of groups) {
    for (const item of group.items) {
      ids.push(item.id)
    }
  }
  return ids
}
