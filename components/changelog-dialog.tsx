"use client"

import { useState, useEffect, useMemo } from "react"
import {
  PlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  GitMergeIcon,
  CheckIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  CircleIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { ProposedChange, ChangelogSession, Todo } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ChangelogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: ChangelogSession | null
  onApplyChanges: (changes: ProposedChange[]) => void
  isApplying?: boolean
}

type ChangeGroup = {
  type: "additions" | "updates" | "completions" | "merges" | "deletions"
  label: string
  icon: React.ReactNode
  changes: ProposedChange[]
}

export function ChangelogDialog({
  open,
  onOpenChange,
  session,
  onApplyChanges,
  isApplying = false,
}: ChangelogDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset selections when session changes
  useEffect(() => {
    if (session) {
      setSelectedIds(new Set(session.changes.map((c) => c.id)))
    } else {
      setSelectedIds(new Set())
    }
  }, [session])

  // Group changes by type
  const changeGroups = useMemo((): ChangeGroup[] => {
    if (!session) return []

    const additions = session.changes.filter((c) => c.type === "add")
    const updates = session.changes.filter((c) => c.type === "update")
    const completions = session.changes.filter((c) => c.type === "complete" || c.type === "uncomplete")
    const merges = session.changes.filter((c) => c.type === "merge")
    const deletions = session.changes.filter((c) => c.type === "delete")

    const groups: ChangeGroup[] = []

    if (additions.length > 0) {
      groups.push({
        type: "additions",
        label: `Additions (${additions.length})`,
        icon: <PlusIcon className="h-4 w-4 text-green-500" weight="bold" />,
        changes: additions,
      })
    }

    if (updates.length > 0) {
      groups.push({
        type: "updates",
        label: `Updates (${updates.length})`,
        icon: <PencilSimpleIcon className="h-4 w-4 text-blue-500" weight="bold" />,
        changes: updates,
      })
    }

    if (completions.length > 0) {
      groups.push({
        type: "completions",
        label: `Status Changes (${completions.length})`,
        icon: <CheckCircleIcon className="h-4 w-4 text-purple-500" weight="bold" />,
        changes: completions,
      })
    }

    if (merges.length > 0) {
      groups.push({
        type: "merges",
        label: `Merges (${merges.length})`,
        icon: <GitMergeIcon className="h-4 w-4 text-orange-500" weight="bold" />,
        changes: merges,
      })
    }

    if (deletions.length > 0) {
      groups.push({
        type: "deletions",
        label: `Deletions (${deletions.length})`,
        icon: <TrashIcon className="h-4 w-4 text-red-500" weight="bold" />,
        changes: deletions,
      })
    }

    return groups
  }, [session])

  const handleToggle = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleToggleAll = (group: ChangeGroup) => {
    const groupIds = group.changes.map((c) => c.id)
    const allSelected = groupIds.every((id) => selectedIds.has(id))

    const newSelected = new Set(selectedIds)
    if (allSelected) {
      groupIds.forEach((id) => newSelected.delete(id))
    } else {
      groupIds.forEach((id) => newSelected.add(id))
    }
    setSelectedIds(newSelected)
  }

  const handleApplySelected = () => {
    if (!session) return
    const selectedChanges = session.changes.filter((c) => selectedIds.has(c.id))
    onApplyChanges(selectedChanges)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const selectedCount = selectedIds.size
  const totalCount = session?.changes.length ?? 0

  // Empty state
  if (!session || session.changes.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No Changes Detected</DialogTitle>
            <DialogDescription>
              {session?.source === "merge-button"
                ? "No similar tasks found that could be merged."
                : "The AI couldn't identify any changes to make based on your input."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Review Changes</DialogTitle>
          {session.inputText && (
            <DialogDescription className="text-sm" asChild>
              <div>
                <span className="text-muted-foreground">Input: </span>
                <span className="italic line-clamp-2">"{session.inputText}"</span>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 py-2">
            {changeGroups.map((group) => (
              <ChangeGroupSection
                key={group.type}
                group={group}
                selectedIds={selectedIds}
                onToggle={handleToggle}
                onToggleAll={() => handleToggleAll(group)}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            onClick={handleApplySelected}
            disabled={selectedCount === 0 || isApplying}
          >
            {isApplying ? (
              "Applying..."
            ) : (
              <>
                Apply {selectedCount === totalCount ? "All" : `Selected (${selectedCount})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ChangeGroupSectionProps {
  group: ChangeGroup
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
}

function ChangeGroupSection({ group, selectedIds, onToggle, onToggleAll }: ChangeGroupSectionProps) {
  const allSelected = group.changes.every((c) => selectedIds.has(c.id))
  const someSelected = group.changes.some((c) => selectedIds.has(c.id))

  return (
    <div className="rounded-lg border bg-card">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleAll}
      >
        <Checkbox
          checked={allSelected}
          // @ts-ignore - indeterminate is valid but not in types
          data-state={someSelected && !allSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
          onCheckedChange={onToggleAll}
          onClick={(e) => e.stopPropagation()}
        />
        {group.icon}
        <span className="font-medium text-sm">{group.label}</span>
      </div>
      <Separator />
      <div className="divide-y">
        {group.changes.map((change) => (
          <ChangeItem
            key={change.id}
            change={change}
            isSelected={selectedIds.has(change.id)}
            onToggle={() => onToggle(change.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface ChangeItemProps {
  change: ProposedChange
  isSelected: boolean
  onToggle: () => void
}

function ChangeItem({ change, isSelected, onToggle }: ChangeItemProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors",
        !isSelected && "opacity-50"
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        {change.type === "add" && change.newTodo && (
          <AdditionChangeContent todo={change.newTodo} />
        )}
        {change.type === "update" && change.existingTodo && change.updates && (
          <UpdateChangeContent
            existingTodo={change.existingTodo}
            updates={change.updates}
            reason={change.reason}
          />
        )}
        {(change.type === "complete" || change.type === "uncomplete") &&
          change.existingTodo && (
            <StatusChangeContent
              existingTodo={change.existingTodo}
              type={change.type}
              reason={change.reason}
            />
          )}
        {change.type === "merge" && change.mergeGroup && (
          <MergeChangeContent mergeGroup={change.mergeGroup} />
        )}
        {change.type === "delete" && change.deleteTodo && (
          <DeleteChangeContent todo={change.deleteTodo} reason={change.reason} />
        )}
      </div>
    </div>
  )
}

function AdditionChangeContent({ todo }: { todo: Todo }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-green-500 font-mono text-sm">+</span>
        <span className="font-medium text-sm">{todo.title}</span>
      </div>
      {todo.details && (
        <p className="text-sm text-muted-foreground pl-5 line-clamp-2">{todo.details}</p>
      )}
      <div className="flex flex-wrap gap-1.5 pl-5">
        {todo.priority && (
          <Badge variant="secondary" className="text-xs">
            {todo.priority}
          </Badge>
        )}
        {todo.dueDate && (
          <Badge variant="secondary" className="text-xs gap-1">
            <CalendarBlankIcon className="h-3 w-3" />
            {formatDate(todo.dueDate)}
          </Badge>
        )}
        {todo.category && (
          <Badge variant="secondary" className="text-xs">
            {todo.category}
          </Badge>
        )}
      </div>
    </div>
  )
}

function UpdateChangeContent({
  existingTodo,
  updates,
  reason,
}: {
  existingTodo: Todo
  updates: Partial<Todo>
  reason?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-blue-500 font-mono text-sm">~</span>
        <span className="font-medium text-sm">{existingTodo.title}</span>
      </div>
      <div className="pl-5 space-y-1">
        {Object.entries(updates).map(([key, value]) => {
          if (key === "completed") return null // Handle separately in StatusChange
          const oldValue = existingTodo[key as keyof Todo]
          return (
            <div key={key} className="text-sm flex items-center gap-2">
              <span className="text-muted-foreground capitalize">{key}:</span>
              <span className="text-red-400 line-through">{formatValue(oldValue)}</span>
              <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-green-400">{formatValue(value)}</span>
            </div>
          )
        })}
      </div>
      {reason && (
        <p className="text-xs text-muted-foreground pl-5 italic">{reason}</p>
      )}
    </div>
  )
}

function StatusChangeContent({
  existingTodo,
  type,
  reason,
}: {
  existingTodo: Todo
  type: "complete" | "uncomplete"
  reason?: string
}) {
  const isCompleting = type === "complete"

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {isCompleting ? (
          <CheckCircleIcon className="h-4 w-4 text-green-500" weight="fill" />
        ) : (
          <CircleIcon className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={cn("font-medium text-sm", isCompleting && "line-through text-muted-foreground")}>
          {existingTodo.title}
        </span>
      </div>
      <div className="pl-6 text-sm flex items-center gap-2">
        <span className="text-muted-foreground">Status:</span>
        <span className={isCompleting ? "text-muted-foreground" : "text-green-400"}>
          {isCompleting ? "Incomplete" : "Complete"}
        </span>
        <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
        <span className={isCompleting ? "text-green-400" : "text-muted-foreground"}>
          {isCompleting ? "Complete" : "Incomplete"}
        </span>
      </div>
      {reason && (
        <p className="text-xs text-muted-foreground pl-6 italic">{reason}</p>
      )}
    </div>
  )
}

function MergeChangeContent({
  mergeGroup,
}: {
  mergeGroup: NonNullable<ProposedChange["mergeGroup"]>
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GitMergeIcon className="h-4 w-4 text-orange-500" weight="bold" />
        <span className="font-medium text-sm">{mergeGroup.mergedResult.title}</span>
        <Badge variant={mergeGroup.confidenceScore > 85 ? "default" : "secondary"} className="text-xs">
          {mergeGroup.confidenceScore}%
        </Badge>
      </div>
      <div className="pl-6 space-y-1">
        <p className="text-xs text-muted-foreground">Merging {mergeGroup.sourceTodos.length} tasks:</p>
        <ul className="text-sm space-y-0.5">
          {mergeGroup.sourceTodos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 text-red-400">
              <span className="font-mono">-</span>
              <span className="line-through">{todo.title}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground pl-6 italic">{mergeGroup.similarityReason}</p>
      {mergeGroup.mergedResult.details && (
        <p className="text-sm text-muted-foreground pl-6">{mergeGroup.mergedResult.details}</p>
      )}
      <div className="flex flex-wrap gap-1.5 pl-6">
        {mergeGroup.mergedResult.priority && (
          <Badge variant="secondary" className="text-xs">
            {mergeGroup.mergedResult.priority}
          </Badge>
        )}
        {mergeGroup.mergedResult.dueDate && (
          <Badge variant="secondary" className="text-xs gap-1">
            <CalendarBlankIcon className="h-3 w-3" />
            {formatDate(mergeGroup.mergedResult.dueDate)}
          </Badge>
        )}
        {mergeGroup.mergedResult.category && (
          <Badge variant="secondary" className="text-xs">
            {mergeGroup.mergedResult.category}
          </Badge>
        )}
      </div>
    </div>
  )
}

function DeleteChangeContent({ todo, reason }: { todo: Todo; reason?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-red-500 font-mono text-sm">-</span>
        <span className="font-medium text-sm text-red-400 line-through">{todo.title}</span>
      </div>
      {reason && (
        <p className="text-xs text-muted-foreground pl-5 italic">{reason}</p>
      )}
    </div>
  )
}

// Helper functions
function formatDate(dateString: string): string {
  const date = new Date(dateString)

  // Handle invalid dates
  if (isNaN(date.getTime())) return dateString

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.toDateString() === today.toDateString()) {
    return "Today"
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return "Tomorrow"
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "none"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "string") {
    // Check if it's a date
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return formatDate(value)
    }
    return value
  }
  return String(value)
}
