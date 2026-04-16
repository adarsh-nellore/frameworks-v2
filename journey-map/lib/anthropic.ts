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
