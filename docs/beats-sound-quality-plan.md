# Binaural Beats — Sound-Quality Improvement Plan

> **For the agent picking this up:** This is a self-contained work order. Read it
> top to bottom, then implement against `beats.html` (single file, no build step).
> All decisions below were made *with the repo owner* — don't re-litigate them,
> just build. Where line numbers are given they are from the state of `beats.html`
> at the time of writing (≈1371 lines); they will drift as you edit — match on the
> function/symbol name, not the number.
>
> Repo conventions (see `CLAUDE.md`): one HTML file + shared shell, mobile-first,
> **branch → PR → Netlify preview** is the default workflow. Cut a fresh branch off
> latest `main`, implement, push, open a PR, and share the Netlify Deploy Preview
> link. Do **not** commit to `main`.

---

## 0. Context — what this player is

`beats.html` is an offline-render binaural-beats player. It does **not** synthesize
live (iOS suspends `AudioContext` on screen-lock). Instead it:

1. Renders the whole session offline (sample-by-sample, or via
   `OfflineAudioContext`) into a **stereo 16-bit WAV held in memory**,
2. Wraps it in a Blob → object URL,
3. Plays it through a hidden `<audio id="bg-audio">` element so the OS grants
   background playback + lock-screen controls with the screen off.

Two modes share one carrier control:

- **Manual** (`renderManual`) — a 10 s seamless unit is **tiled** across the chosen
  duration into one finite file (`loop=false`), with an equal-power end-fade baked
  into the tail. Finite file = the OS stops it on time even with JS timers throttled.
- **Journey** (`renderJourney`) — the whole multi-stage ladder (stage holds + 15 s
  glides + optional 25 s end-fade) is baked into one continuous file via **phase
  accumulation** (per-sample `Math.sin(phase)`), so there are no chunk-boundary
  clicks.

Key constants (top of the `<script>`): `RENDER_SR = 8000`, `renderRate` (set by
`probeRenderRate()` to the lowest rate the device accepts — effectively 8000),
`MANUAL_LOOP = 10`, `GLIDE_SEC = 15`, `END_FADE_SEC = 25`, `MANUAL_MIN/MAX/STEP`.

Quantization helpers: `pcm16(s)` (clamp + 16-bit), `pcm16d(s)` (TPDF-dithered
16-bit — **use this for all signal writes**).

---

## 1. What's already good (don't break it)

- **Phase-accumulation journey synth** — perfectly continuous across the whole file,
  no clicks. (`renderJourney`)
- **TPDF dither** (`pcm16d`) + **equal-power fades** (`Math.sin(a·π/2)` /
  `Math.cos(a·π/2)`) — smooth fade-to-silence, no quantization grain.
- **Hard L/R panning** and **integer-cycle tiling** — seamless manual loop, clean
  beat separation. (Any integer-or-half-Hz frequency × 10 s = integer cycles, so the
  10 s unit always wraps without a click. Preserve this property.)
- **Pure band-limited sines** — no synthesis aliasing.

When you add the bed and envelopes below, **keep these intact**. In particular:
keep `pcm16d` on every signal sample, keep the equal-power fade curves, and keep the
"bed runs continuously, tones tile" rule (see §4) so the manual loop stays seamless.

---

## 2. Decisions already made (owner-approved)

| Topic | Decision |
|---|---|
| **Render sample rate** | **Keep 8 kHz for now.** Do *not* raise it in this work. Pure low-frequency sines are well-sampled at 8 kHz; the only risk is the playback 8k→48k resample, which is acceptable on modern devices. The rate/memory tradeoff is a **separate future task** — see §7. |
| **Comfort layer** | **Add a background "bed" selector** styled like the existing carrier pills: **None / Brown / Pink / Pad**. Default **None**. (White noise intentionally excluded — it sounds muffled at 8 kHz. Brown noise and a low-harmonic pad are excellent at 8 kHz; pink is acceptable, slightly dark.) |
| **Envelopes** | Add a gentle **fade-in to manual mode** (it currently has none); keep journey's existing 0.4 s fade-in and the equal-power end fades. |
| **Scope** | Manual **and** Journey both get the bed + envelope work. |
| **Fidelity** | Audit + minor polish (see §6). No behavioural regressions when bed = None. |

**Hard requirement:** when **bed = None**, the output must be byte-for-byte the same
character as today (carrier at full scale, no fade-in regression that changes the
existing manual sound beyond the new fade-in). Bed = None is the safe default and the
"nothing changed" path.

---

## 3. The bed selector (UI)

Mirror the **carrier** pattern. The carrier section lives in
`#carrier-section` with `.carrier-row` + `.cpill` buttons and a `setCarrier()`
handler; copy that structure.

