charlie

# Loose Bearing — The Reveal, the hero slice (build 5/6)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. V3 shipped the deterministic router that returns a captured `exploration` (settle order, per-node rejected edges, the final frontier). V4 shipped the map app that statically renders the constrained route, the ghosts, the detour readout, and permalinks. This log builds **the one thing we deliberately over-invest in**: the animated Reveal that makes the whole piece memorable.

Log 5 of the Loose Bearing build set (V1 → V2 → V3 → V4 → **V5** → V6). This is the hero. Everything else in the project is intentionally minimal so this slice can be excellent.

**The Reveal = one cohesive animation that traces the constrained search forward, shows the 90° allowed cone and the rejected turns at each step, and ends in either an arrival (with the detour factor) or a dead-end bloom (only when the destination is genuinely bearing-unreachable).** It reads in 3 seconds as a screenshot and in 15 seconds as "oh, that is how it works."

This log builds only the **animation over V3's captured exploration** and its replay controls. It does **not** add the gallery or the final designed failure-state screens (V6). It renders the same data V4 already draws statically, now over time.

## Decisions (agreed in the CEO review)
- **The Reveal is the single over-investment** (CEO review D2). Polish here pays off; keep the rest of the app lean.
- **Drive the animation from the captured exploration**, deterministically. The same permalink must produce the same animation frame-for-frame (V3 guarantees identical settle order). No `Math.random`, no wall-clock-dependent ordering — time drives playback, not the data.
- **The 90° cone + rejected-turn flashes are the signature visual** — the thing that proves this is a real search, not a library call. Lean into them; do not settle for a generic animated line.
- **The dead-end bloom fires ONLY on `NoBearingLegalPath`** (D4). OffNetwork / Disconnected / GeocodeMiss / GraphLoadError never bloom — that would cry wolf and discredit the concept.
- **Worst case = common case:** an unreachable search explores the whole reachable-under-rule region, so the bloom is exactly when there is the most to draw. Decimate at render; keep it smooth.
- **Design:** recommend a `/plan-design-review` pass before/around this log since it is the visual centerpiece. Keep it intentional, no AI-slop motion, motion that explains rather than decorates.
- Large system: **eight stages.**

---

# Stage 1 — Build the animation timeline

```
Turn the captured exploration into a deterministic, playable timeline.

1. Create `src/app/reveal/timeline.ts` that consumes V3's `exploration` and produces an ordered list of keyframe events: node settled (in settle order), edges rejected at that node, and finally the arrival or exhaustion event. Assign each event a virtual time so playback speed is a single scalar.
2. The timeline is a pure function of the exploration — same input, identical timeline (assert this).
3. Do not render yet; just produce and test the timeline structure.

Verify: for a small reachable pair and the trap pair, the timeline event order matches the exploration settle order exactly, and is identical across two builds. Report the event counts for both.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — Animated route trace

```
Draw the constrained path appearing over time.

1. Create `src/app/reveal/player.ts` driving playback off a clock (requestAnimationFrame), advancing through the timeline. Render the constrained route progressively (line grows from start toward arrival) using MapLibre (line-gradient/feature-state or incremental GeoJSON — do not re-add sources every frame).
2. Reuse V4's route layer styling as the basis; this replaces the static draw with a timed reveal for the final path.

Verify: the route traces smoothly from origin to arrival at a controllable speed; no per-frame source thrash (check performance). Report frame timing on a medium route.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — The 90° allowed-cone at each node

```
Show the rule itself, live.

1. As playback settles each node, render the 90° "allowed cone" — a wedge centered on the current bearing-to-destination (recomputed from the node, reusing V1's `initialBearingDeg`), spanning ±90°, indicating which outgoing directions are legal.
2. Orient and scale it legibly; fade it as playback moves on so the map does not accumulate clutter.

Verify: the cone always points toward the destination and its ±90° opening matches the rule; at a node near the destination the cone visibly rotates compared to earlier nodes. Report a screenshot description at two different nodes.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — Rejected-turn flashes

```
Show the roads the rule threw away — the drama of the constraint.

