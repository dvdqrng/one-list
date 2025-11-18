"use server"

import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo, ProcessResult } from "./types"

const TodoSchema = z.object({
  title: z.string().describe("A concise one-line task title (e.g., 'Buy milk', 'Call dentist', 'Finish report')"),
  details: z.string().optional().describe("All additional context, notes, and information about the task"),
  priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority level"),
  dueDate: z.string().optional().describe("Due date in ISO format"),
  category: z.string().optional().describe("Task category or tag"),
  completed: z.boolean().optional().describe("Whether the task is completed"),
})

const ProcessResultSchema = z.object({
  newTodos: z.array(TodoSchema).describe("New tasks to create"),
  updates: z
    .array(
      z.object({
        matchedTodoId: z.string().describe("ID of the existing todo to update"),
        updates: TodoSchema.partial().describe("Fields to update"),
        reason: z.string().describe("Why this todo was matched"),
      }),
    )
    .describe("Updates to existing tasks"),
})

export async function processTodoText(input: string, existingTodos: Todo[]): Promise<ProcessResult> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out after 30 seconds")), 30000)
  })

  const generatePromise = generateObject({
    model: openai("gpt-4o-mini"),
    schema: ProcessResultSchema,
    prompt: `You are a smart todo assistant. Analyze the user's input and determine if they want to:
1. Create new tasks
2. Update existing tasks (if similar tasks exist)
3. Mark tasks as complete/incomplete

IMPORTANT: Extract a clean, concise one-line title (e.g., "Buy milk", "Call dentist") and put ALL other details, context, and notes in the details field.

User input: "${input}"

Existing todos (${existingTodos.length} total):
${existingTodos.length === 0 ? "(No existing tasks - you must create new tasks)" : existingTodos.map((t, i) => `${i + 1}. [ID: ${t.id}] ${t.title}${t.completed ? " ✓ COMPLETED" : " ○ INCOMPLETE"}${t.priority ? ` (${t.priority} priority)` : ""}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ""}${t.category ? ` [${t.category}]` : ""}${t.details ? ` - Details: ${t.details}` : ""}`).join("\n")}

Smart Matching Rules:
- If there are NO existing tasks, you MUST create new tasks, not updates
- Only try to match/update if the user explicitly says "update", "change", "modify", "mark as done", "complete", "finish" AND there are existing tasks
- Match semantically similar tasks (e.g., "grocery shopping" = "buy groceries" = "get food")
- Match by category when mentioned (e.g., "update my work task" matches tasks with category "work")
- Match by priority when specified (e.g., "mark urgent task as done" matches high priority tasks)
- Match by due date proximity (e.g., "tomorrow's task" matches tasks due tomorrow)
- Default to creating new tasks unless user clearly wants to update existing ones
- Be flexible with wording variations (e.g., "finish" = "complete" = "mark done" = "check off")
- When marking as complete, set completed: true in updates

Completion Keywords:
- "complete", "finish", "done", "finished", "completed", "check off", "mark done" = set completed: true
- "uncomplete", "reopen", "undo", "mark incomplete" = set completed: false

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

Return the appropriate new todos and/or updates with clear reasoning.`,
  })

  const { object } = await Promise.race([generatePromise, timeoutPromise])

  const newTodos: Todo[] = object.newTodos.map((todo) => ({
    id: crypto.randomUUID(),
    title: todo.title,
    details: todo.details,
    completed: false,
    priority: todo.priority,
    dueDate: todo.dueDate,
    category: todo.category,
    createdAt: new Date().toISOString(),
  }))

  const updates = object.updates.map((update) => ({
    id: update.matchedTodoId,
    updates: update.updates,
  }))

  return { newTodos, updates }
}
