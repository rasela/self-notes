# self-notes

A personal knowledge base of self-study notes, published as a static site. Each
note is a **single, self-contained HTML file** (inline `<style>` + `<script>`,
no build step, no shared assets). The site is hosted on a static host that reads
`_redirects` for short URLs (Netlify-style).

## How it works

- **`index.html`** — the landing page. A searchable grid of cards, one card per
  note. The card list is the source of truth for "what notes exist."
- **`<note>.html`** — one file per note. Fully standalone; opening it in a
  browser is all that's needed. No external JS/CSS except Google Fonts.
- **`_redirects`** — short-URL → file mappings, e.g. `/obe /abtb.html 200`.
- **`README.md`** — intentionally minimal.

There is no framework, bundler, or package.json. "Build" = edit HTML. "Deploy" =
commit + push (the host serves the repo root).

## Adding a new note (the standard flow)

When the user drops a markdown/source file and says "add this note":

1. **Create `<slug>.html`** in the repo root, following the page spec below.
   Pick a slug that's short and memorable (`obe-taxonomy.html`).
2. **Add a card to `index.html`** — copy an existing `<a class="note-card">`
   block inside `#notesGrid` (just before the `ADD MORE NOTES` comment) and set
   `href`, `data-title`, `data-tag`, `data-desc`. The card's inner HTML is
   rendered from those data-attributes by the script at the bottom — don't write
   inner markup. `data-title` uses Bebas Neue so keep it short (≈2 words).
3. **Add 1–2 redirects** to `_redirects` for nice short URLs.
4. **Commit + push** (only when asked).

Leave the user's original source file (e.g. in `~/Downloads`) untouched.

## Existing notes

`index.html` (grid) · `morning-routine.html` · `options-mm-guide.html` ·
`dark-psychology.html` · `focus-10.html` · `protocol.html` · `abtb.html`
(Buhlman OBE) · `obe-taxonomy.html` · `absorption.html` (orderflow).

Topics cluster into OBE/astral practice (focus-10, protocol, abtb, obe-taxonomy)
and trading (options-mm-guide, absorption), plus standalone notes.

---

# Page structure spec

The canonical template is **`abtb.html` / `absorption.html`** — match these for
any new note. The three oldest pages (`dark-psychology`, `options-mm-guide`,
`morning-routine`) use different fonts and predate this system; **don't** copy
them — bring new work in line with the abtb/absorption house style.

The fastest way to build a new note: **duplicate `abtb.html`, swap the accent
color, content, and TOC.** Everything below describes what that template already
does, so changes stay consistent.

## Non-negotiables

- **Mobile-first.** Design for a phone screen first; these are read on mobile.
  Single column, generous tap targets (≥40px), `-webkit-tap-highlight-color`
  cleared on interactive rows. Desktop only adds hover affordances inside a
  `@media(min-width:640px)` block — never a separate desktop layout.
- **One file, zero dependencies** beyond Google Fonts. Inline `<style>` and
  `<script>`. No external images — use inline SVG or CSS.
- **Self-contained navigation** — every page links back to `index.html`.

## Required structure (top to bottom)

1. **`<head>`** — `<meta viewport width=device-width, initial-scale=1>`, a
   descriptive `<title>` (`"Topic — Subtitle"`), Google Fonts preconnect +
   stylesheet, then the inline `:root` token block + styles.
2. **Grain overlay** — `body::before` fixed fractal-noise SVG at low opacity
   (the subtle texture every page shares).
3. **Reading-progress bar** — `#prog`, fixed under the nav, fills on scroll.
4. **Fixed top nav** (`height:52px`) — left `.brand` label, right `.hbtn`
   hamburger that animates to an X.
5. **Slide-in TOC drawer** (`.drawer` + `.overlay`) — opens from the right.
   One `.toc-list` link per section with a small `.toc-tag` glyph, plus a
   `← All notes` back-link to `index.html`.
6. **`<main>`** (`padding-top:52px` to clear the nav):
   - **`.hero`** — `.eyebrow` (source/author), big serif `h1` (with an italic
     `<em>` accent word), `.subtitle`, optional `.seq` badge row.
   - Optional **`.warn` banner** for the single most important caveat.
   - **`.wrap`** (`max-width:680–720px; margin:0 auto`) containing
     `<article class="technique">` sections, each with a `.tech-head`
     (`.tech-title` + `.tech-abbr` kicker), separated by `.div` diamond dividers.
   - **`<footer>`** — small-caps credit line + a few cross-links to sibling notes.
7. **Back-to-top FAB** (`#btt`), bottom-right, appears after scrolling.
8. **`<script>`** at the very bottom — progress bar, drawer open/close (+ Esc +
   overlay click), smooth-scroll TOC links (offset ~64px for the nav), any
   tap-to-toggle checklists, back-to-top. Copy this wholesale from `abtb.html`.

## Table of contents — requirements

- Lives in the right-hand drawer, opened by the hamburger; closes on link tap,
  overlay tap, or Esc.
- One entry per top-level `<article>` section, in document order, each with a
  short glyph tag (`◷ ① ⚡ ◆ ✓` etc.).
- Links use `data-a="<section-id>"` and smooth-scroll with a nav offset; section
  `id`s must match.
- Always ends with `← All notes` → `index.html`.

## Type, color & spacing tokens

Defined once in `:root`; reuse them, don't hardcode values.

- **Fonts:** `--serif: 'Lora'` for body/headings (readable long-form),
  `--sans: 'Inter'` for UI/labels/captions, optional `--mono: 'JetBrains Mono'`
  for tags/numbers. Body copy is serif at `clamp(16px,4.5vw,18px)` with
  `line-height:1.85` — prioritize readability over density.
- **Dark theme:** near-black `--bg` (#08–0a), slightly lighter `--bgc` card
  surface, hairline `--border: rgba(255,255,255,.07)`. Text ramps
  `--tp` (primary) → `--ts` (secondary) → `--tm` (muted).
- **One accent per note** (`--acc`) picked to fit the topic — purple for OBE
  (#a78bfa), teal for orderflow (#34d3c4) — plus a shared `--gold` (#c9a96e) for
  secondary emphasis. Semantic extras (`--red`/`--green`) as needed. Swapping
  `--acc` is the main thing that re-themes a duplicated page.
- **Spacing/padding:** page gutters `16px`; content column capped at
  `680–720px` and centered; cards/callouts pad `~14px 16px`; sections spaced
  `~44px` apart. Comfortable, airy — never cramped.
- **Touch & motion:** rounded corners (4–6px), 1px borders, subtle
  `fadeUp`/`fu` entrance animations, transitions ~.2–.4s. Interactive elements
  get `:active` states (mobile) and `:hover` only behind the 640px media query.

## Reusable content blocks (already styled in the template)

`.tip` (accent-topped callout) · `.note` (gold-left callout) · `.caution`
(red-left warning) · `.steps`/`.step` (numbered) · `.rows`/`.row` (table
replacement — never use `<table>`, they don't reflow on mobile) · `.stages`
(staged list) · `.signals`/`.sig` (pill chips) · `.checklist`/`.check`
(tap-to-check) · `.div` (diamond divider). Prefer composing these over inventing
new components.

---

# Conventions for working in this repo

- **Commit + push only when asked.** Co-author trailer is added automatically.
- Keep each note in **one file**; don't factor out shared CSS/JS — duplication
  across pages is intentional and keeps every note portable.
- When editing `index.html`, only touch the card block + data-attributes; the
  render script and search already handle the rest.
- Match the voice of the source note (these are the user's personal study notes,
  often first-person) — don't sanitize it into generic prose.