### Markup
Add a **Texture** block (shared across both modes, same as carrier — put it next to
`#carrier-section`, inside the player card, before the mode tabs):

```html
<div id="bed-section">
  <div class="field-label">Texture <span class="carrier-now" id="bed-val">None</span></div>
  <div class="carrier-row" id="bed-row">
    <button class="cpill active" id="bed-none"  onclick="setBed('none')">None</button>
    <button class="cpill"        id="bed-brown" onclick="setBed('brown')">Brown</button>
    <button class="cpill"        id="bed-pink"  onclick="setBed('pink')">Pink</button>
    <button class="cpill"        id="bed-pad"   onclick="setBed('pad')">Pad</button>
  </div>
</div>
```

(Four pills won't fit one row as nicely as three on a narrow phone — either let them
wrap with `flex-wrap:wrap` on `.carrier-row` *scoped to `#bed-row` only*, or use a
2×2 grid. Test at 360 px width. Reuse existing `.cpill` styles; don't invent new
ones unless wrapping needs a tweak.)

### Optional: bed level slider
Add a "Bed level" slider inside the existing `#finetune` panel (only meaningful when
bed ≠ none). Range 0–40 %, default ~20 %. If you skip the slider for v1, hardcode
`bedLevel = 0.20` and ship the selector alone — the selector is the must-have.

### State + handler
```js
let bedType  = 'none';   // 'none' | 'brown' | 'pink' | 'pad'
let bedLevel = 0.20;     // 0..0.40, peak amplitude of the bed

function setBed(type) {
  bedType = type;
  ['none','brown','pink','pad'].forEach(t =>
    document.getElementById('bed-'+t).classList.toggle('active', t === type));
  document.getElementById('bed-val').textContent =
    { none:'None', brown:'Brown noise', pink:'Pink noise', pad:'Warm pad' }[type];
}
```

- **Persist** the choice in `localStorage` (optional, nice-to-have — follow the
  `LS_KEY` pattern already used for custom journeys).
- **Lock during playback:** the bed is baked into the file, so it can't change
  mid-session. `#bed-section` must be added to the `lockSetup()` list (it currently
  locks `'carrier-section', 'manual-mode', 'journey-mode'`, the mode tabs, and the
  diag row). Add `'bed-section'`.
- Add `setBed` to the init sequence so the default ('none') paints correctly, and
  restore from localStorage if present.

---

## 4. Bed synthesis + mixing (the core audio work)

Both renderers must mix the bed **into both ears, per sample**, with proper headroom.

### Headroom rule (prevents clipping)
Each channel currently carries one full-scale sine (peak ±1.0). Adding a bed on top
would exceed ±1.0 and clip (`pcm16` clamps, which is audible distortion). So:

```
carrierAmp = (bedType === 'none') ? 1.0 : 0.72;   // duck the tone to make room
bedAmp     = (bedType === 'none') ? 0.0 : bedLevel; // ≤ 0.40
// per-channel sample = carrierAmp * sin(phase) + bedAmp * bedSample
```

With `carrierAmp 0.72 + bedAmp 0.20`, worst-case instantaneous peak ≈ 0.92 — safe.
`pcm16d` still clamps as a final limiter. **When bed = none, carrierAmp stays 1.0 →
zero change to today's sound.**

### Seamlessness rule (critical)
- **Manual:** the *tones* are tiled from a 10 s unit, but the **bed must run
  continuously across the full `totalFrames`**, NOT tiled — tiled noise would click
  at every 10 s wrap. The manual buffer is already allocated full-length
  (`totalFrames`), and `renderManual` already loops `for (i = 0..totalFrames)`, so
  just advance the bed generator once per `i`. No extra memory.
- **Journey:** already a full per-sample loop in `renderJourney` — advance the bed
  generator once per sample alongside the phase accumulators.

So: write **one bed-generator object** that yields `{l, r}` per call and is stepped
once per output frame in both renderers.

### Generators

Make a small factory that returns a stepper. Independent L/R streams give a wider,
more enveloping feel (the bed carries no beat, so decorrelation is fine and
pleasant):

