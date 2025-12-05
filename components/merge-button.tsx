"use client"

import { useState } from "react"
import { IntersectIcon, SpinnerIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { findSimilarTasks } from "@/lib/api-bridge"
import type { SimilarTaskGroup } from "@/lib/find-similar-tasks"
import type { Todo } from "@/lib/types"

interface MergeButtonProps {
  todos: Todo[]
  onMergeGroupsFound: (groups: SimilarTaskGroup[]) => void
}

export function MergeButton({ todos, onMergeGroupsFound }: MergeButtonProps) {
  const [isSearching, setIsSearching] = useState(false)

  const handleClick = async () => {
    setIsSearching(true)

    try {
      const result = await findSimilarTasks(todos)
      onMergeGroupsFound(result.groups)
    } catch (error) {
      console.error("Error finding similar tasks:", error)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isSearching || todos.length < 2}
      className="h-7 w-7 text-muted-foreground"
      title={isSearching ? "Finding similar tasks..." : "Find similar tasks"}
    >
      {isSearching ? (
        <SpinnerIcon className="h-4 w-4 animate-spin" weight="bold" />
      ) : (
        <IntersectIcon className="h-4 w-4" weight="regular" />
      )}
    </Button>
  )
}
