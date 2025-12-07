import { NextResponse } from "next/server"
import { processTodoText } from "@/lib/ai"
import type { Todo } from "@/lib/types"

// Increase the max duration for longer AI processing
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { input, existingTodos } = await request.json() as {
      input: string
      existingTodos: Todo[]
    }

    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { error: "Input is required" },
        { status: 400 }
      )
    }

    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY && !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      )
    }

    const result = await processTodoText(input, existingTodos || [])
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error processing todo text:", error)

    // Provide more helpful error messages
    const errorMessage = error instanceof Error ? error.message : "Failed to process todo text"
    const isTimeout = errorMessage.includes("timed out")
    const isApiKeyError = errorMessage.toLowerCase().includes("api key") || errorMessage.includes("401")

    return NextResponse.json(
      {
        error: isApiKeyError
          ? "OpenAI API key is invalid or not configured"
          : isTimeout
            ? "Request timed out. Try a shorter input or fewer existing tasks."
            : errorMessage
      },
      { status: isApiKeyError ? 401 : 500 }
    )
  }
}
