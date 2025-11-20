"use client"

import { useState } from "react"
import { IntersectIcon, SpinnerIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
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
      const response = await fetch('/api/find-similar-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todos })
      })

      if (!response.ok) {
        throw new Error('Failed to find similar tasks')
      }

      const result: { groups: SimilarTaskGroup[] } = await response.json()
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
      className="h-7 w-7 p-0"
      title={isSearching ? "Finding similar tasks..." : "Find similar tasks"}
    >
      {isSearching ? (
        <SpinnerIcon size={12} className="animate-spin" weight="bold" />
      ) : (
        <IntersectIcon size={12} weight="fill" />
      )}
    </Button>
  )
}
