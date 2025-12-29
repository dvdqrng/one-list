import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import type { Todo } from "./types"
import { getAgentPrompt } from "@/lib/ai/agent-prompts"
import { getOpenAIApiKey } from "@/lib/ai/agent-config"

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
    const apiKey = await getOpenAIApiKey()
    if (!apiKey) {
      throw new Error("OpenAI API key is not configured")
    }

    const basePrompt = await getAgentPrompt("findSimilarTasks")
    const prompt = `${basePrompt}

Total tasks: ${todos.length}

Tasks:
${todos
  .map(
    (t, i) => `${i + 1}. [ID: ${t.id}]
   Title: ${t.title}
   ${t.details ? `Details: ${t.details}` : ""}
   ${t.priority ? `Priority: ${t.priority}` : ""}
   ${t.dueDate ? `Due: ${new Date(t.dueDate).toLocaleDateString()}` : ""}
   ${t.category ? `Category: ${t.category}` : ""}
   ${t.completed ? "✓ COMPLETED" : "○ INCOMPLETE"}`
  )
  .join("\n\n")}

Only return groups you are confident about (>70% similarity).`

    const openai = createOpenAI({ apiKey })

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: SimilarityResultSchema,
      prompt,
    })

    return { groups: object.groups }
  } catch (error) {
    console.error("Error finding similar tasks:", error)
    return { groups: [] }
  }
}
