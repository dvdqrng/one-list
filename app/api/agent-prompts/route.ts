import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-static"

function buildDisabledResponse() {
  return NextResponse.json(
    { error: "Agent prompts API is disabled in the desktop build." },
    { status: 405 }
  )
}

export async function GET() {
  return buildDisabledResponse()
}

export async function PUT(request: Request) {
  void request
  return buildDisabledResponse()
}
