"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { PlayIcon, PauseIcon, StopIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { TaskItem } from "@/components/ui/task-item"
import { EmptyState } from "@/components/ui/empty-state"
import { useStore, useNowTodos } from "@/lib/store"
import { useFocusTimer } from "@/hooks/use-focus-timer"
import { processTodoText } from "@/lib/api-bridge"
import type { Todo } from "@/lib/types"

export function FocusModeOverlay() {
  const { theme, setTheme } = useTheme()
  const previousThemeRef = useRef<string | null>(null)

  const {
    isFocusMode,
    distractionNotes,
    setDistractionNotes,
    setPreviousTheme,
    previousTheme,
    toggleItem,
  } = useStore()

  const nowTodos = useNowTodos()

  const {
    timeRemaining,
    isRunning,
    isComplete,
    formattedTime,
    pauseTimer,
    resumeTimer,
    endFocusMode,
  } = useFocusTimer()

  // Store previous theme and switch to dark when entering focus mode
  useEffect(() => {
    if (isFocusMode) {
      // Store current theme before switching
      if (theme && theme !== "dark") {
        previousThemeRef.current = theme
        setPreviousTheme(theme)
      }
      // Force dark mode for focus
      setTheme("dark")
    } else {
      // Restore previous theme when exiting focus mode
      const themeToRestore = previousThemeRef.current || previousTheme
      if (themeToRestore && themeToRestore !== "dark") {
        setTheme(themeToRestore)
      }
      previousThemeRef.current = null
    }
  }, [isFocusMode, theme, setTheme, setPreviousTheme, previousTheme])

  // Handle completing a todo in focus mode
  const handleToggleTodo = (id: string) => {
    toggleItem(id)
  }

  // Handle adding distraction notes as tasks
  const handleAddNotes = async () => {
    if (!distractionNotes.trim()) {
      endFocusMode()
      return
    }

    try {
      const result = await processTodoText(distractionNotes, nowTodos)

      // Create changelog session for review
      const { setChangelogSession, setShowChangelog } = useStore.getState()

      const changes = [
        ...result.newTodos.map((todo: Todo) => ({
          id: crypto.randomUUID(),
          type: "add" as const,
          newTodo: todo,
          reason: "From focus session distraction notes",
        })),
        ...result.updates.map((update: { id: string, updates: Partial<Todo> }) => ({
          id: crypto.randomUUID(),
          type: "update" as const,
          existingTodo: nowTodos.find(t => t.id === update.id),
          updates: update.updates,
          reason: "Updated from focus session notes",
        })),
      ]

      if (changes.length > 0) {
        setChangelogSession({
          id: crypto.randomUUID(),
          source: "ai-input",
          inputText: distractionNotes,
          changes,
          createdAt: new Date().toISOString(),
        })
        setShowChangelog(true)
      }
    } catch (error) {
      console.error("Failed to process distraction notes:", error)
    }

    // Clear notes and exit focus mode
    setDistractionNotes("")
    endFocusMode()
  }

  // Don't render if not in focus mode
  if (!isFocusMode) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-8">
      {/* Two column layout */}
      <div className="w-full max-w-5xl grid grid-cols-2 gap-12 items-start">
        {/* Left column: Timer + Tasks */}
        <div className="flex flex-col">
          {/* Timer display */}
          <div className="text-center mb-8">
            <div className="text-8xl font-mono font-bold text-primary mb-4">
              {formattedTime}
            </div>

            {/* Timer controls */}
            <div className="flex items-center justify-center gap-4">
              {isComplete ? (
                <Button
                  onClick={handleAddNotes}
                  size="lg"
                  className="text-lg px-8"
                >
                  {distractionNotes.trim() ? "Add Notes as Tasks" : "End Session"}
                </Button>
              ) : (
                <>
                  {isRunning ? (
                    <Button
                      onClick={pauseTimer}
                      variant="outline"
                      size="lg"
                      className="gap-2"
                    >
                      <PauseIcon className="h-5 w-5" weight="fill" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      onClick={resumeTimer}
                      variant="outline"
                      size="lg"
                      className="gap-2"
                    >
                      <PlayIcon className="h-5 w-5" weight="fill" />
                      Resume
                    </Button>
                  )}
                  <Button
                    onClick={endFocusMode}
                    variant="ghost"
                    size="lg"
                    className="gap-2 text-muted-foreground"
                  >
                    <StopIcon className="h-5 w-5" weight="fill" />
                    End
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Now tasks */}
          <div>
            <h2 className="text-xl font-semibold text-muted-foreground mb-4">
              Focus Tasks
            </h2>
            <div className="space-y-0">
              {nowTodos.length === 0 ? (
                <EmptyState
                  title="No tasks in Now"
                  description="Drag tasks to the Now group to focus on them."
                />
              ) : (
                nowTodos.map((todo) => (
                  <TaskItem
                    key={todo.id}
                    todo={todo}
                    onToggle={handleToggleTodo}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column: Distraction notes */}
        <div className="flex flex-col h-full">
          <Textarea
            value={distractionNotes}
            onChange={(e) => setDistractionNotes(e.target.value)}
            placeholder="Write down any distracting thoughts or tasks that pop into your head..."
            className="flex-1 min-h-[400px] text-lg resize-none border-0 bg-muted focus-visible:ring-0 p-6"
          />
        </div>
      </div>

      {/* Timer complete notification */}
      {isComplete && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-3 rounded-full text-lg font-medium animate-pulse">
          Time&apos;s up! Great focus session!
        </div>
      )}
    </div>
  )
}