```js
// returns { next() -> {l, r} } producing samples in roughly [-1, 1]
function makeBed(type, sr, base) {
  if (type === 'brown') {
    // leaky-integrated white noise, per channel, then gain-compensated.
    let bl = 0, br = 0;
    const step = prev => {
      const w = Math.random() * 2 - 1;
      const v = (prev + 0.02 * w) / 1.02;   // leaky integrator (brown-ish)
      return v;
    };
    return { next() {
      bl = step(bl); br = step(br);
      return { l: bl * 3.5, r: br * 3.5 };  // ~normalize; clamp via headroom+pcm16d
    }};
  }
  if (type === 'pink') {
    // Paul Kellet economical pink filter, one set of poles per channel.
    const mk = () => ({ b0:0,b1:0,b2:0,b3:0,b4:0,b5:0,b6:0 });
    const L = mk(), R = mk();
    const pink = s => {
      const w = Math.random() * 2 - 1;
      s.b0 = 0.99886*s.b0 + w*0.0555179;
      s.b1 = 0.99332*s.b1 + w*0.0750759;
      s.b2 = 0.96900*s.b2 + w*0.1538520;
      s.b3 = 0.86650*s.b3 + w*0.3104856;
      s.b4 = 0.55000*s.b4 + w*0.5329522;
      s.b5 = -0.7616*s.b5 - w*0.0168980;
      const out = s.b0+s.b1+s.b2+s.b3+s.b4+s.b5+s.b6 + w*0.5362;
      s.b6 = w*0.115926;
      return out * 0.11;                    // ~normalize to ~[-1,1]
    };
    return { next() { return { l: pink(L), r: pink(R) }; } };
  }
  if (type === 'pad') {
    // a few LOW sines derived from the carrier (all < ~1 kHz so 8 kHz is fine):
    // sub-octave, root, fifth — slightly detuned L/R for width, gentle LFO swell.
    const TWO_PI = Math.PI * 2;
    const partials = [
      { f: base/2,      a: 0.55, det: 0.15 },
      { f: base,        a: 0.30, det: 0.20 },
      { f: base*1.5,    a: 0.18, det: 0.25 },
    ];
    let pl = partials.map(()=>0), pr = partials.map(()=>0);
    let lfo = 0; const lfoInc = TWO_PI * 0.05 / sr;  // ~0.05 Hz swell
    return { next() {
      lfo += lfoInc; const swell = 0.75 + 0.25 * Math.sin(lfo);
      let l = 0, r = 0;
      partials.forEach((p, i) => {
        pl[i] += TWO_PI * (p.f - p.det) / sr; if (pl[i] >= TWO_PI) pl[i] -= TWO_PI;
        pr[i] += TWO_PI * (p.f + p.det) / sr; if (pr[i] >= TWO_PI) pr[i] -= TWO_PI;
        l += Math.sin(pl[i]) * p.a;
        r += Math.sin(pr[i]) * p.a;
      });
      const norm = 0.85;                    // keep partial sum within ~[-1,1]
      return { l: l * norm * swell, r: r * norm * swell };
    }};
  }
  return { next: () => ({ l: 0, r: 0 }) };   // 'none'
}
```

> Tune the normalization constants by ear/by measuring peak over a few seconds —
> the goal is each generator's raw output sits roughly in [-1, 1] before `bedAmp`
> scales it. Don't trust the constants above blindly; verify peaks.

### Wiring into `renderManual`
Inside the existing `for (i = 0..totalFrames)` loop:
```js
const bed = makeBed(bedType, sr, base);
const carrierAmp = bedType === 'none' ? 1.0 : 0.72;
const bedAmp     = bedType === 'none' ? 0.0 : bedLevel;
// ... inside loop, after computing tile samples l, r and fade envelope e:
const bs = bed.next();
let outL = carrierAmp * l + bedAmp * bs.l;
let outR = carrierAmp * r + bedAmp * bs.r;
// apply the same envelope `e` (fade-in and/or end-fade) to BOTH tone and bed
// so the bed fades with the tone — multiply outL/outR by e, then pcm16d.
```
**Important:** the bed must be subject to the **same fade-in and end-fade** as the
tone (multiply the *summed* channel by the envelope), so the session still fades to
true silence and starts gently. Don't fade only the tone.

### Wiring into `renderJourney`
Same idea inside its per-sample loop: build `makeBed(bedType, sr, base)` once before
the loop, step it each frame, sum `carrierAmp*sin(phase) + bedAmp*bs.{l,r}`, then
multiply by the existing `gainAt(...)` envelope, then `pcm16d`. The journey already
applies `g = gainAt(t, …)` — multiply the summed channel by `g`.

### Pass `bedType`/`bedLevel` through
`startAudio` calls `renderManual(base, beat, manualMins)` and `startJourney` calls
`renderJourney(journeyStages, base, journeyFadeOut)`. Read `bedType`/`bedLevel` from
module state inside the renderers (simplest), or thread them as args — either is
fine, but keep it consistent.

---

## 5. Gentle envelopes

