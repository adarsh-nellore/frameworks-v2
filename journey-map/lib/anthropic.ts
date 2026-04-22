import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Default model is Sonnet 4.5 — strong on intent understanding and structured-output reasoning,
// which is exactly the agent's job (parse natural-language intent, map to journey-map architecture,
// emit ops). Override with AGENT_MODEL env var to swap to Opus or Haiku without redeploy.
export const MODEL = "claude-sonnet-4-5";

export function getAgentModel(): string {
  return process.env.AGENT_MODEL || MODEL;
}

/**
 * Model for theme JSON normalization (override with THEME_NORMALIZE_MODEL).
 * Default is Haiku 4.5 on the Anthropic API (`claude-haiku-4-5`). Do not use
 * Bedrock-style IDs like `claude-3-5-haiku-20241022` here — they return 404 from api.anthropic.com.
 */
export function getThemeNormalizeModel(): string {
  return process.env.THEME_NORMALIZE_MODEL || "claude-haiku-4-5";
}

/**
 * Model for deep framework-reasoning stages (Theorist / Critic). Opus by default
 * because these stages need to articulate what a framework IS and critique a
 * board against that ideal — that's where reasoning quality actually matters.
 * Override with REASONING_MODEL to fall back to Sonnet on keys without Opus.
 */
export function getReasoningModel(): string {
  return process.env.REASONING_MODEL || "claude-opus-4-7";
}
