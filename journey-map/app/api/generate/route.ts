import { NextResponse } from "next/server";
import { seed } from "@/lib/seed";

// v1 stub: returns the seed map. Future versions will call Anthropic with
// structured-output tool use and build a map from config buttons.
//
// Intended shape:
//   const msg = await getAnthropic().messages.create({
//     model: MODEL,
//     max_tokens: 4096,
//     system: "You are a design-strategy assistant...",
//     tools: [journeyMapTool],
//     tool_choice: { type: "tool", name: "return_journey_map" },
//     messages: [{ role: "user", content: JSON.stringify(body.config) }],
//   });

export async function POST() {
  return NextResponse.json({ map: seed });
}
