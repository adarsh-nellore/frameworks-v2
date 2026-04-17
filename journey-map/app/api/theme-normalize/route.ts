import { APIError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAnthropic, getThemeNormalizeModel } from "@/lib/anthropic";
import {
  ingestSources,
  IngestionError,
  type IngestedSource,
  type RawInput,
} from "@/lib/ingestion";
import { deriveTheme } from "@/lib/theme/derive";
import { THEME_NORMALIZE_SYSTEM } from "@/lib/theme/theme-ai-prompt";
import {
  BRAND_TOOL_DESCRIPTION,
  BRAND_TOOL_NAME,
  brandToolSchema,
  validateBrandExtraction,
} from "@/lib/theme/theme-tool-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

async function parseRequest(
  req: Request
): Promise<{ inputs: RawInput[] }> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const inputs: RawInput[] = [];
    const text = fd.get("text") as string | null;
    if (text && text.trim()) {
      inputs.push({ type: "paste", text, name: "Pasted theme" });
    }
    for (const [key, value] of fd.entries()) {
      if (
        value instanceof File &&
        value.size > 0 &&
        (key === "file" || /^file_\d+$/.test(key))
      ) {
        inputs.push({ type: "file", file: value, name: value.name });
      }
    }
    return { inputs };
  }
  const body = (await req.json()) as { rawText?: string };
  if (body.rawText?.trim()) {
    return { inputs: [{ type: "paste", text: body.rawText, name: "Pasted theme" }] };
  }
  return { inputs: [] };
}

function buildUserContent(sources: IngestedSource[]): unknown[] {
  const content: unknown[] = [
    {
      type: "text",
      text: `Extract the 3 brand colors + fonts from the following design system material.\n\n${sources.length} source${sources.length === 1 ? "" : "s"}:`,
    },
  ];
  for (const s of sources) {
    if (s.kind === "pdf") {
      content.push(
        { type: "text", text: `\n--- ${s.name} (PDF) ---` },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: s.pdfBase64 } }
      );
    } else if (s.kind === "image") {
      content.push(
        { type: "text", text: `\n--- ${s.name} (image) ---` },
        { type: "image", source: { type: "base64", media_type: s.mediaType, data: s.imageBase64 } }
      );
    } else {
      content.push({ type: "text", text: `\n--- ${s.name} ---\n${s.text}` });
    }
  }
  return content;
}

export async function POST(req: Request) {
  let parsed: { inputs: RawInput[] };
  try {
    parsed = await parseRequest(req);
  } catch (e) {
    return NextResponse.json({ error: `Invalid request: ${(e as Error).message}` }, { status: 400 });
  }

  if (parsed.inputs.length === 0) {
    return NextResponse.json({ error: "Provide a file or paste text" }, { status: 400 });
  }

  let sources: IngestedSource[];
  try {
    sources = await ingestSources(parsed.inputs, {
      maxFileBytes: 5 * 1024 * 1024,
      maxTotalBytes: 20 * 1024 * 1024,
      maxSources: 8,
    });
  } catch (e) {
    if (e instanceof IngestionError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let anthropic;
  try {
    anthropic = getAnthropic();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await anthropic.messages.create({
      model: getThemeNormalizeModel(),
      max_tokens: 2000,
      system: THEME_NORMALIZE_SYSTEM,
      tools: [
        {
          name: BRAND_TOOL_NAME,
          description: BRAND_TOOL_DESCRIPTION,
          input_schema: brandToolSchema,
        },
      ],
      tool_choice: { type: "tool", name: BRAND_TOOL_NAME },
      messages: [{ role: "user", content: buildUserContent(sources) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const tool = msg.content.find((c: { type: string }) => c.type === "tool_use");
    if (!tool || tool.type !== "tool_use") {
      return NextResponse.json({ error: "Model returned no tool call" }, { status: 502 });
    }

    const validation = validateBrandExtraction(tool.input);
    if (!validation.ok) {
      return NextResponse.json({ error: `Invalid extraction: ${validation.reason}` }, { status: 502 });
    }

    const brand = validation.brand;
    const theme = deriveTheme({
      primary: brand.primary,
      secondary: brand.secondary,
      accent: brand.accent,
      sansFont: brand.sansFont,
      monoFont: brand.monoFont,
    });

    return NextResponse.json({ brand, theme, notes: brand.notes });
  } catch (e) {
    if (e instanceof APIError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
