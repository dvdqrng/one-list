import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo } from "../types"
import { DEFAULT_CATEGORY, DEFAULT_PRIORITY, normalizeCategory, normalizePriority } from "./defaults"
import { getAgentPrompt } from "./agent-prompts"
import { getOpenAIApiKey } from "./agent-config"

const SingleTodoSchema = z.object({
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z.enum(["low", "medium", "high"]).default(DEFAULT_PRIORITY).describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z.string().default(DEFAULT_CATEGORY).describe("Task category or tag"),
})

export async function processSingleTodo(
  input: string,
  _existingTodos: Todo[]
): Promise<{ todo: Todo | null }> {
  const todayDate = new Date().toISOString().split("T")[0]

  try {
    const apiKey = await getOpenAIApiKey()
    if (!apiKey) {
      throw new Error("OpenAI API key is not configured")
    }

    const basePrompt = await getAgentPrompt("processSingleTodo")
    const prompt = `${basePrompt}

Today's date: ${todayDate}
User input: "${input}"

Date Parsing Examples:
- "tomorrow" = next day
- "next week" = 7 days from now
- "in 3 days" = 3 days from now
- "Monday" = next Monday
- "end of month" = last day of current month

Priority Detection:
- "urgent", "important", "asap", "critical" = high priority
- "medium", "normal" = medium priority
- "low", "whenever", "someday" = low priority

Category Examples:
- Shopping-related = "shopping"
- Work-related = "work"
- Personal errands = "personal"
- Health/medical = "health"
- If category is unclear → "${DEFAULT_CATEGORY}"

Return the structured todo with all extracted metadata.`

    const openai = createOpenAI({ apiKey })

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: SingleTodoSchema,
      prompt,
    })

    const todo: Todo = {
      id: crypto.randomUUID(),
      title: object.title,
      details: object.details,
      completed: false,
      priority: normalizePriority(object.priority),
      dueDate: object.dueDate || todayDate,
      category: normalizeCategory(object.category),
      createdAt: new Date().toISOString(),
    }

    return { todo }
  } catch (error) {
    console.error("Error processing single todo:", error)
    return { todo: null }
  }
}
