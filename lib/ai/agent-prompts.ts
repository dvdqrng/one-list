import fs from "fs/promises"
import path from "path"

import defaultAgentPromptsJson from "../../data/agent-prompts.defaults.json"
import { AGENT_PROMPT_KEYS, type AgentPromptKey, type AgentPromptsMap } from "../../types/agent-prompts"

const DEFAULT_AGENT_PROMPTS = defaultAgentPromptsJson as AgentPromptsMap
const PROMPTS_FILE_PATH = process.env.AGENT_PROMPTS_PATH
  ? path.resolve(process.env.AGENT_PROMPTS_PATH)
  : path.join(process.cwd(), "data", "agent-prompts.json")

let cachedPrompts: AgentPromptsMap | null = null

function mergeWithDefaults(overrides?: Partial<AgentPromptsMap> | null): AgentPromptsMap {
  const sanitized: Partial<AgentPromptsMap> = {}
  if (overrides) {
    for (const key of AGENT_PROMPT_KEYS) {
      const value = overrides[key]
      if (typeof value === "string") {
        const trimmed = value.trim()
        if (trimmed.length > 0) {
          sanitized[key] = trimmed
        }
      }
    }
  }

  return {
    ...DEFAULT_AGENT_PROMPTS,
    ...sanitized,
  }
}

async function readStoredPrompts(): Promise<Partial<AgentPromptsMap> | null> {
  try {
    const file = await fs.readFile(PROMPTS_FILE_PATH, "utf8")
    return JSON.parse(file) as Partial<AgentPromptsMap>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to read agent prompts:", error)
    }
    return null
  }
}

async function writePrompts(prompts: AgentPromptsMap) {
  await fs.mkdir(path.dirname(PROMPTS_FILE_PATH), { recursive: true })
  await fs.writeFile(PROMPTS_FILE_PATH, JSON.stringify(prompts, null, 2), "utf8")
}

export async function getAgentPrompts(): Promise<AgentPromptsMap> {
  if (cachedPrompts) {
    return cachedPrompts
  }

  const stored = await readStoredPrompts()
  cachedPrompts = mergeWithDefaults(stored)
  return cachedPrompts
}

export async function getAgentPrompt(key: AgentPromptKey): Promise<string> {
  const prompts = await getAgentPrompts()
  return prompts[key]
}

export async function updateAgentPrompts(update: Partial<AgentPromptsMap>): Promise<AgentPromptsMap> {
  const current = await getAgentPrompts()
  const next: AgentPromptsMap = { ...current }

  let didChange = false
  for (const key of AGENT_PROMPT_KEYS) {
    if (update[key] === undefined) continue
    const incoming = typeof update[key] === "string" ? update[key]!.trim() : ""
    const value = incoming.length > 0 ? incoming : DEFAULT_AGENT_PROMPTS[key]
    if (next[key] !== value) {
      next[key] = value
      didChange = true
    }
  }

  if (didChange) {
    cachedPrompts = next
    await writePrompts(next)
  }

  return next
}

export function getDefaultAgentPrompts(): AgentPromptsMap {
  return { ...DEFAULT_AGENT_PROMPTS }
}
