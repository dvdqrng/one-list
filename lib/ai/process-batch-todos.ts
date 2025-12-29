import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import type { Priority } from "../types"
import { DEFAULT_CATEGORY, DEFAULT_PRIORITY, normalizeCategory, normalizePriority } from "./defaults"
import { getAgentPrompt } from "./agent-prompts"
import { getOpenAIApiKey } from "./agent-config"

const TodoItemSchema = z.object({
  originalIndex: z.number().describe("Index of the input that this corresponds to"),
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z
    .enum(["low", "medium", "high"])
    .default(DEFAULT_PRIORITY)
    .describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z
    .string()
    .default(DEFAULT_CATEGORY)
    .describe("Task category or tag"),
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
  priority: Priority
  dueDate: string
  category: string
}

export async function processBatchTodos(
  inputs: BatchTodoInput[]
): Promise<Map<number, BatchTodoResult>> {
  if (inputs.length === 0) {
    return new Map()
  }

  const todayDate = new Date().toISOString().split("T")[0]

  const buildFallbackMap = () => {
    const fallbackMap = new Map<number, BatchTodoResult>()
    inputs.forEach((input) => {
      fallbackMap.set(input.index, createFallbackResult(input, todayDate))
    })
    return fallbackMap
  }

  const apiKey = await getOpenAIApiKey()

  if (!apiKey) {
    console.warn("OpenAI API key missing. Using fallback metadata for batch todos.")
    return buildFallbackMap()
  }

  // Create OpenAI instance with API key
  const openai = createOpenAI({
    apiKey,
  })

  try {
    const basePrompt = await getAgentPrompt("processBatchTodos")
    const prompt = `${basePrompt}

Batch size: ${inputs.length}
Today's date: ${todayDate}

Inputs to process:
${inputs.map((input) => `[${input.index}] ${input.text}`).join("\n")}

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

Return the structured todos with all extracted metadata.`

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: BatchProcessResultSchema,
      prompt,
    })

    // Convert array to Map for easy lookup by index
    const resultMap = new Map<number, BatchTodoResult>()

    object.todos.forEach((todo) => {
      if (!inputs.some((input) => input.index === todo.originalIndex)) {
        return
      }

      resultMap.set(todo.originalIndex, {
        title: todo.title,
        details: todo.details,
        priority: normalizePriority(todo.priority),
        dueDate: todo.dueDate || todayDate,
        category: normalizeCategory(todo.category),
      })
    })

    inputs.forEach((input) => {
      if (!resultMap.has(input.index)) {
        resultMap.set(input.index, createFallbackResult(input, todayDate))
      }
    })

    return resultMap
  } catch (error) {
    console.error("Error processing batch todos, using fallback metadata:", error)
    return buildFallbackMap()
  }
}

function createFallbackResult(input: BatchTodoInput, todayDate: string): BatchTodoResult {
  const trimmedText = input.text?.trim() ?? ""
  const normalizedTitle = trimmedText.length > 0 ? trimmedText : "Untitled task"

  return {
    title: normalizedTitle,
    details: trimmedText && trimmedText !== input.text ? input.text : undefined,
    priority: DEFAULT_PRIORITY,
    dueDate: todayDate,
    category: DEFAULT_CATEGORY,
  }
}
