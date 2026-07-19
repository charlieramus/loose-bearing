charlie

# Loose Bearing — Gallery, failure states, and ship (build 6/6)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. V4 shipped the map app (routes, ghosts, detour, permalinks, honest-but-minimal failure messages); V5 shipped the hero Reveal (deterministic animation, 90° cone, rejected flashes, arrival stats, dead-end bloom, replay). This final log turns a working demo into a portfolio-grade, shareable piece: the greatest-hits gallery, the fully designed five failure-state screens, accessibility + mobile, branding + share meta, deploy, and the writeup.

Log 6 of the Loose Bearing build set (V1 → V2 → V3 → V4 → V5 → **V6**). This is the last one; after it, the project is shippable and done.

**The finish = a curated gallery that carries the first impression, five designed failure states, a real name and share-preview, a deployed URL, and a README that makes a stranger understand the concept in a minute.**

This log builds only the **gallery, failure-state design, polish, and ship**. It relitigates none of the algorithm (V1–V3) or the core interactions (V4–V5); it presents them well and gets them online.

## Decisions (agreed in the CEO review)
- **Greatest-hits gallery is in scope; a curated default landing view is NOT** (CEO review D3). Because we skipped the default view, the **gallery must be visually dominant on load** and carry the first impression — it also curates away the boring grid routes and toward the wild ones and the dead-ends.
- **Gallery is pre-baked, no backend:** 5–6 hand-picked permalinks as thumbnails. No accounts, no user-submitted routes, no route-of-the-day service — those are explicitly out.
- **All five failure states get a designed screen** (D4), each visually and textually distinct; `NoBearingLegalPath` is framed as the celebrated result, the others as honest ordinary conditions.
- **Name:** lock it here. CEO-review pick was **Loose Bearing** (puns on the mechanism, implies the loose 90° tolerance); confirm or override, then apply everywhere (title, README, meta).
- **Attribution:** OSM/ODbL credit (from V2 PROVENANCE) stays visible.
- **Design:** if `/plan-design-review` was not yet run, run it before or during this log — this is the polish pass where its output lands. No AI-slop, quiet and intentional.
- Large system: **seven stages.**

---

# Stage 1 — Greatest-hits gallery

```
Build the curated wall that carries the load-in impression.

1. Hand-pick 5–6 (start, end) pairs that best show the concept: a couple of dramatic reachable detours (foothills/mountain-seam where the rule bites), and at least one genuine dead-end (NoBearingLegalPath) so the failure feature is front and center. Record them as permalinks.
2. Build a gallery component (`src/app/gallery/`) shown prominently on load: each entry is a thumbnail/label that opens its permalink into the full Reveal. No backend — the pairs are a static, committed list.
3. Make the gallery visually dominant on first load (it replaces the missing curated default view), collapsing/receding once the user starts their own route.

Verify: on a fresh load the gallery is the first thing the eye lands on; each entry opens the correct route + Reveal; at least one entry is a dead-end. Report the chosen six with one-line reasons.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — The five designed failure states

```
Give each failure its own honest, distinct screen.

1. Design and implement distinct presentations for: GeocodeMiss ("couldn't find that place"), Origin/DestinationOffNetwork ("that spot isn't near a routable road"), NoBearingLegalPath (the FEATURE — "you can't get there without ever turning away", paired with the dead-end bloom from V5), Disconnected ("these points aren't road-connected"), and GraphLoadError ("map data failed to load — retry").
2. Make NoBearingLegalPath feel like a designed payoff, not an error; make the other four feel handled and calm. Never show one state's copy for another (the anti-wolf-crying rule).

Verify: trigger all five and confirm each is visually and textually distinct and correctly matched to its cause. Report all five side by side.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — Empty, loading, and first-run states

```
Cover the moments around the main flow.

1. Design the initial empty state (gallery-forward + a one-line "how it works"), the loading states (graph load, geocode, search/animation in progress), and a light first-run hint on how the rule works.
2. Ensure state transitions are smooth and never leave a blank or ambiguous screen.

Verify: cold load, mid-geocode, mid-search, and post-result each show an intentional state. Report the transitions.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — Accessibility + mobile pass

```
Make it usable beyond a desktop demo.

1. Accessibility: all failure/status copy is real readable text (never color-only), keyboard navigation for inputs and gallery, sensible focus order, adequate contrast, and reduced-motion handling for the Reveal (respect prefers-reduced-motion with a static fallback).
2. Mobile: the map, controls, gallery, and Reveal must not break on a phone viewport and touch (pins draggable by touch, panels usable). Aim for "doesn't break," not a separate mobile design.

Verify: a keyboard-only pass reaches every control; prefers-reduced-motion shows a static route instead of animation; a phone-width viewport is usable. Report each check.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — Branding + share meta

```
Lock identity and make shared links look good.

1. Lock the name (default: Loose Bearing) and apply it to the page title, header, and README. Add a favicon.
2. Add OG/Twitter meta so a shared permalink unfurls with a title, description, and a representative route image (a static preview is fine; a per-route image is a nice-to-have, not required).
3. Keep OSM/ODbL attribution visible in the footer.

Verify: paste a permalink into a link-preview checker and confirm it unfurls with title + image; the name is consistent everywhere. Report the unfurl result.
```

## Stage 5 Report

_Pending._

---

# Stage 6 — Deploy + production smoke test

```
Get it online.

1. Production build. Deploy to static hosting if V2's artifact loads client-side (preferred — permalinks are pure static); otherwise deploy the thin serverless function alongside. Configure caching for the graph artifact.
2. Smoke test in production: a reachable route + Reveal, a dead-end bloom, and a shared permalink all work on the live URL.

Verify: the live URL routes, animates, and reproduces a prod permalink; the graph artifact loads within a reasonable time. Report the URL and the smoke-test results.
```

## Stage 6 Report

_Pending._

---

# Stage 7 — Portfolio writeup + coherence + update NOW.md

```
Make it legible to a stranger and close the project.

1. Write the README as a portfolio piece: the concept, the bearing rule and the math (spherical bearing, 90° inclusive), "how it works" (custom graph → constrained A* → captured exploration → Reveal), why unreachability is a feature, the Front Range scope, and OSM attribution. Embed a short demo GIF (a strange route + a dead-end bloom).
2. Full coherence pass: `npm run typecheck`, `npm test`, `npm run build`; a complete walkthrough from cold load → gallery → custom route → share → reopen → dead-end. Confirm the DRY invariant still holds (one geo core, one rule).
3. Update `NOW.md`: mark every area functional/shipped with the live URL; note the project is complete and list the honest Phase-2 ideas that stayed out (other constraints, city switcher).

Verify: full green; the README lets a stranger understand it in a minute; NOW.md reflects a shipped project. Report the final summary and the live URL.
```

## Stage 7 Report

_Pending._

---

# After These Stages
- Loose Bearing is shipped: a deployed, shareable, portfolio-grade toy with a curated gallery, a memorable hero Reveal, five honestly-designed failure states, and a README that explains the whole idea and the engineering behind it.
- Explicitly out of scope, on purpose (see `NOW.md`): accounts, saved/user-submitted routes, route-of-the-day services, observability dashboards, and any second region — plus the Phase-2 ideas (other constraints like only-right-turns or elevation-monotone, a city switcher) that the reproducible V2 pipeline leaves the door open for.
- The build set (V1 → V6) is complete.
