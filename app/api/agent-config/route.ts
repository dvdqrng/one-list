import { unstable_noStore as noStore } from "next/cache"
import { NextResponse } from "next/server"

import { getAgentConfig, updateAgentConfig } from "@/lib/ai/agent-config"
import type { AgentConfig } from "@/types/agent-config"

export const runtime = "nodejs"

export async function GET() {
  noStore()
  try {
    const config = await getAgentConfig()
    return NextResponse.json({ config })
  } catch (error) {
    console.error("Failed to read agent config:", error)
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  noStore()
  try {
    const body = (await request.json()) as { config?: Partial<AgentConfig> }
    if (!body?.config || typeof body.config !== "object") {
      return NextResponse.json({ error: "Missing config payload" }, { status: 400 })
    }

    const config = await updateAgentConfig(body.config)
    return NextResponse.json({ config })
  } catch (error) {
    console.error("Failed to update agent config:", error)
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 })
  }
}
