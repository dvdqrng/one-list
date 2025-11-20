import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

const TodoItemSchema = z.object({
  originalIndex: z.number().describe("Index of the input that this corresponds to"),
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z.string().optional().describe("Task category or tag"),
})

const BatchProcessResultSchema = z.object({
  todos: z.array(TodoItemSchema).describe("Processed todos with extracted metadata"),
})

export interface BatchTodoInput {
  index: number
  text: string
}

export interface BatchTodoResult {
  title: string
  details?: string
  priority?: "low" | "medium" | "high"
  dueDate?: string
  category?: string
}

export async function processBatchTodos(
  inputs: BatchTodoInput[]
): Promise<Map<number, BatchTodoResult>> {
  if (inputs.length === 0) {
    return new Map()
  }

  const todayDate = new Date().toISOString().split("T")[0]

  try {
    // Get API key from environment
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY

    console.log('Environment check:', {
      hasKey: !!apiKey,
      keyLength: apiKey?.length,
      keyStart: apiKey?.substring(0, 7)
    })

    if (!apiKey || apiKey === 'undefined') {
      console.error('All OPENAI env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')))
      throw new Error('OpenAI API key is not configured. Please add NEXT_PUBLIC_OPENAI_API_KEY to .env.local')
    }

    // Create OpenAI instance with API key
    const openai = createOpenAI({
      apiKey: apiKey,
    })

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: BatchProcessResultSchema,
      prompt: `You are a smart todo assistant. Process these ${inputs.length} tasks in batch. Extract metadata from each one.

IMPORTANT:
- Extract a clean, concise one-line title (e.g., "Buy milk", "Call dentist")
- Put ALL other details, context, and notes in the details field
- Infer priority, due date, and category if mentioned
- You MUST return exactly ${inputs.length} todos, one for each input
- Use the originalIndex field to map each result back to its input

DEFAULT VALUES (use these when no specific information is provided):
- If NO priority is mentioned or inferred → set priority to "low"
- If NO due date is mentioned or inferred → set dueDate to today (${todayDate})

Inputs to process:
${inputs.map((input) => `[${input.index}] ${input.text}`).join("\n")}

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

Return the structured todos with all extracted metadata.`,
    })

    // Convert array to Map for easy lookup by index
    const resultMap = new Map<number, BatchTodoResult>()

    object.todos.forEach((todo) => {
      resultMap.set(todo.originalIndex, {
        title: todo.title,
        details: todo.details,
        priority: todo.priority || "low", // Default to low if not provided
        dueDate: todo.dueDate || todayDate, // Default to today if not provided
        category: todo.category,
      })
    })

    return resultMap
  } catch (error) {
    console.error("Error processing batch todos:", error)
    throw error
  }
}