- **Manual fade-in:** `renderManual` currently starts the tile at full envelope.
  Add an equal-power fade-in over ~0.4 s (mirror journey's `gainAt` fade-in:
  `Math.sin((t/0.4)·π/2)` for the first 0.4 s). Apply to the **summed** channel
  (tone + bed). The tone already begins at a zero crossing so there's no click
  today, but the fade-in removes the abrupt onset and matches journey behaviour.
- Keep journey's existing 0.4 s fade-in and both modes' equal-power end fades
  (`END_FADE_SEC`). No change to fade-out logic.
- Sanity: fade-in frames = `Math.round(0.4 * sr)`; guard against tiny sessions
  (`Math.min(fadeInFrames, totalFrames)`).

---

## 6. Fidelity audit / polish (low-risk cleanups)

- **Unlock clip rate:** `unlockPlayer()` builds its silent blessing clip with
  `encodeWAV([...], RENDER_SR)` — align it to `renderRate` for consistency (it's
  silent, so harmless either way; tidy it while you're in there).
- **Confirm `pcm16d` everywhere** a *signal* sample is written (manual + journey).
  `encodeWAV` (only used for the silent unlock clip) can stay on `pcm16`.
- **Verify integer-cycle invariant** still holds after the bed work — the tones are
  untouched, so it should, but confirm the manual loop is still seamless by ear with
  bed = none and bed = brown (the bed runs continuously so it won't reintroduce a
  seam; the tone tiling must remain integer-cycle).
- **Add a short code comment** at the top of the render section pointing at §7
  (the deferred streaming idea) so the rate constraint is documented in-code.
- Keep the existing warn banner / Bluetooth detection / diagnostics untouched.

---

## 7. DEFERRED (separate future task — do NOT do in this PR)

**Streaming / render-ahead to cut memory.** Today the entire session is baked into
one in-memory WAV. Memory ≈ `seconds × rate × 4 bytes` (stereo 16-bit), with a peak
transient of ~2–3× during `createObjectURL`. At 8 kHz:

| Session | File (8 kHz) |
|---|---|
| 30 min | 58 MB |
| 60 min | 115 MB |
| 3 hr (manual max) | 346 MB |

The owner's insight: **a journey is "always the present" — no one fast-forwards or
seeks**, so we don't need the whole file resident. A future task can render small
chunks just-in-time and feed them via **MediaSource Extensions** (`SourceBuffer`),
or a rolling buffer, keeping working memory tiny while preserving the reliable
background playback. This also unblocks **raising the sample rate** (cleaner tone
playback / brighter beds like pink or white) without the memory blowing up.

This plan deliberately **keeps 8 kHz** and the whole-file bake so the bed/envelope
work stays small and low-risk. Tackle streaming + a higher rate as its own follow-up.

---

## 8. Acceptance checklist

- [ ] Bed selector renders (None/Brown/Pink/Pad), styled like carrier pills, works
      at 360 px width, shared across Manual + Journey.
- [ ] `bed-section` is locked during playback (`lockSetup`).
- [ ] **Bed = None** → output is unchanged from today (carrier full-scale) **plus**
      the new manual fade-in; journey unchanged except already-present fade-in.
- [ ] Bed = Brown/Pink/Pad mixes into **both ears**, no clipping (check peaks),
      fades in and out **with** the tone to true silence.
- [ ] Manual loop is still seamless (no 10 s click) with every bed type.
- [ ] Journey still click-free across stage boundaries with every bed type.
- [ ] Manual now fades in gently (~0.4 s).
- [ ] No regression to diagnostics (Test tone, Beat check), timer, Media Session,
      Bluetooth warning, journey live display.
- [ ] `pcm16d` used on all signal writes.
- [ ] In-code comment points at the deferred streaming/rate task (§7).

## 9. How to verify (manual QA — wired stereo headphones)

1. **Bed = None, Manual 5 min:** confirm clean beat, gentle fade-in, gentle fade-out,
   identical character to current build.
2. **Bed = Brown, Manual 5 min:** confirm warm rumble under the beat, no clicks at
   ~10 s intervals (the old tile seam), no clipping/crackle.
3. **Bed = Pink / Pad:** confirm each sounds as described, no distortion.
4. **Journey (OBE Prep), each bed:** confirm smooth stage glides, bed continuous,
   fade-out to silence at the end.
5. **Beat check + Test tone** still work after toggling beds.
6. Watch peak levels (or scope the WAV) to confirm headroom math — no full-scale
   clipping when a bed is active.

## 10. Ship

- Branch off latest `main` (e.g. `feat/beats-comfort-bed`), implement, push, open a
  PR with `gh pr create`, and **paste the Netlify Deploy Preview link** in the PR /
  your reply so the owner can audition it live on a phone with headphones. Co-author
  trailer is added automatically. Do not commit to `main`.
