import { NextRequest, NextResponse } from 'next/server'
import { processTodoText } from '@/lib/process-todos'
import type { Todo } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { input, existingTodos } = body as { input: string; existingTodos: Todo[] }

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: input string required' },
        { status: 400 }
      )
    }

    if (!existingTodos || !Array.isArray(existingTodos)) {
      return NextResponse.json(
        { error: 'Invalid request: existingTodos array required' },
        { status: 400 }
      )
    }

    const result = await processTodoText(input, existingTodos)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error processing todo text:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process todo text' },
      { status: 500 }
    )
  }
}
