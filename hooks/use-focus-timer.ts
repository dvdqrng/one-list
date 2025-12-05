"use client"

import { useEffect, useCallback } from "react"
import { useStore } from "@/lib/store"
// ElectronAPI type is declared globally in types/electron.d.ts

export function useFocusTimer() {
  const {
    focusTimeRemaining,
    focusTimerRunning,
    setFocusTimeRemaining,
    setFocusTimerRunning,
    setFocusMode,
    isFocusMode,
  } = useStore()

  // Sync with Electron main process state on mount
  useEffect(() => {
    const syncState = async () => {
      if (typeof window !== "undefined" && window.electronDB) {
        try {
          const state = await window.electronDB.getFocusState()
          setFocusTimeRemaining(state.timeRemaining)
          setFocusTimerRunning(state.isRunning)
        } catch (error) {
          console.error("Failed to sync focus timer state:", error)
        }
      }
    }

    syncState()
  }, [setFocusTimeRemaining, setFocusTimerRunning])

  // Listen to timer events from main process
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronDB) return

    // Handle timer ticks
    window.electronDB.onFocusTimerTick((timeRemaining) => {
      setFocusTimeRemaining(timeRemaining)
    })

    // Handle timer completion
    window.electronDB.onFocusTimerComplete(() => {
      setFocusTimerRunning(false)
      setFocusTimeRemaining(0)
      // Don't auto-close focus mode - let user decide when to add notes
    })

    // Cleanup listeners on unmount
    return () => {
      if (window.electronDB) {
        window.electronDB.removeFocusTimerListeners()
      }
    }
  }, [setFocusTimeRemaining, setFocusTimerRunning])

  const startTimer = useCallback(async (duration: number = 1500) => {
    if (typeof window !== "undefined" && window.electronDB) {
      try {
        const result = await window.electronDB.startFocusTimer(duration)
        setFocusTimeRemaining(result.timeRemaining)
        setFocusTimerRunning(true)
        setFocusMode(true)
      } catch (error) {
        console.error("Failed to start focus timer:", error)
      }
    }
  }, [setFocusTimeRemaining, setFocusTimerRunning, setFocusMode])

  const pauseTimer = useCallback(async () => {
    if (typeof window !== "undefined" && window.electronDB) {
      try {
        const result = await window.electronDB.pauseFocusTimer()
        setFocusTimeRemaining(result.timeRemaining)
        setFocusTimerRunning(false)
      } catch (error) {
        console.error("Failed to pause focus timer:", error)
      }
    }
  }, [setFocusTimeRemaining, setFocusTimerRunning])

  const resumeTimer = useCallback(async () => {
    if (typeof window !== "undefined" && window.electronDB) {
      try {
        const result = await window.electronDB.resumeFocusTimer()
        setFocusTimeRemaining(result.timeRemaining)
        setFocusTimerRunning(true)
      } catch (error) {
        console.error("Failed to resume focus timer:", error)
      }
    }
  }, [setFocusTimeRemaining, setFocusTimerRunning])

  const resetTimer = useCallback(async () => {
    if (typeof window !== "undefined" && window.electronDB) {
      try {
        const result = await window.electronDB.resetFocusTimer()
        setFocusTimeRemaining(result.timeRemaining)
        setFocusTimerRunning(false)
      } catch (error) {
        console.error("Failed to reset focus timer:", error)
      }
    }
  }, [setFocusTimeRemaining, setFocusTimerRunning])

  const endFocusMode = useCallback(async () => {
    await resetTimer()
    setFocusMode(false)
  }, [resetTimer, setFocusMode])

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }, [])

  return {
    timeRemaining: focusTimeRemaining,
    isRunning: focusTimerRunning,
    isFocusMode,
    formattedTime: formatTime(focusTimeRemaining),
    isComplete: focusTimeRemaining === 0 && !focusTimerRunning,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    endFocusMode,
    formatTime,
  }
}
