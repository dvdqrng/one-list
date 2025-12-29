import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo, ProcessResult } from "../types"
import { DEFAULT_CATEGORY, DEFAULT_PRIORITY, normalizeCategory, normalizePriority } from "./defaults"
import { getAgentPrompt } from "./agent-prompts"
import { getOpenAIApiKey } from "./agent-config"

// Create OpenAI instance lazily to ensure env/config values are loaded
let cachedOpenAI: ReturnType<typeof createOpenAI> | null = null
let cachedApiKey: string | null = null

async function getOpenAI() {
  const apiKey = await getOpenAIApiKey()
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured. Please add one in Agent Settings or .env.local")
  }

  if (!cachedOpenAI || cachedApiKey !== apiKey) {
    cachedOpenAI = createOpenAI({ apiKey })
    cachedApiKey = apiKey
  }

  return cachedOpenAI
}

const TodoSchema = z.object({
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z.enum(["low", "medium", "high"]).default(DEFAULT_PRIORITY).describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z.string().default(DEFAULT_CATEGORY).describe("Task category or tag"),
  completed: z.boolean().optional().describe("Whether the task is completed"),
})

const ProcessResultSchema = z.object({
  newTodos: z.array(TodoSchema).default([]).describe("New tasks to create"),
  updates: z
    .array(
      z.object({
        matchedTodoId: z.string().describe("ID of the existing todo to update"),
        updates: TodoSchema.partial().describe("Fields to update"),
        reason: z.string().describe("Why this todo was matched"),
      }),
    )
    .default([])
    .describe("Updates to existing tasks"),
})

export async function processTodoText(input: string, existingTodos: Todo[]): Promise<ProcessResult> {
  const todayDate = new Date().toISOString().split("T")[0]

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out after 30 seconds")), 30000)
  })

  // Truncate very long inputs to avoid token limits
  const truncatedInput = input.length > 4000 ? input.slice(0, 4000) + "..." : input

  const openai = await getOpenAI()
  const basePrompt = await getAgentPrompt("processTodoText")
  const prompt = `${basePrompt}

Today's date: ${todayDate}

USER INPUT:
"${truncatedInput}"

EXISTING TODOS (${existingTodos.length} total):
${existingTodos.length === 0 ? "(No existing tasks)" : existingTodos.map((t, i) => `${i + 1}. [ID: ${t.id}] "${t.title}"${t.completed ? " ✓ COMPLETED" : " ○ INCOMPLETE"}${t.priority ? ` (${t.priority})` : ""}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ""}${t.category ? ` [${t.category}]` : ""}${t.details ? ` - Details: ${t.details}` : ""}`).join("\n")}

DATE PARSING HELPERS:
- "next week" = 7 days from today
- "tomorrow" = +1 day
- "Monday" = next Monday
- "end of month" = last day of current month

Priority defaults: "low" if unspecified. Category defaults to "${DEFAULT_CATEGORY}".

IMPORTANT: Use EXACT task IDs when updating existing todos.`

  const generatePromise = generateObject({
    model: openai("gpt-4o-mini"),
    schema: ProcessResultSchema,
    prompt,
  })

  const { object } = await Promise.race([generatePromise, timeoutPromise])

  const newTodos: Todo[] = object.newTodos.map((todo) => ({
    id: crypto.randomUUID(),
    title: todo.title,
    details: todo.details,
    completed: false,
    priority: normalizePriority(todo.priority),
    dueDate: todo.dueDate || todayDate,
    category: normalizeCategory(todo.category),
    createdAt: new Date().toISOString(),
  }))

  const updates = object.updates.map((update) => ({
    id: update.matchedTodoId,
    updates: update.updates,
  }))

  return { newTodos, updates }
}
