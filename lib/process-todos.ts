import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo, ProcessResult } from "./types"

// Create OpenAI instance lazily to ensure env variables are loaded
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured. Please add OPENAI_API_KEY to .env.local")
  }
  return createOpenAI({ apiKey })
}

const TodoSchema = z.object({
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z.string().optional().describe("Task category or tag"),
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

  const openai = getOpenAI()
  const generatePromise = generateObject({
    model: openai("gpt-4o-mini"),
    schema: ProcessResultSchema,
    prompt: `You are a smart todo assistant. Analyze the user's input and extract actionable tasks.

USER INPUT:
"${truncatedInput}"

EXISTING TODOS (${existingTodos.length} total):
${existingTodos.length === 0 ? "(No existing tasks)" : existingTodos.map((t, i) => `${i + 1}. [ID: ${t.id}] "${t.title}"${t.completed ? " ✓ COMPLETED" : " ○ INCOMPLETE"}${t.priority ? ` (${t.priority})` : ""}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ""}${t.category ? ` [${t.category}]` : ""}${t.details ? ` - Details: ${t.details}` : ""}`).join("\n")}

=== INSTRUCTIONS ===

1. EXTRACT ACTIONABLE TASKS from the input:
   - Meeting transcripts → Extract action items, follow-ups, decisions
   - Conversations → Find "I need to...", "we should...", "TODO:", "action item:"
   - Notes → Extract tasks, reminders, things to do
   - Simple commands → "buy milk", "call dentist"

2. MATCH EXISTING TASKS (check BEFORE creating new):
   - "I bought eggs" → Find "Buy eggs" → mark completed
   - "the car should be red" → Find car task → add to details
   - Semantic matching: "Buy eggs" = "Get eggs" = "Purchase eggs"

3. COMPLETION DETECTION:
   - Past tense: "bought", "finished", "did", "called" → completed: true
   - Explicit: "done", "complete", "mark as done" → completed: true

4. CREATE NEW TASKS only if no similar task exists

5. MEETING/TRANSCRIPT EXTRACTION EXAMPLES:
   - "I need to follow up with John" → New task: "Follow up with John"
   - "We decided to launch next week" → New task: "Launch" (due: next week)
   - "Action item: send proposal to client" → New task: "Send proposal to client"
   - "TODO: review the contract" → New task: "Review the contract"
   - "I'll handle the marketing" → New task: "Handle marketing"
   - "Can you send me the report?" → New task: "Send report" (if speaker is user)

DATE PARSING (Today: ${todayDate}):
- "next week" = 7 days, "tomorrow" = +1 day, "Monday" = next Monday

DEFAULTS for new tasks: priority="low", dueDate=today

IMPORTANT: Use EXACT task IDs when updating existing tasks!

Extract ALL actionable items. If input is just conversation with no clear tasks, return empty arrays.`,
  })

  const { object } = await Promise.race([generatePromise, timeoutPromise])

  const newTodos: Todo[] = object.newTodos.map((todo) => ({
    id: crypto.randomUUID(),
    title: todo.title,
    details: todo.details,
    completed: false,
    priority: todo.priority || "low", // Default to low if not provided
    dueDate: todo.dueDate || todayDate, // Default to today if not provided
    category: todo.category,
    createdAt: new Date().toISOString(),
  }))

  const updates = object.updates.map((update) => ({
    id: update.matchedTodoId,
    updates: update.updates,
  }))

  return { newTodos, updates }
}
