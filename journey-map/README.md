# Journey Map Builder

Modular journey maps for design strategists. Every map is **stages × rows × cells** — a flat pixel grid that can be reordered, extended, or regenerated without rewriting layout.

## Run it

```bash
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

## What's here (v1)

- **Modular renderer** — `components/JourneyMap.tsx` drives a CSS grid from the JSON shape in `lib/types.ts`.
- **Seed map** — `lib/seed.ts` ships with a "First-time SaaS onboarding" example.
- **Copy JSON** — round-trip the full map out of the browser.
- **Arrange agent** — `POST /api/arrange` takes the current map + a natural-language instruction and returns a revised map (structured tool-use against Claude Sonnet 4.5). The Toolbar has an input + preset chips that hit this endpoint.
- **Generate stub** — `POST /api/generate` returns the seed map, ready to swap for real config-driven generation.
- **Design tokens (theme v1)** — Chrome colors, canvas washes, glass, shadows, and per–row-kind lane colors are driven by CSS variables on `:root`. Use the **palette** control in the top bar to import a `theme.v1.json`, reset to defaults, download the default token file as a template, or export a **handoff JSON** (map + theme + readme). Tokens persist in `localStorage` under `journey-map-theme-v1`. See `lib/theme/` for the schema, `parseThemeV1`, and `applyTheme`.

## Data shape

```ts
type JourneyMap = {
  id: string;
  title: string;
  persona: string;
  stages: { id, label }[];              // columns
  rows:   { id, label, kind }[];        // dimensions
  cells:  { id, stageId, rowId, text }[]; // flat pixels
};
```

Reordering is rearranging `stages`/`rows`. Cells look up by `(stageId, rowId)`. Adding/removing a stage or row mutates one array.

## What's next

- Config buttons (industry, persona, stages, lens) that compose prompts for `/api/generate`.
- Drag-to-rearrange as an alternative to the intent input.
- PDF / PNG export.
- Customer-data inputs → auto-populated cells.
