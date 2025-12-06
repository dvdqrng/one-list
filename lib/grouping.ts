/**
 * Centralized Grouping Engine
 *
 * Single source of truth for grouping items across all views.
 * Both list and kanban views consume the same ItemGroup[] structure.
 */

import { useMemo } from "react"
import type { Item } from "./types"
import { isTodo, isTitle, isSeparator, sortItemsByPosition } from "./types"
import {
  getDueDateCategory,
  DUE_DATE_GROUP_ORDER,
  DUE_DATE_LABELS,
  type DueDateCategory
} from "./format"

// ============================================
// Types
// ============================================

export type GroupBy = "position" | "dueDate" | "priority" | "category" | "project" | "status"

export interface ItemGroup {
  key: string
  label: string
  items: Item[]
  /** Original items count (before filtering) - useful for showing counts when collapsed */
  totalCount?: number
  /** Group metadata for styling/behavior */
  metadata?: {
    color?: string
    isCollapsible?: boolean
    showEmpty?: boolean
    /** For position groups: the title item if this is a project group */
    titleItem?: Item
  }
}

export interface GroupingOptions {
  /** Filter out completed items */
  hideCompleted?: boolean
  /** Set of collapsed group keys */
  collapsedGroups?: Set<string>
  /** For position grouping: set of collapsed title IDs */
  collapsedTitles?: Set<string>
}

// ============================================
// Priority Config
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

// ============================================
// Status Config
// ============================================

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
 * Returns items in order, with title items creating sub-groups
 */
function groupByPosition(items: Item[], options: GroupingOptions): ItemGroup[] {
  const sorted = sortItemsByPosition(items)
  const { hideCompleted, collapsedTitles } = options

  // Filter completed if needed
  const filtered = hideCompleted
    ? sorted.filter(item => !(isTodo(item) && item.completed))
    : sorted

  // For position-based view, we return a single group with all items
  // The view component handles rendering titles/todos/separators differently
  // But we also create sub-groups for titles to support collapsing

  const groups: ItemGroup[] = []
  let currentGroup: ItemGroup | null = null
  let standaloneItems: Item[] = []

  for (const item of filtered) {
    if (isTitle(item)) {
      // Flush standalone items as "ungrouped" if any
      if (standaloneItems.length > 0) {
        groups.push({
          key: "ungrouped-" + groups.length,
          label: "",
          items: standaloneItems,
          metadata: { isCollapsible: false }
        })
        standaloneItems = []
      }

      // Start a new title group
      const isCollapsed = collapsedTitles?.has(item.id) ?? false
      currentGroup = {
        key: `title-${item.id}`,
        label: item.text || "",
        items: isCollapsed ? [] : [],
        totalCount: 0,
        metadata: {
          isCollapsible: true,
          titleItem: item
        }
      }
      // Always include the title itself so it renders
      if (!isCollapsed) {
        currentGroup.items.push(item)
      } else {
        // Even when collapsed, we need to track the title
        currentGroup.items = [item]
      }
      groups.push(currentGroup)
    } else if (isSeparator(item)) {
      // Separators end the current group
      if (currentGroup) {
        currentGroup = null
      }
      // Add separator as its own group
      groups.push({
        key: `separator-${item.id}`,
        label: "",
        items: [item],
        metadata: { isCollapsible: false }
      })
    } else if (isTodo(item)) {
      if (currentGroup && !collapsedTitles?.has(currentGroup.metadata?.titleItem?.id ?? "")) {
        // Add to current title group
        currentGroup.items.push(item)
        currentGroup.totalCount = (currentGroup.totalCount ?? 0) + 1
      } else if (currentGroup) {
        // Title is collapsed, just count
        currentGroup.totalCount = (currentGroup.totalCount ?? 0) + 1
      } else {
        // Standalone todo (no title above)
        standaloneItems.push(item)
      }
    }
  }

  // Flush remaining standalone items
  if (standaloneItems.length > 0) {
    groups.push({
      key: "ungrouped-final",
      label: "",
      items: standaloneItems,
      metadata: { isCollapsible: false }
    })
  }

  return groups
}

/**
 * Group items by due date category
 */
