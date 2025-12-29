"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  AGENT_PROMPT_KEYS,
  AGENT_PROMPT_METADATA,
  type AgentPromptKey,
  type AgentPromptsMap,
} from "@/types/agent-prompts"
import type { AgentConfig } from "@/types/agent-config"
import {
  getAgentPromptsClient,
  updateAgentPromptsClient,
  getAgentConfigClient,
  updateAgentConfigClient,
} from "@/lib/api-bridge"

type FetchState = "idle" | "loading" | "error"

const HEADER_TEXT_CLASS = "text-xl font-semibold"
const PARAGRAPH_TEXT_CLASS = "text-sm"
const PROMPT_HEADER_TEXT_CLASS = `${PARAGRAPH_TEXT_CLASS} font-medium text-foreground`

export default function AgentSettingsPage() {
  const [fetchState, setFetchState] = useState<FetchState>("loading")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [originalPrompts, setOriginalPrompts] = useState<AgentPromptsMap | null>(null)
  const [draftPrompts, setDraftPrompts] = useState<AgentPromptsMap | null>(null)
  const [originalConfig, setOriginalConfig] = useState<AgentConfig | null>(null)
  const [draftConfig, setDraftConfig] = useState<AgentConfig | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      setFetchState("loading")
      try {
        const [prompts, config] = await Promise.all([
          getAgentPromptsClient(),
          getAgentConfigClient(),
        ])
        if (cancelled) return
        setOriginalPrompts(prompts)
        setDraftPrompts(prompts)
        setOriginalConfig(config)
        setDraftConfig(config)
        setFetchState("idle")
      } catch (err) {
        console.error(err)
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load settings")
        setFetchState("error")
      }
    }

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!success) return
    const timeout = setTimeout(() => setSuccess(null), 3000)
    return () => clearTimeout(timeout)
  }, [success])

  const promptChanges = useMemo(() => {
    if (!originalPrompts || !draftPrompts) return false
    return AGENT_PROMPT_KEYS.some((key) => originalPrompts[key] !== draftPrompts[key])
  }, [originalPrompts, draftPrompts])

  const configChanges = useMemo(() => {
    if (!originalConfig || !draftConfig) return false
    return originalConfig.openaiApiKey !== draftConfig.openaiApiKey
  }, [originalConfig, draftConfig])

  const hasChanges = promptChanges || configChanges

  const handlePromptChange = (key: AgentPromptKey, value: string) => {
    if (!draftPrompts) return
    setDraftPrompts({ ...draftPrompts, [key]: value })
  }

  const handleResetDraft = () => {
    if (originalPrompts) {
      setDraftPrompts(originalPrompts)
    }
    if (originalConfig) {
      setDraftConfig(originalConfig)
    }
    setError(null)
    setSuccess(null)
  }

  const handleSave = async () => {
    if (!draftPrompts || !draftConfig) return
    setSaving(true)
    setError(null)
    try {
      const tasks: Promise<void>[] = []

      if (promptChanges) {
        tasks.push(
          updateAgentPromptsClient(draftPrompts).then((updated) => {
            setOriginalPrompts(updated)
            setDraftPrompts(updated)
          })
        )
      }

      if (configChanges) {
        tasks.push(
          updateAgentConfigClient(draftConfig).then((updated) => {
            setOriginalConfig(updated)
            setDraftConfig(updated)
          })
        )
      }

      if (tasks.length === 0) {
        setSaving(false)
        return
      }

      await Promise.all(tasks)
      setSuccess("Settings saved")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const isLoading = fetchState === "loading"

  return (
    <main className="min-h-screen bg-background font-sans">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={HEADER_TEXT_CLASS}>Agent Settings</h1>
            <p className={`${PARAGRAPH_TEXT_CLASS} mt-2 text-muted-foreground`}>
              Inspect and fine-tune the system prompts that power each AI feature.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className={`${PARAGRAPH_TEXT_CLASS} font-medium text-foreground transition-opacity hover:opacity-70 active:opacity-60 disabled:opacity-50`}
              disabled={!hasChanges || saving}
              onClick={handleSave}
            >
              {saving ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              className={`${PARAGRAPH_TEXT_CLASS} font-medium text-foreground transition-opacity hover:opacity-70 active:opacity-60 disabled:opacity-50`}
              disabled={!hasChanges || saving}
              onClick={handleResetDraft}
            >
              Reset
            </button>
            <Link
              href="/"
              className={`${PARAGRAPH_TEXT_CLASS} font-medium text-foreground transition-opacity hover:opacity-70 active:opacity-60`}
            >
              Close
            </Link>
          </div>
        </div>

        {error && (
          <p className={`${PARAGRAPH_TEXT_CLASS} text-destructive`} role="alert">
            {error}
          </p>
        )}
        {success && <p className={`${PARAGRAPH_TEXT_CLASS} text-green-600`}>{success}</p>}

        {fetchState === "error" ? (
          <div
            className={`rounded-lg border bg-card p-6 ${PARAGRAPH_TEXT_CLASS} text-muted-foreground space-y-2`}
          >
            <p className={PARAGRAPH_TEXT_CLASS}>Unable to load settings. Please refresh or try again later.</p>
            <Button
              size="sm"
              variant="outline"
              className={PARAGRAPH_TEXT_CLASS}
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        ) : isLoading || !draftPrompts || !draftConfig ? (
          <div
            className={`rounded-lg border bg-card p-6 ${PARAGRAPH_TEXT_CLASS} text-muted-foreground`}
          >
            Loading prompts...
          </div>
        ) : (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex flex-col gap-2">
                <div>
                  <h2 className={PROMPT_HEADER_TEXT_CLASS}>OpenAI API Key</h2>
                  <p className={`${PARAGRAPH_TEXT_CLASS} text-muted-foreground`}>
                    Provide a personal API key to power AI enrichments. Environment variables still take precedence.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type={showApiKey ? "text" : "password"}
                  className={PARAGRAPH_TEXT_CLASS}
                  value={draftConfig.openaiApiKey}
                  placeholder="sk-..."
                  onChange={(event) =>
                    setDraftConfig({ ...draftConfig, openaiApiKey: event.target.value })
                  }
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  className={PARAGRAPH_TEXT_CLASS}
                  onClick={() => setShowApiKey((prev) => !prev)}
                >
                  {showApiKey ? "Hide" : "Show"}
                </Button>
              </div>
              <p className={`${PARAGRAPH_TEXT_CLASS} mt-2 text-muted-foreground`}>
                Stored locally for this device/account. Update instantly takes effect for both web and desktop builds.
              </p>
            </section>
            {AGENT_PROMPT_KEYS.map((key) => {
              const meta = AGENT_PROMPT_METADATA[key]
              const value = draftPrompts[key]
              return (
                <section key={key} className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div>
                      <h2 className={PROMPT_HEADER_TEXT_CLASS}>{meta.title}</h2>
                      <p className={`${PARAGRAPH_TEXT_CLASS} text-muted-foreground`}>
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  <Textarea
                    className={`h-64 ${PARAGRAPH_TEXT_CLASS}`}
                    value={value}
                    onChange={(event) => handlePromptChange(key, event.target.value)}
                    spellCheck={false}
                  />
                  <div className={`${PARAGRAPH_TEXT_CLASS} mt-2 text-muted-foreground`}>
                    {value.length} characters
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
