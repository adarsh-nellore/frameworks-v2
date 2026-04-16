// Some shells (including the Claude Code environment) pre-declare
// ANTHROPIC_API_KEY as an empty string. Next.js will then skip loading
// the value from .env.local because the variable already "exists".
// We strip any empty ANTHROPIC_API_KEY before handing off to `next dev`
// so .env.local wins.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const env = { ...process.env };
if (env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY.trim() === "") {
  delete env.ANTHROPIC_API_KEY;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const nextDir = path.resolve(projectRoot, ".next");

// Full `.next` wipe is opt-in so `npm run dev` starts warm (faster, fewer HMR races).
// If you see stale chunk 404s: CLEAN_NEXT=1 npm run dev
if (process.env.CLEAN_NEXT === "1") {
  try {
    rmSync(nextDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only
  }
}

const nextBin = path.resolve(here, "..", "node_modules", ".bin", "next");

const child = spawn(nextBin, ["dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
