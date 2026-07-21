// The instrument readout (V4, Stage 6). Makes the route's strangeness legible with numbers,
// not a second map line: the big detour-factor hero figure (light large grotesque), the
// 16-segment detour meter beneath it, a 4-cell mono grid (DISTANCE / DIRECT / NODES / REFUSED,
// the last switching to DEAD ENDS on a fault), and the compass + BEARING readout on the screen.
// A pure view — all values are computed by the controller from V3's Success/exploration (using
// the geo core for distances/bearing) and handed in; this module only renders them.

const METER_SEGMENTS = 16;
/** Detour at which the meter reads full. 3× (constrained route thrice the crow-flies-ish base). */
const DETOUR_METER_MAX = 3;

export type ReadoutSuccess = {
  detourFactor: number;
  distanceMeters: number; // constrained route length
  directMeters: number; // straight A→B crow-flies
  nodesExplored: number;
  refusedTurns: number;
  bearingDeg: number;
};

export type ReadoutFault = {
  directMeters: number;
  nodesExplored: number;
  deadEnds: number;
  bearingDeg: number;
  label: string; // NO PATH / DISCONNECTED
};

/** Format a distance: km (2 dp) at/above 1 km, else whole meters. Exported for tests. */
export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} KM` : `${Math.round(m)} M`;
}
/** Compass bearing → zero-padded 3-digit degrees. Exported for tests. */
export function fmtBearing(deg: number): string {
  return `${Math.round(((deg % 360) + 360) % 360)
    .toString()
    .padStart(3, "0")}°`;
}
/** Detour factor → number of lit meter segments (0..16), proportional above 1×. */
export function meterFill(detour: number): number {
  const t = (detour - 1) / (DETOUR_METER_MAX - 1);
  return Math.max(0, Math.min(METER_SEGMENTS, Math.round(t * METER_SEGMENTS)));
}

type Cell = { label: HTMLElement; value: HTMLElement };

export class Readout {
  private readonly figure: HTMLElement;
  private readonly unit: HTMLElement;
  private readonly segments: HTMLElement[] = [];
  private readonly cells: { distance: Cell; direct: Cell; nodes: Cell; last: Cell };

  constructor(
    private readonly panel: HTMLElement,
    private readonly compass: HTMLElement,
    private readonly bearingReadout: HTMLElement,
  ) {
    panel.textContent = "";
    const root = document.createElement("div");
    root.className = "lb-ro";

    const hero = document.createElement("div");
    hero.className = "lb-ro-hero";
    this.figure = document.createElement("span");
    this.figure.className = "lb-ro-figure";
    this.unit = document.createElement("span");
    this.unit.className = "lb-ro-unit";
    hero.append(this.figure, this.unit);

    const meter = document.createElement("div");
    meter.className = "lb-ro-meter";
    for (let i = 0; i < METER_SEGMENTS; i++) {
      const seg = document.createElement("span");
      seg.className = "lb-ro-seg";
      this.segments.push(seg);
      meter.append(seg);
    }

    const grid = document.createElement("div");
    grid.className = "lb-ro-grid";
    const mkCell = (label: string): Cell => {
      const cell = document.createElement("div");
      cell.className = "lb-ro-cell";
      const l = document.createElement("span");
      l.className = "lb-ro-cell-label";
      l.textContent = label;
      const v = document.createElement("span");
      v.className = "lb-ro-cell-value";
      v.textContent = "—";
      cell.append(l, v);
      grid.append(cell);
      return { label: l, value: v };
    };
    this.cells = {
      distance: mkCell("DISTANCE"),
      direct: mkCell("DIRECT"),
      nodes: mkCell("NODES"),
      last: mkCell("REFUSED"),
    };

    root.append(hero, meter, grid);
    panel.append(root);
    this.clear();
  }

  /** No active route — reset hero, meter, grid, compass, and bearing. */
  clear(): void {
    this.panel.dataset.state = "";
    this.figure.textContent = "—";
    this.unit.textContent = "";
    this.setMeter(0, false);
    this.cells.distance.value.textContent = "—";
    this.cells.direct.value.textContent = "—";
    this.cells.nodes.value.textContent = "—";
    this.cells.last.label.textContent = "REFUSED";
    this.cells.last.value.textContent = "—";
    this.setBearing(null);
  }

  /** Both endpoints set, route in flight — show the crow-flies reference + bearing only. */
  pending(bearingDeg: number, directMeters: number): void {
    this.panel.dataset.state = "pending";
    this.figure.textContent = "··";
    this.unit.textContent = "";
    this.setMeter(0, false);
    this.cells.distance.value.textContent = "…";
    this.cells.direct.value.textContent = fmtDist(directMeters);
    this.cells.nodes.value.textContent = "…";
    this.cells.last.label.textContent = "REFUSED";
    this.cells.last.value.textContent = "…";
    this.setBearing(bearingDeg);
  }

  success(s: ReadoutSuccess): void {
    this.panel.dataset.state = "ok";
    this.figure.textContent = s.detourFactor.toFixed(2);
    this.unit.textContent = "×";
    this.setMeter(meterFill(s.detourFactor), false);
    this.cells.distance.value.textContent = fmtDist(s.distanceMeters);
    this.cells.direct.value.textContent = fmtDist(s.directMeters);
    this.cells.nodes.value.textContent = s.nodesExplored.toLocaleString();
    this.cells.last.label.textContent = "REFUSED";
    this.cells.last.value.textContent = s.refusedTurns.toLocaleString();
    this.setBearing(s.bearingDeg);
  }

  fault(f: ReadoutFault): void {
    this.panel.dataset.state = "fault";
    this.figure.textContent = "∞";
    this.unit.textContent = "";
    this.setMeter(METER_SEGMENTS, true); // rail the meter red on a fault
    this.cells.distance.value.textContent = f.label;
    this.cells.direct.value.textContent = fmtDist(f.directMeters);
    this.cells.nodes.value.textContent = f.nodesExplored.toLocaleString();
    this.cells.last.label.textContent = "DEAD ENDS";
    this.cells.last.value.textContent = f.deadEnds.toLocaleString();
    this.setBearing(f.bearingDeg);
  }

  private setMeter(fill: number, fault: boolean): void {
    this.segments.forEach((seg, i) => {
      seg.dataset.on = String(i < fill);
      seg.dataset.fault = String(fault);
    });
  }

  private setBearing(deg: number | null): void {
    if (deg === null) {
      this.bearingReadout.textContent = "— — —°";
      this.compass.style.removeProperty("--compass-rot");
      return;
    }
    this.bearingReadout.textContent = fmtBearing(deg);
    this.compass.style.setProperty("--compass-rot", `${deg}deg`);
  }
}
