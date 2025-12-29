export const AGENT_PROMPT_KEYS = [
  "processTodoText",
  "processBatchTodos",
  "processSingleTodo",
  "findSimilarTasks",
] as const

export type AgentPromptKey = (typeof AGENT_PROMPT_KEYS)[number]

export type AgentPromptsMap = Record<AgentPromptKey, string>

export const AGENT_PROMPT_METADATA: Record<AgentPromptKey, {
  title: string
  description: string
  context: string[]
}> = {
  processTodoText: {
    title: "Bulk Text Processor",
    description: "Parses free-form notes or transcripts to create new tasks or update existing ones.",
    context: ["User input", "Existing todos", "Today's date"],
  },
  processBatchTodos: {
    title: "Queued Todo Enrichment",
    description: "Enhances short todos from the inbox queue with metadata like priority, due date, and category.",
    context: ["Task count", "Today's date", "Queued task titles"],
  },
  processSingleTodo: {
    title: "Single Todo Enrichment",
    description: "Enriches one todo at a time (e.g., from the sidebar) with inferred metadata.",
    context: ["User's raw todo", "Today's date"],
  },
  findSimilarTasks: {
    title: "Similarity & Merge Assistant",
    description: "Groups duplicate or overlapping todos and suggests merged summaries.",
    context: ["Full task list"],
  },
}
