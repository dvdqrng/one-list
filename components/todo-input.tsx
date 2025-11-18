"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Sparkles, Loader2, CheckCircle2, Mic, MicOff, XCircle, AlertTriangle } from "lucide-react"
import { processTodoText } from "@/lib/process-todos"
import type { Todo } from "@/lib/types"

interface TodoInputProps {
  existingTodos: Todo[]
  onAddTodos: (todos: Todo[]) => void
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void
}

export function TodoInput({ existingTodos, onAddTodos, onUpdateTodo, isProcessing, setIsProcessing }: TodoInputProps) {
  const [input, setInput] = useState("")
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "timeout" }>({
    message: "",
    type: "success",
  })
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        setIsSupported(true)
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = "en-US"

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setInput((prev) => (prev ? prev + " " + transcript : transcript))
          setIsListening(false)
        }

        recognition.onerror = (event: any) => {
          console.error("[v0] Speech recognition error:", event.error)
          setIsListening(false)
          setFeedback({ message: "Voice input failed. Please try again.", type: "error" })
          setTimeout(() => setFeedback({ message: "", type: "success" }), 3000)
        }

        recognition.onend = () => {
          setIsListening(false)
        }

        recognitionRef.current = recognition
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return

    setIsProcessing(true)
    setFeedback({ message: "", type: "success" })

    try {
      const result = await processTodoText(input, existingTodos)
      console.log("[v0] Processing result:", result)

      // Handle new todos
      if (result.newTodos.length > 0) {
        console.log("[v0] Adding new todos:", result.newTodos)
        onAddTodos(result.newTodos)
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

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListening ? "Listening... speak now!" : "Type or speak naturally... I'll understand what you mean!"
              }
              className={`min-h-[60px] resize-none pr-12 ${isListening ? "ring-2 ring-primary" : ""}`}
              disabled={isProcessing || isListening}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmit()
                }
              }}
            />
            {isSupported && (
              <Button
                type="button"
                size="icon"
                variant={isListening ? "default" : "ghost"}
                className={`absolute right-2 top-2 ${isListening ? "animate-pulse" : ""}`}
                onClick={toggleVoiceInput}
                disabled={isProcessing}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={!input.trim() || isProcessing} className="gap-2 shrink-0">
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden md:inline">Processing...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span className="hidden md:inline">Process</span>
              </>
            )}
          </Button>
        </div>

        {feedback.message && (
          <div className="mt-2 text-sm">
            <span
              className={
                feedback.type === "success"
                  ? "text-primary font-medium flex items-center gap-1"
                  : feedback.type === "timeout"
                    ? "text-orange-500 font-medium flex items-center gap-1"
                    : "text-destructive font-medium flex items-center gap-1"
              }
            >
              {feedback.type === "success" && <CheckCircle2 className="h-4 w-4" />}
              {feedback.type === "timeout" && <AlertTriangle className="h-4 w-4" />}
              {feedback.type === "error" && <XCircle className="h-4 w-4" />}
              {feedback.message}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
