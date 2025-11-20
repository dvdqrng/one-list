"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { ArrowRightIcon, SpinnerIcon, CheckCircleIcon, MicrophoneIcon, MicrophoneSlashIcon, XCircleIcon, WarningIcon, XIcon } from "@phosphor-icons/react"
import type { Todo, ProcessResult } from "@/lib/types"

interface TodoInputProps {
  existingTodos: Todo[]
  onAddTodos: (todos: Todo[]) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void
  isVisible: boolean
  onToggleVisibility: () => void
}

export function TodoInput({ existingTodos, onAddTodos, onUpdateTodo, isProcessing, setIsProcessing, isVisible, onToggleVisibility }: TodoInputProps) {
  const [input, setInput] = useState("")
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "timeout" }>({
    message: "",
    type: "success",
  })
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    // Check if MediaRecorder is supported
    if (typeof window !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setIsSupported(true)
    }

    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const startAudioVisualization = (stream: MediaStream) => {
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(stream)

    analyser.fftSize = 256
    source.connect(analyser)

    audioContextRef.current = audioContext
    analyserRef.current = analyser

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const updateAudioLevel = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setAudioLevel(average / 255) // Normalize to 0-1
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
      }
    }

    updateAudioLevel()
  }

  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    setAudioLevel(0)
  }

  const toggleVoiceInput = async () => {
    if (isListening) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      stopAudioVisualization()
      setIsListening(false)
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioChunksRef.current = []

        // Start audio visualization
        startAudioVisualization(stream)

        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          stream.getTracks().forEach(track => track.stop())
          stopAudioVisualization()

          // Send to OpenAI Whisper
          try {
            console.log('[v0] Sending audio to transcribe, size:', audioBlob.size, 'bytes')

            // Try Electron IPC first (production), fallback to API route (development)
            if (typeof window !== 'undefined' && (window as any).electronDB?.transcribeAudio) {
              console.log('[v0] Using Electron IPC for transcription')
              const arrayBuffer = await audioBlob.arrayBuffer()
              const data = await (window as any).electronDB.transcribeAudio(arrayBuffer)
              console.log('[v0] Transcription result:', data)
              if (data.text) {
                setInput((prev) => (prev ? prev + " " + data.text : data.text))
              }
            } else {
              console.log('[v0] Using API route for transcription (dev mode)')
              const formData = new FormData()
              formData.append('audio', audioBlob, 'recording.webm')

              const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
              })

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
                console.error('[v0] Transcription API error:', errorData)
                throw new Error(`Transcription failed: ${errorData.error || response.statusText}`)
              }

              const data = await response.json()
              console.log('[v0] Transcription result:', data)
              if (data.text) {
                setInput((prev) => (prev ? prev + " " + data.text : data.text))
              }
            }
          } catch (error) {
            console.error('[v0] Transcription error:', error)
            setFeedback({
              message: error instanceof Error ? error.message : "Voice transcription failed. Please try again.",
              type: "error"
            })
            setTimeout(() => setFeedback({ message: "", type: "success" }), 4000)
          }
        }

        mediaRecorder.start()
        setIsListening(true)
      } catch (error) {
        console.error('[v0] Microphone access error:', error)
        setFeedback({
          message: "Microphone access denied. Please allow microphone permissions.",
          type: "error"
        })
        setTimeout(() => setFeedback({ message: "", type: "success" }), 4000)
      }
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return

    setIsProcessing(true)
    setFeedback({ message: "", type: "success" })

    try {
      // Note: For bulk processing via TodoInput, we still call the AI immediately
      // because it analyzes the whole input and determines new todos vs updates
      // This is different from TodoListInput which creates individual todos

      let result: ProcessResult;

      // Use Electron IPC if available
      if (typeof window !== 'undefined' && (window as any).electronDB?.processTodoText) {
        console.log('[v0] Using Electron IPC for todo processing')
        result = await (window as any).electronDB.processTodoText(input, existingTodos)
      } else {
        // Fallback to API route for development/web
        console.log('[v0] Using API route for todo processing (dev mode)')
        const response = await fetch('/api/process-todo-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input, existingTodos })
        })

        if (!response.ok) {
          throw new Error('Failed to process todo text')
        }

        result = await response.json()
      }

      console.log("[v0] Processing result:", result)

      // Handle new todos - these come from AI already processed
      if (result.newTodos.length > 0) {
        console.log("[v0] Adding new todos:", result.newTodos)
        // Mark them as already enhanced since they came from AI
        const enhancedTodos = result.newTodos.map(todo => ({
          ...todo,
          aiProcessingStatus: "enhanced" as const,
        }))
        onAddTodos(enhancedTodos)
      }

      // Handle updates with completion status
      if (result.updates.length > 0) {
        result.updates.forEach((update) => {
          // If the update includes marking as completed, handle it specially
          if (update.updates.completed !== undefined) {
            onUpdateTodo(update.id, { ...update.updates })
          } else {
            onUpdateTodo(update.id, update.updates)
          }
        })
      }

      // Set detailed feedback
      const feedbackParts = []
      if (result.newTodos.length > 0) {
        feedbackParts.push(`✓ Added ${result.newTodos.length} new ${result.newTodos.length === 1 ? "task" : "tasks"}`)
      }
      if (result.updates.length > 0) {
        feedbackParts.push(`✓ Updated ${result.updates.length} ${result.updates.length === 1 ? "task" : "tasks"}`)
      }

      if (feedbackParts.length === 0) {
        feedbackParts.push("✓ Processed successfully")
      }

      setFeedback({ message: feedbackParts.join(" • "), type: "success" })

      setInput("")
      setTimeout(() => setFeedback({ message: "", type: "success" }), 4000)
    } catch (error) {
      console.error("[v0] Error processing todos:", error)

      // Check if it's a timeout error
      const isTimeout = error instanceof Error && error.message.includes("timed out")

      setFeedback({
        message: isTimeout
          ? "Request timed out. The AI took too long to respond. Please try again."
          : "Failed to process your request. Please check your connection and try again.",
        type: isTimeout ? "timeout" : "error"
      })
      setTimeout(() => setFeedback({ message: "", type: "success" }), 6000)
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isVisible) return null

  // Calculate size based on audio level (base size + dynamic scaling)
  const baseSize = 600
  const dynamicSize = baseSize + (audioLevel * 800)

  return (
    <>
      {/* Audio visualization - pulsating circle */}
      {isListening && (
        <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-40 flex justify-center">
          <div
            className="rounded-full animate-pulse"
            style={{
              width: `${dynamicSize}px`,
              height: `${dynamicSize}px`,
              transform: `translateY(50%) scale(${1 + audioLevel * 0.2})`,
              background: `radial-gradient(circle, hsl(210 100% 50% / ${0.8 + audioLevel * 0.2}) 0%, hsl(210 100% 50% / ${0.4 + audioLevel * 0.4}) 50%, hsl(210 100% 50% / 0) 100%)`,
              filter: `blur(${20 + audioLevel * 30}px)`,
              flexShrink: 0,
              transition: 'transform 50ms ease-out, filter 50ms ease-out',
            }}
          />
        </div>
      )}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4">
      <div className="flex items-center gap-2 bg-background border rounded-full shadow-lg px-4 py-2">
        <div className="relative flex-1 flex items-center">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isListening ? "Listening... speak now!" : "Type or speak naturally... I'll understand what you mean!"
            }
            className={`w-full resize-none pr-20 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-0 px-0 py-1.5 leading-normal text-sm ${isListening ? "ring-2 ring-primary rounded-full" : ""}`}
            rows={1}
            disabled={isProcessing || isListening}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit()
              }
            }}
          />
          <div className="absolute right-1 flex items-center gap-1">
            {isSupported && (
              <Button
                type="button"
                size="icon"
                variant={isListening ? "default" : "ghost"}
                className={`h-7 w-7 rounded-full ${isListening ? "animate-pulse" : ""}`}
                onClick={toggleVoiceInput}
                disabled={isProcessing}
              >
                {isListening ? <MicrophoneSlashIcon className="h-1.5 w-1.5" weight="fill" /> : <MicrophoneIcon className="h-1.5 w-1.5" weight="fill" />}
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isProcessing}
              size="icon"
              className="h-7 w-7 rounded-full"
            >
              {isProcessing ? (
                <SpinnerIcon className="h-1.5 w-1.5 animate-spin" weight="bold" />
              ) : (
                <ArrowRightIcon className="h-1.5 w-1.5" weight="bold" />
              )}
            </Button>
          </div>
          {feedback.message && (
            <div className="absolute -top-12 left-0 right-0 px-4 py-2 bg-background border rounded-full shadow-lg">
              <span
                className={
                  feedback.type === "success"
                    ? "text-primary font-medium flex items-center gap-1.5 text-sm"
                    : feedback.type === "timeout"
                      ? "text-warning font-medium flex items-center gap-1.5 text-sm"
                      : "text-destructive font-medium flex items-center gap-1.5 text-sm"
                }
              >
                {feedback.type === "success" && <CheckCircleIcon className="h-3.5 w-3.5" weight="fill" />}
                {feedback.type === "timeout" && <WarningIcon className="h-3.5 w-3.5" weight="fill" />}
                {feedback.type === "error" && <XCircleIcon className="h-3.5 w-3.5" weight="fill" />}
                {feedback.message}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
