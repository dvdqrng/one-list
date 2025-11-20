import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo } from "./types"

const SimilarTaskGroupSchema = z.object({
  taskIds: z.array(z.string()).describe("Array of todo IDs that are similar to each other"),
  primaryTaskId: z.string().describe("The ID of the most detailed/complete task in this group"),
  similarityReason: z.string().describe("Why these tasks are considered similar"),
  confidenceScore: z.number().min(0).max(100).describe("Confidence that these tasks should be merged (0-100)"),
  suggestedMerge: z.object({
    title: z.string().describe("Suggested merged title"),
    details: z.string().optional().describe("Suggested merged details (combine all unique information)"),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Highest priority among the tasks"),
    dueDate: z.string().optional().describe("Earliest due date among the tasks"),
    category: z.string().optional().describe("Most appropriate category"),
  }),
})

const SimilarityResultSchema = z.object({
  groups: z.array(SimilarTaskGroupSchema).describe("Groups of similar tasks that could be merged"),
})

export interface SimilarTaskGroup {
  taskIds: string[]
  primaryTaskId: string
  similarityReason: string
  confidenceScore: number
  suggestedMerge: {
    title: string
    details?: string
    priority?: "low" | "medium" | "high"
    dueDate?: string
    category?: string
  }
}

export async function findSimilarTasks(todos: Todo[]): Promise<{ groups: SimilarTaskGroup[] }> {
  if (todos.length < 2) {
    return { groups: [] }
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: SimilarityResultSchema,
      prompt: `You are a smart todo assistant. Analyze the following tasks and identify groups of similar/duplicate tasks that should be merged.

Tasks (${todos.length} total):
${todos.map((t, i) => `${i + 1}. [ID: ${t.id}]
   Title: ${t.title}
   ${t.details ? `Details: ${t.details}` : ""}
   ${t.priority ? `Priority: ${t.priority}` : ""}
   ${t.dueDate ? `Due: ${new Date(t.dueDate).toLocaleDateString()}` : ""}
   ${t.category ? `Category: ${t.category}` : ""}
   ${t.completed ? "✓ COMPLETED" : "○ INCOMPLETE"}`).join("\n\n")}

Similarity Criteria:
- Semantic similarity (e.g., "Buy groceries" = "Get food" = "Grocery shopping")
- Same category and similar intent
- Duplicate or redundant tasks
- Tasks that are clearly the same thing worded differently

Rules:
- Only group tasks that are truly similar/duplicates (confidence > 70%)
- Don't group tasks that are just in the same category but are different actions
- Don't group completed tasks with incomplete tasks (they might be recurring)
- For each group, suggest a merged version that preserves all unique information
- Combine details from all tasks in the group
- Use the highest priority among grouped tasks
- Use the earliest due date among grouped tasks
- Choose the most descriptive title

Return only groups with high confidence (>70%) of being duplicates/similar.`,
    })

    return { groups: object.groups }
  } catch (error) {
    console.error("Error finding similar tasks:", error)
    return { groups: [] }
  }
}