function groupByDueDate(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  // Only group todos
  const todos = items.filter(isTodo)
  const filtered = hideCompleted
    ? todos.filter(item => !item.completed)
    : todos

  // Initialize groups for each category
  const groupMap: Record<DueDateCategory, Item[]> = {
    "now": [],
    "overdue": [],
    "today": [],
    "tomorrow": [],
    "this-week": [],
    "later": [],
    "no-date": [],
  }

  // Categorize each todo
  for (const todo of filtered) {
    const category = getDueDateCategory(todo.dueDate, todo.isNow)
    groupMap[category].push(todo)
  }

  // Build groups in order
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

  const groupMap: Record<string, Item[]> = {
    high: [],
    medium: [],
    low: [],
    none: [],
  }

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

  const groupMap: Record<string, Item[]> = {
    "due": [],
    "in-progress": [],
    "done": [],
  }

  for (const todo of filtered) {
    // Derive status from completed flag if not set
    let status = todo.status
    if (!status) {
      status = todo.completed ? "done" : "due"
    }
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
 * Group items by category (tag)
 */
function groupByCategory(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  const todos = items.filter(isTodo)
  const filtered = hideCompleted
    ? todos.filter(item => !item.completed)
    : todos

  // Collect unique categories
  const categorySet = new Set<string>()
  for (const todo of filtered) {
    if (todo.category) {
      categorySet.add(todo.category)
    }
  }
  const categories = Array.from(categorySet).sort()

  // Group by category
  const groupMap: Record<string, Item[]> = {}
  for (const cat of categories) {
    groupMap[cat] = []
  }
  groupMap["uncategorized"] = []

  for (const todo of filtered) {
    const cat = todo.category || "uncategorized"
    if (!groupMap[cat]) groupMap[cat] = []
    groupMap[cat].push(todo)
  }

  // Build groups: categories first, then uncategorized
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

  // Add uncategorized if has items
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
 * Group items by project (title)
 */
function groupByProject(items: Item[], options: GroupingOptions): ItemGroup[] {
  const { hideCompleted, collapsedGroups } = options

  const sorted = sortItemsByPosition(items)

  // Build project map: titleId -> { title, todos }
  const projectMap = new Map<string, { title: Item; todos: Item[] }>()
  const noProjectTodos: Item[] = []

  let currentTitleId: string | null = null

  for (const item of sorted) {
    if (isTitle(item)) {
      currentTitleId = item.id
      projectMap.set(item.id, { title: item, todos: [] })
    } else if (isSeparator(item)) {
      currentTitleId = null
    } else if (isTodo(item)) {
      if (hideCompleted && item.completed) continue

      if (currentTitleId && projectMap.has(currentTitleId)) {
        projectMap.get(currentTitleId)!.todos.push(item)
      } else {
        noProjectTodos.push(item)
      }
    }
  }

  // Build groups
  const groups: ItemGroup[] = []

  for (const [titleId, { title, todos }] of projectMap) {
    if (todos.length === 0) continue

    const isCollapsed = collapsedGroups?.has(titleId) ?? false
    groups.push({
      key: titleId,
      label: title.text || "Untitled Project",
      items: isCollapsed ? [] : todos,
      totalCount: todos.length,
      metadata: {
        isCollapsible: true,
        titleItem: title
      }
    })
  }

  // Add no-project group if has items
  if (noProjectTodos.length > 0) {
    const isCollapsed = collapsedGroups?.has("no-project") ?? false
    groups.push({
      key: "no-project",
      label: "No Project",
      items: isCollapsed ? [] : noProjectTodos,
      totalCount: noProjectTodos.length,
      metadata: { isCollapsible: true }
    })
  }

  return groups
}

// ============================================
// Main Grouping Function
// ============================================

/**
 * Group items by the specified strategy
 */
export function groupItems(
  items: Item[],
  groupBy: GroupBy,
  options: GroupingOptions = {}
): ItemGroup[] {
  switch (groupBy) {
    case "position":
      return groupByPosition(items, options)
    case "dueDate":
      return groupByDueDate(items, options)
    case "priority":
      return groupByPriority(items, options)
    case "status":
      return groupByStatus(items, options)
    case "category":
      return groupByCategory(items, options)
    case "project":
      return groupByProject(items, options)
    default:
      return groupByPosition(items, options)
  }
}

// ============================================
// React Hook
// ============================================

/**
 * Hook for grouped items - memoized for performance
 */
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

/**
 * Get flat list of item IDs from groups (for drag-and-drop)
 */
export function getItemIdsFromGroups(groups: ItemGroup[]): string[] {
  const ids: string[] = []
  for (const group of groups) {
    for (const item of group.items) {
      if (isTodo(item)) {
        ids.push(item.id)
      }
    }
  }
  return ids
}
