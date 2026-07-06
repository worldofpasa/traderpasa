# Design System — Pasa Trader ("Copper Control")

## Product Context
- **What this is:** Self-hosted operating system for automated trading — evidence
  collection, AI synthesis, proposed orders, deterministic risk validation, broker
  execution, dashboards, and safety controls.
- **Who it's for:** A single technical operator self-hosting their own trading automation.
- **Space/industry:** Trading automation / fintech infrastructure (not financial advice,
  not custody, not a marketplace).
- **Project type:** Data-dense web app (Next.js App Router) with a small set of
  marketing-lite surfaces (sign-in, setup/onboarding).

## Aesthetic Direction
- **Direction:** Industrial / utilitarian precision with a warm copper identity.
- **Decoration level:** Minimal. Flat, opaque, hairline-bordered surfaces on all
  data screens. NO glassmorphism, NO gradients, NO emoji on data screens.
- **Ambient gradient:** Allowed ONLY on sign-in, setup/onboarding, and empty states.
  Soft, low-opacity copper/rose/indigo radial blooms (Gemini-style). Never behind tables.
- **Mood:** Calm, precise, trustworthy instrumentation. A control room, not a consumer app.
- **Theme:** Dark-first, full light mode (toggle in the dashboard sidebar; persisted in
  `localStorage` under `pasa-theme`, applied pre-paint in `layout.tsx`).

## Typography
- **UI / body:** Geist (400/500/600/700) via `next/font/google` (`--font-sans`).
- **Numeric / data / code:** Geist Mono with `font-feature-settings: "tnum" 1` (`--font-mono`).
  Use for ALL prices, quantities, tickers, IDs, and timestamps — not just code.
- **Scale:** display 24/600 (-0.02em) · h1 19/600 (-0.02em) · h2 13.5/600 · body 14/400-500
  · small 12.5/400 · label 11/600 uppercase 0.06em.

## Color
- **Approach:** Restrained. Warm neutral surfaces carry everything; one copper accent.
- **Accent (copper):** dark `#c47a4a`, light `#a85d34`. Primary actions, focus rings,
  active nav ONLY. Copper is NEVER a status color.
- **Neutrals (dark):** bg `#16130f`, surface `#1e1a15`, surface-2 `#2a241d`,
  line `#2c261f`, line-strong `#3a3228`, text `#ede8e1`, muted `#a89c8c`, faint `#756a5c`.
- **Neutrals (light):** bg `#faf7f2`, surface `#ffffff`, surface-2 `#f5f0e9`,
  line `#ece6dd`, line-strong `#ddd5c9`, text `#221c16`, muted `#5d544a`, faint `#a39a8d`.
- **Semantic (reserved — never used for branding):**
  - **up / profit / connected / pass:** green — dark `#43bd82`, light `#2f8f5b`
  - **down / loss / LIVE / hard-block / error / unprotected:** red — dark `#ef5a5a`, light `#c0413f`
  - **warning / delayed / stale:** gold — dark `#e2b13c`, light `#b9831f`
- **Dark mode is default.** Light mode mirrors all tokens.

## Token mapping (implementation)
Base tokens (`--bg`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--text`,
`--muted`, `--faint`, `--accent`, `--up`, `--down`, `--warn`, plus `*-bg` tints) are defined
per theme in `globals.css`. Legacy `--color-*` names (from the prior parchment system) are
**aliased** to these base tokens so existing component classes adopt Copper Control without
rewrites. When adding CSS, prefer the base tokens.

## Ambient Gradient (auth / onboarding / empty states ONLY)
```
radial-gradient(58rem 40rem at 6% -10%, rgba(196,122,74,0.16), transparent 60%),
radial-gradient(48rem 36rem at 98% -4%, rgba(214,150,170,0.12), transparent 58%),
radial-gradient(60rem 50rem at 72% 112%, rgba(120,140,205,0.08), transparent 60%)
```

## Spacing
- **Base unit:** 4px. **Density:** Compact (data-dense).

## Layout
- **Approach:** Grid-disciplined. Persistent left-sidebar app shell + dense main.
  Sidebar collapses to a mobile drawer under 1024px.
- **Border radius:** inputs/buttons 8px · cards/panels 10-12px · badges/pills 999px.

## Motion
- **Approach:** Minimal-functional. **Keep:** the LIVE badge pulse (a real safety signal).
- No decorative animation, no hover-lift on cards.

## Icons
- **Lucide** line icons (`lucide-react`). 16px in nav, `currentColor`. No emoji.

## Component Rules
- Buttons: solid copper for primary (no gradient fill); bordered surface-2 for secondary.
- Cards/panels: flat, opaque, 1px hairline border, no backdrop-blur.
- Dialogs: native `<dialog>` for focus-trapping + escape handling.
- Tables: monospace tabular numerics, right-aligned numbers, hairline row borders.
- Badges: paper=copper-tint, live=red+pulse, pass/connected=green, warn=gold, block/error=red.
- Risk: a hard-block must visibly disable the execute action (red badge + disabled button).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-05 | Initial design system "Copper Control" created | Chosen via /design-consultation after comparing 3 rendered variants. Copper brand on flat opaque surfaces; gradient reserved for auth/onboarding/empty; green/gold/red reserved strictly for P&L and risk semantics. |
| 2026-06-05 | Merged `main` (parchment system + structural work); kept Copper Control as the design, absorbed main's native dialogs, form validation, responsive sidebar, AriaSync, and extracted-class architecture by aliasing legacy `--color-*` tokens to Copper Control base tokens. | Keep the approved design while adopting main's functional/accessibility improvements. |
