# Binaural Beats — Sample Rate & Memory (Future TODO / Reference)

> **Status: RESOLVED — won't do (2026-06-15).** After a spike + discussion with the
> owner, we are **not** raising the sample rate and **not** streaming. The current
> build stays at **8 kHz, whole-file bake**. Reasoning and spike findings below; the
> rest of this doc is kept as background for anyone who revisits.
>
> **Why we closed it:**
> - The only thing a higher rate unlocked was **brighter noise/pad beds**. The owner
>   only cares about the **tones**, and pure ≤310 Hz sines are already perfect at
>   8 kHz (40 samples/cycle, no aliasing) — they gain nothing from a higher rate.
> - With no rate increase, the streaming/memory rewrite has no payoff. The current
>   8 kHz whole-file build is correct for "tones-only, good enough."
> - The residual reason to stream was **memory on 2–3 hr manual sessions** (~346 MB
>   file / ~1 GB peak at 8 kHz). Owner confirmed sessions aren't long enough to hit
>   this. If that changes, the spike findings below are the starting point.
>
> **Spike findings (PR #7, `docs/spike-bg-audio.html` — keep it, it's re-runnable):**
> tested on the owner's iPhone with headphones, screen-locked.
> 1. **Background JS survives screen lock** — chunk feeding kept up while locked
>    (setTimeout/'ended' both fire). The original fear that the page can't feed audio
>    in the background is unfounded.
> 2. **Web Audio (scheduled `AudioBufferSourceNode`s) DIES on lock** — the
>    `AudioContext` suspends. So the gapless, sample-accurate approach is unusable for
>    background/lock-screen playback. (Confirms why the player went offline-render.)
> 3. **`<audio>` is the only primitive that survives lock**, but: no usable
>    `MediaSource`/MSE (so no true gapless streaming), `.volume` is ignored on iOS,
>    and `.play()` has ~100 ms non-deterministic latency (no sample-accurate start).
> 4. Given (3), the viable streaming primitive is a **fade-to-silence handoff**: each
>    tone segment fades to true silence, the next fades up from silence on `ended`;
>    the ~100 ms swap gap lands inside the silence = inaudible. (Crossfade/overlap is
>    fragile because of the `.volume`/timing limits.) A separate **seamless bed loop**
>    on its own `<audio loop>` (~10 MB even at high rate, since noise is stationary
>    and loops indistinguishably) would carry any texture layer at near-zero memory —
>    i.e. **loop the bed, don't whole-file it**, and it's the *bed* (not the tone)
>    that would want the high rate. None of this is being built — recorded for reuse.
>
> If revisited: the architecture is bed-loop (own element) + tone fade-to-silence
> handoff segments; memory then decouples from duration and HW/2 rate becomes free.

---

## The situation today

`beats.html` renders the **entire session** into one stereo 16-bit WAV held in
memory, then plays it through a hidden `<audio>` element (so iOS keeps it alive with
the screen off). The render rate is fixed low:

```js
const RENDER_SR = 8000;      // "preferred" render rate
let   renderRate = RENDER_SR; // probeRenderRate() picks the LOWEST rate the device accepts → ~8000
```

`probeRenderRate()` walks `[8000, 11025, 16000, 22050, 24000, 44100]` and returns the
first the device's `OfflineAudioContext` accepts — in practice 8000.

## Why 8 kHz is fine *for the tones*… and where it isn't

- The carrier tones are **100–310 Hz pure sines** — far below the 8 kHz Nyquist
  (4 kHz). At 8 kHz a 200 Hz sine has 40 samples/cycle: mathematically clean, no
  aliasing, no audible loss in the *tone itself*.
- The **only** fidelity risk is the playback resample: the device DAC runs at
  44.1/48 kHz, so the OS upsamples 8 k → 48 k. A mediocre resampler can leave faint
  high-frequency spectral images. On modern iOS/Android this is usually inaudible,
  but it leaves **zero margin**.
- **8 kHz becomes a real limit the moment we add bright content** — pink/white noise
  or a bright pad get hard-lowpassed at 4 kHz and sound muffled / like a phone call.
  (Brown noise and a low-harmonic pad survive 8 kHz fine because their energy is
  mostly < 1 kHz — that's why the bed selector in the main plan sticks to those.)

So: 8 kHz is a deliberate, defensible choice for *pure low tones + dark beds*. It is
the wrong choice if we ever want crisp textures or reference-grade playback.

## Why we don't just raise it: memory

The whole session is resident in RAM. **File size = seconds × rate × 4 bytes**
(stereo, 16-bit). Peak transient during `createObjectURL` is roughly **2–3×** the
file (ArrayBuffer + Blob copy + the audio element's decode).

| Session | 8 kHz (now) | 16 kHz | 22.05 kHz | 44.1 kHz |
|---|---|---|---|---|
| 30 min | 58 MB | 115 MB | 159 MB | 318 MB |
| 60 min | 115 MB | 230 MB | 317 MB | 635 MB |
| **3 hr (manual max)** | **346 MB** | 691 MB | 952 MB | **1.9 GB** |

A 3-hour manual session is already ~350 MB file / ~0.7–1 GB peak at 8 kHz. At
44.1 kHz it's ~1.9 GB — mobile Safari will very likely kill the tab. **Manual mode is
the binding constraint** because it bakes the *full duration* (it has to: iOS
throttles JS timers when backgrounded, so a finite `loop=false` file is the only
reliable way to stop on time with the screen locked). Journeys are usually ≤1 hr, so
they have more headroom.

## The unlock: stream instead of bake (owner's idea)

Key insight from the owner: **a journey/session is "always the present" — nobody
fast-forwards or seeks.** So we don't need the whole file resident in memory. Future
options, roughly in order of effort:

1. **MediaSource Extensions (MSE) + render-ahead.** Render small WAV/PCM chunks
   just-in-time and append them to a `SourceBuffer`, evicting played chunks. Working
   memory stays tiny (a few seconds of audio) regardless of session length, and the
   `<audio>` element + Media Session keep working for background/lock-screen.
   - Caveat to verify: background JS throttling on iOS. If the page can't reliably
     append chunks while backgrounded, we may need a larger lookahead buffer (e.g.
     render N minutes ahead) — still far less than the whole file. Confirm iOS Safari
     MSE behaviour with the screen locked before committing.
2. **Bounded look-ahead bake.** Instead of full-streaming, bake only the next, say,
   5–10 min and swap files at boundaries. Cruder, but sidesteps some MSE edge cases.
   Risk: a seam/click at the swap → needs phase continuity across files (we already
   do phase-accumulation in `renderJourney`, so carry the phase across the boundary).
3. **Web Audio live + Wake Lock / silent-keepalive.** Probably a dead end on iOS
   (the whole reason we went offline-render was that iOS suspends `AudioContext` on
   lock). Listed only so we don't re-explore it without remembering why it failed.

**Once memory is decoupled from duration, raising the sample rate is free.** Then:

- **Cleanest cheap win:** render at **half the device's hardware rate** (22.05 k if
  HW is 44.1 k, 24 k if 48 k). An exact integer-divisor upsample is the highest-
  quality resample possible (no fractional imaging). Read the real HW rate via
  `new AudioContext().sampleRate` and pick `rate = HW/2` (bounded). Better
  quality-per-byte than a blind 16 k or 22.05 k.
- Or go full HW rate (44.1/48 k) for reference quality once streaming makes the
  memory affordable.

## Definition of done (when we eventually do this)

- [ ] Working memory no longer scales with session length (stream or bounded
      look-ahead), verified on a 3 hr manual session without the tab being killed.
- [ ] Background playback with the screen locked still works on iOS Safari
      (the whole point of the current architecture — don't regress it).
- [ ] No clicks at chunk/file boundaries (carry phase across boundaries).
- [ ] Render rate raised — ideally `HW/2` integer-divisor, or full HW rate.
- [ ] Once the rate is up: optionally add brighter bed options (pink at full
      brightness, white noise, bright pad) that 8 kHz couldn't support.
- [ ] Re-check `probeRenderRate()` / `RENDER_SR` / `renderRate` and the manual
      "bake full duration" logic — these all assume the current whole-file model.

## Pointers

- Main feature plan (bed selector + envelopes, stays at 8 kHz):
  `docs/beats-sound-quality-plan.md` (esp. §7).
- Relevant code in `beats.html`: `RENDER_SR`, `renderRate`, `probeRenderRate()`,
  `makeOffline()`, `renderManual()`, `renderJourney()`, `setPlayerSrc()`, and the
  `<audio id="bg-audio">` element + Media Session wiring.
