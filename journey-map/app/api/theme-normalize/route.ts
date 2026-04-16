import { APIError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAnthropic, getThemeNormalizeModel } from "@/lib/anthropic";
import { parseThemeV1 } from "@/lib/theme/parse";
import { THEME_NORMALIZE_SYSTEM } from "@/lib/theme/theme-ai-prompt";

export const runtime = "nodejs";

const MAX_INPUT_CHARS = 120_000;

function extractFirstJsonObject(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

function assistantPlainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        typeof b === "object" &&
        b !== null &&
        (b as { type?: string }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string"
    )
    .map((b) => b.text)
    .join("\n");
}

type Body = { rawText?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "Expected { rawText: string }" }, { status: 400 });
  }
  if (rawText.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Input too large (max ${MAX_INPUT_CHARS} characters)` },
      { status: 400 }
    );
  }

  let anthropic;
  try {
    anthropic = getAnthropic();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Missing API key";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  try {
    const msg = await anthropic.messages.create({
      model: getThemeNormalizeModel(),
      max_tokens: 16000,
      system: THEME_NORMALIZE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Convert the following design / theme JSON into journey-map theme v1 as specified.\n\n---\n${rawText}\n---`,
        },
      ],
    });

    const text = assistantPlainText(msg.content);
    if (!text.trim()) {
      return NextResponse.json({ error: "Empty model response" }, { status: 502 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractFirstJsonObject(text));
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON" },
        { status: 422 }
      );
    }

    const parsed = parseThemeV1(parsedJson);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: `Invalid theme after normalization: ${parsed.error}` },
        { status: 422 }
      );
    }

    return NextResponse.json({ theme: parsed.theme });
  } catch (e) {
    if (e instanceof APIError) {
      const status =
        typeof e.status === "number" && e.status >= 400 && e.status < 600
          ? e.status
          : 502;
      return NextResponse.json(
        { error: e.message, model: getThemeNormalizeModel() },
        { status }
      );
    }
    const msg = e instanceof Error ? e.message : "Theme normalization failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
