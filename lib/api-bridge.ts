/**
 * API Bridge - Unified interface for Electron IPC and HTTP API calls
 *
 * This module abstracts the difference between Electron's direct IPC calls
 * and the HTTP API fallback for web/development environments.
 */

import type { Todo, ProcessResult } from "./types"
import type { SimilarTaskGroup } from "./find-similar-tasks"
import type { AgentPromptsMap } from "@/types/agent-prompts"
import type { AgentConfig } from "@/types/agent-config"

// Type definitions for the Electron API
interface ElectronNewAPI {
  processTodoText: (input: string, existingTodos: Todo[]) => Promise<ProcessResult>
  findSimilarTasks: (todos: Todo[]) => Promise<{ groups: SimilarTaskGroup[] }>
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ text: string }>
  agentPrompts: {
    get: () => Promise<AgentPromptsMap>
    update: (prompts: AgentPromptsMap) => Promise<AgentPromptsMap>
  }
  agentConfig: {
    get: () => Promise<AgentConfig>
    update: (config: AgentConfig) => Promise<AgentConfig>
  }
}

/**
 * Check if we're running in Electron with the API available
 */
function getElectronAPI(): ElectronNewAPI | null {
  if (typeof window !== "undefined" && (window as { electron?: ElectronNewAPI }).electron) {
    return (window as { electron?: ElectronNewAPI }).electron!
  }
  return null
}

/**
 * Process todo text using AI - parses natural language input into structured todos
 */
export async function processTodoText(
  input: string,
  existingTodos: Todo[]
): Promise<ProcessResult> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.processTodoText) {
    return electronAPI.processTodoText(input, existingTodos)
  }

  throw new Error("Electron API not available")
}

/**
 * Find similar tasks that could potentially be merged
 */
export async function findSimilarTasks(
  todos: Todo[]
): Promise<{ groups: SimilarTaskGroup[] }> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.findSimilarTasks) {
    return electronAPI.findSimilarTasks(todos)
  }

  throw new Error("Electron API not available")
}

/**
 * Transcribe audio to text using Whisper API
 */
export async function transcribeAudio(
  audioBlob: Blob
): Promise<{ text: string }> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.transcribeAudio) {
    const arrayBuffer = await audioBlob.arrayBuffer()
    return electronAPI.transcribeAudio(arrayBuffer)
  }

  throw new Error("Electron API not available")
}

export async function getAgentPromptsClient(): Promise<AgentPromptsMap> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.agentPrompts) {
    return electronAPI.agentPrompts.get()
  }

  throw new Error("Electron API not available")
}

export async function updateAgentPromptsClient(
  prompts: AgentPromptsMap
): Promise<AgentPromptsMap> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.agentPrompts) {
    return electronAPI.agentPrompts.update(prompts)
  }

  throw new Error("Electron API not available")
}

export async function getAgentConfigClient(): Promise<AgentConfig> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.agentConfig) {
    return electronAPI.agentConfig.get()
  }

  throw new Error("Electron API not available")
}

export async function updateAgentConfigClient(config: AgentConfig): Promise<AgentConfig> {
  const electronAPI = getElectronAPI()

  if (electronAPI?.agentConfig) {
    return electronAPI.agentConfig.update(config)
  }

  throw new Error("Electron API not available")
}
