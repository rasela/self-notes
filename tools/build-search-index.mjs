#!/usr/bin/env node
/* ============================================================
   build-search-index.mjs — offline indexer for local semantic search.

   Reads every note *.html in the repo root, splits each into
   <article id="..."> chunks, embeds each chunk with the SAME model
   the browser runs (Xenova/all-MiniLM-L6-v2, mean-pooled + L2-normalised),
   and writes search-index.json.

   The browser (search.js) loads that JSON + the same model and ranks by
   cosine similarity (= dot product, since vectors are normalised). Index
   vectors and query vectors MUST come from the same model, or scores are
   meaningless — that is why both sides are pinned to this exact model id.

   Run:  cd tools && npm install && npm run index   (after adding/editing a note)
   No server, no key. Model is fetched from the HF CDN on first run,
   then cached under tools/node_modules/.cache by transformers.js.
   Writes ../search-index.json (repo root) — commit that file.
   ============================================================ */
import { pipeline } from '@huggingface/transformers';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const MAX_CHARS = 1100;           // chunk cap; MiniLM context is 256 tokens (~1k chars)
const SKIP = new Set(['index.html']);

// ---- tiny HTML helpers (no DOM in node; regex is enough for this site) ----
const ENT = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&mdash;': '—', '&ndash;': '–' };
function decode(s) { return s.replace(/&[a-z#0-9]+;/gi, m => ENT[m] ?? m); }
function strip(html) {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}
// page display name: prefer the card data-title from index.html, else <h1>
function buildTitleMap() {
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const map = {};
  const re = /<a[^>]*class="note-card"[^>]*href="([^"]+)"[\s\S]*?data-title="([^"]*)"/g;
  let m;
  while ((m = re.exec(idx))) map[m[1].replace(/^\//, '')] = decode(m[2]);
  return map;
}
function pageTitle(html, file, map) {
  if (map[file]) return map[file];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? strip(h1[1]) : file.replace(/\.html$/, '');
}
function chunkText(text) {
  if (text.length <= MAX_CHARS) return [text];
  const out = [];
  const parts = text.split(/(?<=[.!?])\s+/);
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).length > MAX_CHARS && cur) { out.push(cur.trim()); cur = ''; }
    cur += (cur ? ' ' : '') + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---- collect chunks ----
const titleMap = buildTitleMap();
const files = readdirSync(ROOT).filter(f => f.endsWith('.html') && !SKIP.has(f));
const records = [];
for (const file of files) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const page = pageTitle(html, file, titleMap);
  const artRe = /<article[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi;
  let a, found = false;
  while ((a = artRe.exec(html))) {
    found = true;
    const id = a[1];
    const inner = a[2];
    const h = inner.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const title = h ? strip(h[1]) : page;
    const body = strip(inner);
    if (body.length < 20) continue;
    for (const t of chunkText(body)) records.push({ file, page, id, title, text: t });
  }
  // pages with no <article id> — index the whole body as one chunk
  if (!found) {
    const body = strip(html.replace(/<head[\s\S]*?<\/head>/i, ''));
    if (body.length >= 20) for (const t of chunkText(body)) records.push({ file, page, id: '', title: page, text: t });
  }
}
console.error(`chunks: ${records.length} from ${files.length} files`);

// ---- embed ----
const round = v => Math.round(v * 1e5) / 1e5;
const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
for (const r of records) {
  const out = await extractor(r.text, { pooling: 'mean', normalize: true });
  r.vec = Array.from(out.data, round);
}
const dim = records[0]?.vec.length ?? 0;
writeFileSync(
  join(ROOT, 'search-index.json'),
  JSON.stringify({ model: MODEL, dim, built: records.length, chunks: records })
);
console.error(`wrote search-index.json  (${records.length} chunks, dim ${dim})`);
