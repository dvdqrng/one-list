import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo } from "./types"

const SingleTodoSchema = z.object({
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z.string().optional().describe("Task category or tag"),
})

export async function processSingleTodo(
  input: string,
  existingTodos: Todo[]
): Promise<{ todo: Todo | null }> {
  const todayDate = new Date().toISOString().split("T")[0]

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: SingleTodoSchema,
      prompt: `You are a smart todo assistant. The user just typed a single task. Extract metadata from it.

IMPORTANT:
- Extract a clean, concise one-line title (e.g., "Buy milk", "Call dentist")
- Put ALL other details, context, and notes in the details field
- Infer priority, due date, and category if mentioned

DEFAULT VALUES (use these when no specific information is provided):
- If NO priority is mentioned or inferred → set priority to "low"
- If NO due date is mentioned or inferred → set dueDate to today (${todayDate})

User input: "${input}"

Date Parsing Examples:
- "tomorrow" = next day
- "next week" = 7 days from now
- "in 3 days" = 3 days from now
- "Monday" = next Monday
- "end of month" = last day of current month
- Today's date: ${todayDate}

Priority Detection:
- "urgent", "important", "asap", "critical" = high priority
- "medium", "normal" = medium priority
- "low", "whenever", "someday" = low priority
- If NOTHING mentioned → default to "low"

Category Examples:
- Shopping-related = "shopping"
- Work-related = "work"
- Personal errands = "personal"
- Health/medical = "health"

Return the structured todo with all extracted metadata.`,
    })

    const todo: Todo = {
      id: crypto.randomUUID(),
      title: object.title,
      details: object.details,
      completed: false,
      priority: object.priority || "low", // Default to low if not provided
      dueDate: object.dueDate || todayDate, // Default to today if not provided
      category: object.category,
      createdAt: new Date().toISOString(),
    }

    return { todo }
  } catch (error) {
    console.error("Error processing single todo:", error)
    return { todo: null }
  }
}
