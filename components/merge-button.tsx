"use client"

import { useState } from "react"
import { GitMerge, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { findSimilarTasks, type SimilarTaskGroup } from "@/lib/find-similar-tasks"
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
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isSearching || todos.length < 2}
      className="gap-1 h-6 text-xs px-1.5"
    >
      {isSearching ? (
        <>
          <Loader2 className="h-2 w-2 animate-spin fill-current" />
          Finding similar tasks...
        </>
      ) : (
        <>
          <GitMerge className="h-2 w-2 fill-current" />
          Find Similar Tasks
        </>
      )}
    </Button>
  )
}
