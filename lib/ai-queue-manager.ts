"use client"

import type { AIProcessingJob, QueueConfig, Todo } from "./types"

type JobUpdateCallback = (todoId: string, updates: Partial<Todo>) => void

class AIQueueManager {
  private queue: AIProcessingJob[] = []
  private isProcessing = false
  private batchTimer: NodeJS.Timeout | null = null
  private updateCallback: JobUpdateCallback | null = null

  private config: QueueConfig = {
    batchSize: 10, // Process up to 10 items at once
    batchDelayMs: 5000, // Wait 5s to collect more items before processing
    maxRetries: 3,
    processingTimeoutMs: 30000,
  }

  setUpdateCallback(callback: JobUpdateCallback) {
    this.updateCallback = callback
  }

  enqueue(job: Omit<AIProcessingJob, "id" | "createdAt" | "retryCount">): string {
    const jobWithMetadata: AIProcessingJob = {
      ...job,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retryCount: 0,
    }

    this.queue.push(jobWithMetadata)

    // Mark todo as pending
    this.notifyUpdate(job.todoId, { aiProcessingStatus: "pending" })

    // Schedule batch processing
    this.scheduleBatchProcessing()

    return jobWithMetadata.id
  }

  private scheduleBatchProcessing() {
    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }

    // If we have enough items for a batch, process immediately
    if (this.queue.length >= this.config.batchSize) {
      this.processBatch()
      return
    }

    // Otherwise, wait for more items or timeout
    if (this.queue.length > 0) {
      this.batchTimer = setTimeout(() => {
        this.processBatch()
      }, this.config.batchDelayMs)
    }
  }

  private async processBatch() {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    // Take up to batchSize items from the queue
    const batch = this.queue.splice(0, this.config.batchSize)

    // Mark all as processing
    batch.forEach((job) => {
      this.notifyUpdate(job.todoId, { aiProcessingStatus: "processing" })
    })

    try {
      // Process all jobs in a single batch API call
      const { processBatchTodos } = await import("./process-batch-todos")

      const batchInputs = batch.map((job, index) => ({
        index,
        text: job.inputText,
      }))

      const results = await processBatchTodos(batchInputs)

      // Handle successful results
      batch.forEach((job, index) => {
        const result = results.get(index)

        if (result) {
          // Success - mark as enhanced
          this.notifyUpdate(job.todoId, {
            title: result.title,
            details: result.details,
            priority: result.priority,
            dueDate: result.dueDate,
            category: result.category,
            aiProcessingStatus: "enhanced",
          })
        } else {
          // No result for this job - retry
          if (job.retryCount < this.config.maxRetries) {
            job.retryCount++
            this.queue.push(job)
            this.notifyUpdate(job.todoId, { aiProcessingStatus: "pending" })
          } else {
            this.notifyUpdate(job.todoId, { aiProcessingStatus: "failed" })
          }
        }
      })
    } catch (error) {
      console.error("Error processing batch:", error)

      // On batch failure, retry all jobs individually or mark as failed
      batch.forEach((job) => {
        if (job.retryCount < this.config.maxRetries) {
          job.retryCount++
          this.queue.push(job)
          this.notifyUpdate(job.todoId, { aiProcessingStatus: "pending" })
        } else {
          this.notifyUpdate(job.todoId, { aiProcessingStatus: "failed" })
        }
      })
    }

    this.isProcessing = false

    // Process next batch if there are more items
    if (this.queue.length > 0) {
      this.scheduleBatchProcessing()
    }
  }


  private notifyUpdate(todoId: string, updates: Partial<Todo>) {
    if (this.updateCallback) {
      this.updateCallback(todoId, updates)
    }
  }

  getQueueLength(): number {
    return this.queue.length
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing
  }

  getQueueStats(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
    }
  }

  clearQueue() {
    this.queue = []
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }
}

// Singleton instance
export const aiQueueManager = new AIQueueManager()