1. At each settled node, briefly flash the out-edges that were REJECTED for pointing more than 90° away (from the captured rejected-edge data — do NOT recompute legality; use what V3 recorded). Style them distinctly from the taken path (e.g. a quick fading stroke).
2. Respect decimation: if a node rejected many edges, cap how many flash to keep it readable and fast.

Verify: rejected flashes correspond to the captured rejected edges (spot-check counts against the exploration), and consistently point away from the destination relative to the cone. Report the check.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — Arrival state + search stats

```
Land the plane with the payoff numbers.

1. On the arrival event, settle the final route, then reveal the detour factor (from V3) and the search stats: nodes explored and edges rejected (from the exploration). Present them quietly and legibly (monospace figures).
2. This doubles as observability — the stats are both charming and the debug view.

Verify: the displayed nodes-explored / edges-rejected equal the exploration counts, and the detour factor equals V3's value. Report the numbers for one route.
```

## Stage 5 Report

_Pending._

---

# Stage 6 — Dead-end bloom (failure only) + decimation

```
Make honest failure beautiful — the most differentiated moment.

1. For a `NoBearingLegalPath` result, play the exhaustion animation: the frontier spreads and "blooms" as the search fills the reachable-under-rule region and then stops, ending with the honest "you cannot get there without ever turning away" message. This fires ONLY for NoBearingLegalPath — never for OffNetwork/Disconnected/GeocodeMiss/GraphLoadError.
2. Implement render decimation for large explored sets (thin the drawn frontier/rejected edges by sampling) so the bloom stays smooth even on the worst case.
3. Confirm the other failure states show their (still minimal) V4 messages, no bloom.

Verify: the trap/real unreachable pair blooms and stays smooth; a Disconnected pair shows its message with NO bloom. Profile the bloom on a large real failure and report frame timing.
```

## Stage 6 Report

_Pending._

---

# Stage 7 — Replay controls + replay from permalink

```
Let people re-watch and share the moment.

1. Add playback controls: play/pause, scrub, and speed. Scrubbing maps to timeline virtual time and is deterministic (same position → same frame).
2. Opening a permalink auto-plays the Reveal for that (start, end). Add a "replay" affordance. Because V3 + the timeline are deterministic, a shared link reproduces the exact animation.

Verify: scrub to a position, reload the same permalink, scrub to the same position → identical frame. Auto-play works from a fresh permalink open. Report the determinism check.
```

## Stage 7 Report

_Pending._

---

# Stage 8 — Performance pass + coherence + update NOW.md

```
Make it smooth everywhere and record the hero done.

1. Profile the heavy cases: long reachable routes and large unreachable blooms. Tune decimation thresholds so both stay smooth; ensure no per-frame allocation spikes or source re-adds.
2. Run `npm run typecheck`, `npm test`, `npm run build`. Do a full walkthrough: a strange reachable route (trace + cone + rejects + arrival stats) and a genuine unreachable case (bloom), both from permalinks.
3. Update `NOW.md`: move "The Reveal" to functional with the V5 tag and a one-line note that the hero animation runs deterministically over the captured exploration with replay, so V6 can focus on gallery + failure-state design + ship.

Verify: full green; both showcase cases smooth and deterministic from links; NOW.md updated. Report frame timings and a one-paragraph summary of the finished hero.
```

## Stage 8 Report

_Pending._

---

# After These Stages
- The hero exists: a deterministic, replayable animation that traces the constrained search, shows the 90° cone and the rejected turns, lands on the detour factor + search stats, and turns genuine unreachability into a designed dead-end bloom — all shareable via permalink.
- Explicitly still deferred (see `NOW.md`): the greatest-hits gallery, the fully designed per-failure-state screens, accessibility + mobile polish, branding/share-meta, and deployment (V6).
- Next major build: **V6 — Gallery, failure states, and ship**, the finish and distribution layer that makes it portfolio-grade.
