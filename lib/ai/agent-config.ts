import fs from "fs/promises"
import path from "path"

import defaultConfig from "../../data/agent-config.defaults.json"
import type { AgentConfig } from "@/types/agent-config"

const DEFAULT_AGENT_CONFIG = defaultConfig as AgentConfig
const CONFIG_FILE_PATH = process.env.AGENT_CONFIG_PATH
  ? path.resolve(process.env.AGENT_CONFIG_PATH)
  : path.join(process.cwd(), "data", "agent-config.json")

let cachedConfig: AgentConfig | null = null

function mergeWithDefaults(overrides?: Partial<AgentConfig> | null): AgentConfig {
  return {
    ...DEFAULT_AGENT_CONFIG,
    ...((overrides && typeof overrides === "object") ? overrides : {}),
  }
}

async function readStoredConfig(): Promise<Partial<AgentConfig> | null> {
  try {
    const file = await fs.readFile(CONFIG_FILE_PATH, "utf8")
    return JSON.parse(file) as Partial<AgentConfig>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to read agent config from", CONFIG_FILE_PATH, error)
    }
    return null
  }
}

async function writeConfig(config: AgentConfig) {
  await fs.mkdir(path.dirname(CONFIG_FILE_PATH), { recursive: true })
  await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf8")
}

export async function getAgentConfig(): Promise<AgentConfig> {
  if (cachedConfig) {
    return cachedConfig
  }

  try {
    const stored = await readStoredConfig()
    cachedConfig = mergeWithDefaults(stored)
  } catch (error) {
    console.error("Failed to load agent config:", error)
    cachedConfig = { ...DEFAULT_AGENT_CONFIG }
  }

  return cachedConfig
}

export async function updateAgentConfig(update: Partial<AgentConfig>): Promise<AgentConfig> {
  try {
    const current = await getAgentConfig()
    const next = mergeWithDefaults({ ...current, ...update })

    const hasChanged = JSON.stringify(next) !== JSON.stringify(current)
    if (hasChanged) {
      cachedConfig = next
      await writeConfig(next)
    }

    return next
  } catch (error) {
    console.error("Failed to persist agent config:", error)
    throw error
  }
}

export async function getOpenAIApiKey(): Promise<string> {
  const envKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  if (envKey && envKey !== "undefined") {
    return envKey
  }
  const config = await getAgentConfig()
  return config.openaiApiKey?.trim() || ""
}
