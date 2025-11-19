import { NextRequest, NextResponse } from 'next/server'
import { processBatchTodos, BatchTodoInput } from '@/lib/process-batch-todos'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { inputs } = body as { inputs: BatchTodoInput[] }

    if (!inputs || !Array.isArray(inputs)) {
      return NextResponse.json(
        { error: 'Invalid request: inputs array required' },
        { status: 400 }
      )
    }

    const results = await processBatchTodos(inputs)

    // Convert Map to array of results
    const resultsArray = Array.from(results.entries()).map(([index, result]) => ({
      index,
      ...result
    }))

    return NextResponse.json({ results: resultsArray })
  } catch (error) {
    console.error('Error processing todos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process todos' },
      { status: 500 }
    )
  }
}
