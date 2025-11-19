"use client"

import { useState } from "react"
import { CalendarBlankIcon } from "@phosphor-icons/react"
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
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import type { SimilarTaskGroup } from "@/lib/find-similar-tasks"
import type { Todo } from "@/lib/types"

interface MergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: SimilarTaskGroup[]
  todos: Todo[]
  onMerge: (groupsToMerge: SimilarTaskGroup[]) => void
}

export function MergeDialog({ open, onOpenChange, groups, todos, onMerge }: MergeDialogProps) {
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())

  const handleToggleGroup = (index: number) => {
    const newSelected = new Set(selectedGroups)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedGroups(newSelected)
  }

  const handleMergeSelected = () => {
    const groupsToMerge = Array.from(selectedGroups).map((index) => groups[index])
    onMerge(groupsToMerge)
    setSelectedGroups(new Set())
    onOpenChange(false)
  }

  const handleMergeAll = () => {
    onMerge(groups)
    setSelectedGroups(new Set())
    onOpenChange(false)
  }

  const getTodoById = (id: string) => todos.find((t) => t.id === id)

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  if (groups.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Similar Tasks Found</DialogTitle>
            <DialogDescription>
              Great! It looks like you don't have any duplicate or similar tasks.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Similar Tasks Found</DialogTitle>
          <DialogDescription>
            Found {groups.length} group{groups.length > 1 ? "s" : ""} of similar tasks. Select which ones to merge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {groups.map((group, groupIndex) => {
            const isSelected = selectedGroups.has(groupIndex)
            const tasksInGroup = group.taskIds.map(getTodoById).filter(Boolean) as Todo[]

            return (
              <Card key={groupIndex} className={`p-4 ${isSelected ? "border-primary" : ""}`}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggleGroup(groupIndex)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Group {groupIndex + 1}</div>
                      <Badge variant={group.confidenceScore > 85 ? "default" : "secondary"}>
                        {group.confidenceScore}% confidence
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">{group.similarityReason}</div>

                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Tasks to merge:
                      </div>
                      {tasksInGroup.map((task) => (
                        <div key={task.id} className="rounded-md border border-muted bg-muted/30 p-2 text-sm">
                          <div className="text-sm font-medium">{task.title}</div>
                          {task.details && (
                            <div className="mt-1 text-sm text-muted-foreground">{task.details}</div>
                          )}
                          <div className="mt-2 flex gap-2">
                            {task.priority && (
                              <Badge variant="secondary">
                                {task.priority}
                              </Badge>
                            )}
                            {task.dueDate && (
                              <Badge variant="secondary" className="gap-1">
                                <CalendarBlankIcon className="h-3 w-3" weight="fill" />
                                {formatDueDate(task.dueDate)}
                              </Badge>
                            )}
                            {task.category && (
                              <Badge variant="secondary">
                                {task.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                      <div className="text-sm text-muted-foreground">
                        Suggested merged task:
                      </div>
                      <div className="text-sm font-medium">{group.suggestedMerge.title}</div>
                      {group.suggestedMerge.details && (
                        <div className="text-sm text-muted-foreground">{group.suggestedMerge.details}</div>
                      )}
                      <div className="flex gap-2">
                        {group.suggestedMerge.priority && (
                          <Badge variant="secondary">
                            {group.suggestedMerge.priority}
                          </Badge>
                        )}
                        {group.suggestedMerge.dueDate && (
                          <Badge variant="secondary" className="gap-1">
                            <CalendarBlankIcon className="h-3 w-3" weight="fill" />
                            {formatDueDate(group.suggestedMerge.dueDate)}
                          </Badge>
                        )}
                        {group.suggestedMerge.category && (
                          <Badge variant="secondary">
                            {group.suggestedMerge.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleMergeSelected}
            disabled={selectedGroups.size === 0}
          >
            Merge Selected ({selectedGroups.size})
          </Button>
          <Button onClick={handleMergeAll}>Merge All ({groups.length})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
