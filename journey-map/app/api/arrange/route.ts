import { NextResponse } from "next/server";
import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import { getFramework } from "@/lib/frameworks";
import { parseAgentFocus } from "@/lib/frameworks/journey-map/payload";

export const runtime = "nodejs";

type ReqBody = {
  frameworkId: string;
  map: unknown;
  instruction: string;
  focus?: unknown;
};

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.frameworkId || !body?.map || typeof body.instruction !== "string") {
    return NextResponse.json(
      { error: "Expected { frameworkId, map, instruction }" },
      { status: 400 }
    );
  }

  let framework;
  try {
    framework = getFramework(body.frameworkId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown framework";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Validate the incoming map shape before we waste an agent call on garbage input.
  const mapValidation = framework.validateMap(body.map);
  if (!mapValidation.ok) {
    return NextResponse.json(
      { error: `Invalid map: ${mapValidation.reason}` },
      { status: 400 }
    );
  }
  const map = mapValidation.map;

  let focusArg: unknown = undefined;
  if (body.focus !== undefined && body.focus !== null) {
    const fp = parseAgentFocus(body.focus);
    if (!fp.ok) {
      return NextResponse.json({ error: fp.reason }, { status: 400 });
    }
    focusArg = fp.focus;
  }

  try {
    const anthropic = getAnthropic();
    // cache_control isn't in the SDK 0.30.1 type defs but the API supports it.
    // Cast the param object so we can attach cache breakpoints on system + tool schema.
    // Extended thinking lets Sonnet plan the journey structure (phases, lanes,
    // per-cell content) before emitting the tool call. Extended thinking is
    // incompatible with forced tool_choice, so we use "auto" — the system
    // prompt still constrains the agent to emit the tool.
    const createParams = {
      model: getAgentModel(),
      max_tokens: 12000,
      thinking: { type: "enabled", budget_tokens: 6000 },
      system: [
        {
          type: "text",
          text: framework.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: framework.toolName,
          description: framework.toolDescription,
          input_schema: framework.toolSchema,
          cache_control: { type: "ephemeral" },
        },
      ],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: framework.renderUserPayload(
                map,
                body.instruction,
                focusArg
              ),
            },
          ],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const msg = await anthropic.messages.create(createParams);

    const tool = msg.content.find((c) => c.type === "tool_use");
    if (!tool || tool.type !== "tool_use") {
      console.error("[arrange] 502: agent did not return a tool call", {
        content: msg.content,
      });
      return NextResponse.json(
        { error: "Agent did not return a tool call" },
        { status: 502 }
      );
    }

    const input = tool.input as { summary?: string; ops?: unknown };
    if (typeof input.summary !== "string" || !Array.isArray(input.ops)) {
      console.error("[arrange] 502: missing summary or ops array", {
        input,
      });
      return NextResponse.json(
        { error: "Agent tool input missing summary or ops array" },
        { status: 502 }
      );
    }

    // Shape-check every op before we hand it to the client.
    for (let i = 0; i < input.ops.length; i++) {
      if (!framework.validateOpShape(input.ops[i])) {
        console.error("[arrange] 502: malformed op", {
          index: i,
          op: input.ops[i],
          summary: input.summary,
          ops: input.ops,
        });
        return NextResponse.json(
          {
            error: `Agent emitted malformed op at index ${i}`,
            op: input.ops[i],
          },
          { status: 502 }
        );
      }
    }

    // Server-side dry run: catch unknown ids / invalid indices before they hit the UI.
    const dryRun = framework.applyOps(map, input.ops);
    if (!dryRun.ok) {
      console.error("[arrange] 502: op sequence failed", {
        reason: dryRun.reason,
        failedAtIndex: dryRun.failedAtIndex,
        summary: input.summary,
        ops: input.ops,
      });
      return NextResponse.json(
        {
          error: `Agent op sequence failed at index ${dryRun.failedAtIndex}: ${dryRun.reason}`,
          ops: input.ops,
          failedAtIndex: dryRun.failedAtIndex,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      summary: input.summary,
      ops: input.ops,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
