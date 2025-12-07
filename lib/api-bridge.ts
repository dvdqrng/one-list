/**
 * API Bridge - Unified interface for Electron IPC and HTTP API calls
 *
 * This module abstracts the difference between Electron's direct IPC calls
 * and the HTTP API fallback for web/development environments.
 */

import type { Todo, ProcessResult } from "./types"
import type { SimilarTaskGroup } from "./find-similar-tasks"

// Type definitions for the Electron API
interface ElectronAPI {
  processTodoText: (input: string, existingTodos: Todo[]) => Promise<ProcessResult>
  findSimilarTasks: (todos: Todo[]) => Promise<{ groups: SimilarTaskGroup[] }>
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ text: string }>
}

/**
 * Check if we're running in Electron with the API available
 */
function getElectronAPI(): ElectronAPI | null {
  if (typeof window !== "undefined" && (window as { electronDB?: ElectronAPI }).electronDB) {
    return (window as { electronDB?: ElectronAPI }).electronDB!
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

  // Fallback to API route
  const response = await fetch("/api/process-todo-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, existingTodos }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(errorData.error || "Failed to process todo text")
  }

  return response.json()
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

  // Fallback to API route
  const response = await fetch("/api/find-similar-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todos }),
  })

  if (!response.ok) {
    throw new Error("Failed to find similar tasks")
  }

  return response.json()
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

  // Fallback to API route
  const formData = new FormData()
  formData.append("audio", audioBlob, "recording.webm")

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(`Transcription failed: ${errorData.error || response.statusText}`)
  }

  return response.json()
}
