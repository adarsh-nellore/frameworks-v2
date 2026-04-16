# Journey Map — Design System

A cool-neutral, editorial system. Chrome is grayscale (canvas, copilot, headers). Color lives in the journey lanes — each row kind carries a distinct hue to aid scanning. Inspired by v2.ericsin.com's tone.

## Source of truth

All tokens live in CSS custom properties on `:root` in `app/globals.css` and are mapped into Tailwind via `tailwind.config.ts` `theme.extend.colors`, `boxShadow`, and `borderRadius`. Use the Tailwind class (`bg-canvas`, `text-ink-primary`, `border-border-soft`, etc.) — never arbitrary hex.

## Palette

### Neutrals (chrome)

| Token | Value | Usage |
| --- | --- | --- |
| `--canvas` | `#fafafa` | Page background — the board |
| `--surface` | `#ffffff` | Cards, panels, copilot |
| `--surface-subtle` | `#f9f8f9` | Secondary surface (inputs, muted cards) |
| `--surface-hover` | `#f1f0f2` | Hovered surface |
| `--ink-primary` | `#282a2f` | Headings, primary body |
| `--ink-secondary` | `#3e424b` | Secondary body, labels |
| `--ink-muted` | `#8c8b8c` | Tertiary, metadata, eyebrows |
| `--border-soft` | `#e8e8ea` | Default card/panel border |
| `--border-medium` | `#d4d4d6` | Hover border, dividers |

### Row-kind hues (content)

Defined in `lib/row-kind-theme.ts`. Each kind gets: icon component, accent text, accent border (the 3px left rail), tint background (pale fill), chip bg + text (kind icon chip), and highlight bg + text (for inline `==highlight==` markup).

| Kind | Hue | Icon |
| --- | --- | --- |
| actions | sky | Activity |
| touchpoints | violet | Radio |
| thoughts | amber | MessageCircle |
| emotions | rose | Heart |
| pain_points | red | AlertTriangle |
| opportunities | emerald | Lightbulb |
| metrics | teal | BarChart3 |
| stakeholders | indigo | Users |
| systems | zinc | Server |
| channels | cyan | Signal |
| decisions | fuchsia | GitBranch |
| artifacts | stone | FileText |

All card body backgrounds are `bg-{color}-50`. Rails are `border-{color}-400`. Chips are `bg-{color}-100 text-{color}-700`. Highlights are `bg-{color}-200/80 text-{color}-900`.

## Typography

- Sans: **Inter** (`var(--font-sans)`) — the body grotesque.
- Mono: **JetBrains Mono** (`var(--font-mono)`) — eyebrows, labels, numeric badges.

### Type scale

| Role | Size | Weight | Tracking | Usage |
| --- | --- | --- | --- | --- |
| Display | 36px / 1.1 | 600 | -0.02em | Canvas title (`h1`) |
| Body | 14px / 1.5 | 400 | 0 | Default text |
| Small | 12px / 1.4 | 400 | 0 | Secondary |
| Micro | 11px / 1.4 | 500 | -0.01em | Cell body |
| Eyebrow | 10px / 1 | 500 | 0.22em uppercase | Section labels (`font-mono`) |
| Badge | 9px / 1 | 400 | 0.1em | Numeric badges (`font-mono tabular-nums`) |

## Spacing

Tailwind's default 4px scale. Canvas uses these multiples:

- Card padding: `p-3` (12px)
- Card gap: `gap-3` (12px) between cells in a row, `gap-2` (8px) between rows
- Panel padding: `p-5` (20px) for the copilot
- Page padding: `px-6 py-6` (24px)

## Radii

| Token | Value | Usage |
| --- | --- | --- |
| `rounded-md` | 6px | Small buttons, inputs |
| `rounded-lg` | 8px | Medium buttons, pills |
| `rounded-xl` | 12px | Cards (cells, empty slots) |
| `rounded-2xl` | 16px | Panels (copilot) |

## Elevation

Very subtle — the system leans on fills and hairline borders, not drop shadows.

| Token | Value |
| --- | --- |
| `--shadow-card` | `0 1px 2px rgba(40, 42, 47, 0.04)` |
| `--shadow-card-hover` | `0 4px 12px rgba(40, 42, 47, 0.08)` |
| `--shadow-panel` | `0 1px 3px rgba(40, 42, 47, 0.04), 0 8px 24px -8px rgba(40, 42, 47, 0.08)` |

## Layout geometry

