/* ============================================================
   search.js — local semantic search, 100% in the browser.

   No server, no API key. Loads a small embedding model
   (Xenova/all-MiniLM-L6-v2, ~23MB, cached after first load) via
   transformers.js WASM, embeds the query, and ranks it against
   search-index.json (prebuilt by tools/build-search-index.mjs with
   the SAME model + dtype). Cosine similarity = dot product because
   both index and query vectors are L2-normalised.

   Progressive enhancement: the instant keyword card-filter in
   index.html keeps working with zero dependency on this file. This
   only ADDS a "CONTENT MATCHES" panel that streams in article-level
   hits once the model is ready. Any load failure degrades silently.
   ============================================================ */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

// Browser-only: never look for local model files, always fetch from HF CDN.
env.allowLocalModels = false;

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DTYPE = 'q8';           // MUST match the dtype used in build-search-index.mjs
const TOP_K = 8;
const MIN_SCORE = 0.25;       // hide weak matches rather than force them
const MIN_QUERY = 3;

const input = document.getElementById('searchInput');
const panel = document.getElementById('semanticResults');
const grid = document.querySelector('.notes-wrap');   // card grid + its empty-state
if (input && panel) {
  const gridHide = () => { if (grid) grid.style.display = 'none'; };
  const gridShow = () => { if (grid) grid.style.display = ''; };
  let extractor = null;       // lazy model
  let index = null;           // lazy index.json
  let loading = null;         // in-flight load promise (dedupe)
  let seq = 0;                // race guard for async renders

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function ensureReady() {
    if (extractor && index) return true;
    if (!loading) {
      setStatus('Loading search model… <span class="ss-sub">(first time only, ~23MB)</span>');
      loading = Promise.all([
        pipeline('feature-extraction', MODEL, { dtype: DTYPE }),
        fetch('search-index.json').then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
      ]).then(([ex, idx]) => { extractor = ex; index = idx; })
        .catch(err => { console.warn('[search] load failed', err); loading = null; throw err; });
    }
    await loading;
    return true;
  }

  async function embed(q) {
    const out = await extractor(q, { pooling: 'mean', normalize: true });
    return out.data; // Float32Array, normalised
  }

  function rank(qvec) {
    const chunks = index.chunks;
    const scored = new Array(chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      const v = chunks[i].vec;
      let dot = 0;
      for (let j = 0; j < v.length; j++) dot += qvec[j] * v[j];
      scored[i] = { c: chunks[i], s: dot };
    }
    scored.sort((a, b) => b.s - a.s);
    // one hit per (file#id) — keep the best-scoring chunk of each section
    const seen = new Set();
    const hits = [];
    for (const x of scored) {
      if (x.s < MIN_SCORE) break;
      const key = x.c.file + '#' + x.c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(x);
      if (hits.length >= TOP_K) break;
    }
    return hits;
  }

  function snippet(text, q) {
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const lower = text.toLowerCase();
    let at = -1;
    for (const w of words) { const i = lower.indexOf(w); if (i !== -1) { at = i; break; } }
    const start = at > 60 ? at - 50 : 0;
    let s = text.slice(start, start + 200).trim();
    if (start > 0) s = '… ' + s;
    if (start + 200 < text.length) s += ' …';
    return s;
  }

  function setStatus(html) {
    panel.innerHTML = '<div class="ss-status">' + html + '</div>';
    panel.classList.add('open');
    gridHide();               // suppress the keyword card-filter's noise while searching
  }

  function render(q, hits) {
    if (!hits.length) {
      setStatus('No content matches for “' + esc(q) + '”.');
      return;
    }
    const rows = hits.map(h => {
      const c = h.c;
      const href = c.file + (c.id ? '#' + c.id : '');
      const pct = Math.round(h.s * 100);
      return `<a class="ss-hit" href="${esc(href)}">
        <div class="ss-hit-top">
          <span class="ss-hit-page">${esc(c.page)}</span>
          <span class="ss-hit-sec">${esc(c.title)}</span>
          <span class="ss-hit-score">${pct}%</span>
        </div>
        <p class="ss-hit-text">${esc(snippet(c.text, q))}</p>
      </a>`;
    }).join('');
    panel.innerHTML =
      `<div class="ss-head"><span class="ss-label">Content Matches</span>
       <span class="ss-line"></span><span class="ss-count">${hits.length}</span></div>${rows}`;
    panel.classList.add('open');
    gridHide();
  }

  function hide() { panel.classList.remove('open'); panel.innerHTML = ''; gridShow(); }

  let timer = 0;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < MIN_QUERY) { hide(); return; }
    const my = ++seq;
    timer = setTimeout(async () => {
      try {
        await ensureReady();
        if (my !== seq) return;                 // superseded by a newer keystroke
        const qvec = await embed(q);
        if (my !== seq) return;
        render(q, rank(qvec));
      } catch {
        if (my === seq) hide();                 // silent: keyword card-filter still works
      }
    }, 250);
  });
}
