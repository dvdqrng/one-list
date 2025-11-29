import { NextResponse } from "next/server"
import { findSimilarTasks } from "@/lib/find-similar-tasks"
import type { Todo } from "@/lib/types"

export async function POST(request: Request) {
  try {
    const { todos } = await request.json() as { todos: Todo[] }

    if (!todos || !Array.isArray(todos)) {
      return NextResponse.json(
        { error: "Todos array is required" },
        { status: 400 }
      )
    }

    const result = await findSimilarTasks(todos)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error finding similar tasks:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to find similar tasks" },
      { status: 500 }
    )
  }
}