The viewport is the canvas — `app/page.tsx` mounts `fixed inset-0` and chrome floats over the canvas as glass overlays.

- **Canvas card width**: 200px (`CARD_W` in `JourneyMap.tsx`)
- **Row label column width**: 160px (`LABEL_W`)
- **Cell gutter**: 12px (`GUTTER_W`)
- **Cell min-height**: 120px
- **Copilot panel width**: 640px (max `calc(100vw - 2rem)`)
- **Floating offsets**:
  - `TopBar`: `top-3 left-1/2 -translate-x-1/2`
  - `Copilot`: `bottom-5 left-1/2 -translate-x-1/2`
  - `ZoomControls`: `bottom-5 right-5`

## Glass

Two utility classes in `app/globals.css`:

- `.glass` — default frosted surface (zoom controls, secondary chrome).
  - 62% white + `backdrop-filter: blur(20px) saturate(180%)`.
- `.glass-strong` — higher opacity for legibility (top bar, copilot).
  - 78% white + `backdrop-filter: blur(28px) saturate(180%)`.

Both ship with an inset highlight + soft drop shadow. They read against the canvas's soft radial gradient backdrop — keep the gradient or glass loses its refraction.

Apply `.glass-strong` whenever text inside the panel must remain crisp (input fields, chat bubbles). Use `.glass` for icon-only or numeric chrome.

## Canvas (pan + zoom)

Implemented in `components/Canvas.tsx` + `lib/zoom-context.tsx`. No external library — CSS transforms.

- **Zoom**: `Cmd/Ctrl + wheel`, anchored at the cursor. Range `[0.25, 2]`, step `1.08`.
- **Pan**: wheel without modifier, OR click-drag on empty canvas (anything not matching `[data-block],[data-row],[data-stage],[data-empty-slot],[data-floating]`).
- **Auto-fit**: on mount, the Canvas scales the framework to fit the viewport with a 14% margin.
- **dnd-kit**: `JourneyMap.tsx` registers a custom `Modifier` that divides drag deltas by the current scale, so cells follow the cursor 1:1 at any zoom level.
- **`data-floating`**: any fixed-position chrome should set this attribute so canvas pan/scroll handlers ignore pointer events on it.

## Components

### Card (cell)
- `rounded-xl`, `border border-border-soft`, `bg-{kind tint}`
- 3px colored left rail via `border-l-[3px] border-{kind accent}`
- `p-3` body padding
- Top-left: kind icon chip (`h-5 w-5 rounded-md bg-{kind chip-bg}`)
- Top-right: numeric badge (`font-mono text-[9px] text-ink-muted`)
- Body text: `text-[12px] leading-snug text-ink-primary`
- Inline emphasis: `**bold**` and `==highlight==` (see `lib/cell-text.tsx`)

### Stage header
- `min-h-[40px]`, `px-3 py-2`, `bg-surface border border-border-soft rounded-lg`
- Number in `font-mono text-[10px] text-ink-muted`
- Label in `text-[13px] font-medium text-ink-primary`

### Row label
- Plain, left-aligned, no background
- Kind icon (colored) + label in `text-[13px] text-ink-secondary`

### Copilot (chat layout)
- `rounded-2xl border border-border-soft bg-surface shadow-panel`
- Header strip (COPILOT eyebrow only) — no subtitle
- Scrollable chat area — user messages right-aligned, assistant left-aligned
- 3–4 suggestion pills above the input (only shown when chat is empty or idle)
- Text input pinned to the bottom with send button

### Buttons

- **Primary**: `bg-ink-primary text-white hover:bg-[#1b1c20]`
- **Ghost**: `border-border-soft bg-surface hover:bg-surface-subtle text-ink-secondary`
- **Icon send**: `bg-ink-primary text-white rounded-lg h-7 w-7`

## Motion

- Spring for cell / stage reorder: `{stiffness: 520, damping: 34, mass: 0.7}`
- Chat message entrance: `{opacity: [0→1], y: [4→0]}`, 180ms ease-out
- Pill stagger: 30ms delay per pill
- Respect `useReducedMotion()` — skip stagger, keep opacity fade only

## What NOT to use

- No `slate-900` hardcoded anywhere — use `ink-primary` or `bg-ink-primary`.
- No warm cream (`#f7f5f1`) anywhere — the system is cool neutral.
- No decorative gradients or heavy shadows.
- No loud accent color in chrome — color is reserved for row kinds.
- No `text-3xl`/`text-4xl` (arbitrary scale) — use the type scale above.
