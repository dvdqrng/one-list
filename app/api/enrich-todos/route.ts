import { NextResponse } from "next/server"

import { processBatchTodos } from "@/lib/ai/server"
import type { BatchTodoResult } from "@/lib/ai/server"

interface EnrichTaskInput {
  id: string
  text: string
}

type EnrichRequestBody = {
  tasks: EnrichTaskInput[]
}

type EnrichResponse = {
  results: Array<{ id: string; result: BatchTodoResult | null }>
}

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { tasks } = (await request.json()) as EnrichRequestBody

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "At least one task is required" },
        { status: 400 }
      )
    }

    const sanitizedTasks = tasks.map((task) => ({
      id: task.id,
      text: typeof task.text === "string" ? task.text : "",
    }))

    const inputs = sanitizedTasks.map((task, index) => ({
      index,
      text: task.text,
    }))

    const resultMap = await processBatchTodos(inputs)

    const results: EnrichResponse["results"] = sanitizedTasks.map((task, index) => ({
      id: task.id,
      result: resultMap.get(index) ?? null,
    }))

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Error enriching todos:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enrich todos" },
      { status: 500 }
    )
  }
}
