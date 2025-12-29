import { unstable_noStore as noStore } from "next/cache"
import { NextResponse } from "next/server"

import { getAgentPrompts, updateAgentPrompts } from "@/lib/ai/agent-prompts"
import { AGENT_PROMPT_KEYS, type AgentPromptsMap } from "@/types/agent-prompts"

export const runtime = "nodejs"

export async function GET() {
  noStore()
  try {
    const prompts = await getAgentPrompts()
    return NextResponse.json({ prompts })
  } catch (error) {
    console.error("Failed to read agent prompts:", error)
    return NextResponse.json(
      { error: "Failed to read prompts" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  noStore()
  try {
    const body = (await request.json()) as { prompts?: Partial<AgentPromptsMap> }

    if (!body?.prompts || typeof body.prompts !== "object") {
      return NextResponse.json(
        { error: "Missing prompts payload" },
        { status: 400 }
      )
    }

    const filtered: Partial<AgentPromptsMap> = {}
    for (const key of AGENT_PROMPT_KEYS) {
      const incoming = body.prompts[key]
      if (typeof incoming === "string") {
        filtered[key] = incoming
      }
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json(
        { error: "No valid prompt keys provided" },
        { status: 400 }
      )
    }

    const prompts = await updateAgentPrompts(filtered)
    return NextResponse.json({ prompts })
  } catch (error) {
    console.error("Failed to update agent prompts:", error)
    return NextResponse.json(
      { error: "Failed to update prompts" },
      { status: 500 }
    )
  }
}
