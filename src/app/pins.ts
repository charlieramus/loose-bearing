// The A / B map pins (V4, Stage 4). Draggable MapLibre markers for origin and destination that
// stay in sync with the text inputs. On drag end we hand the new coordinate back to the app,
// which re-snaps it and re-routes. The marker element is the artifact's monochrome square with a
// letter tick (refined visually in Stage 5); here it just needs to be placeable and draggable.

import maplibregl from "maplibre-gl";
import type { LatLng } from "../geo/geo";

export type PinRole = "origin" | "dest";
const LETTER: Record<PinRole, string> = { origin: "A", dest: "B" };

function createPinElement(role: PinRole): HTMLElement {
  const el = document.createElement("div");
  el.className = "lb-pin";
  el.dataset.role = role;
  el.textContent = LETTER[role];
  return el;
}

export class Pins {
  private markers: Record<PinRole, maplibregl.Marker | null> = { origin: null, dest: null };

  constructor(
    private readonly map: maplibregl.Map,
    private readonly onDragEnd: (role: PinRole, coord: LatLng) => void,
  ) {}

  /** Place or move the pin for `role` at `coord` (lat/lng). */
  set(role: PinRole, coord: LatLng): void {
    const existing = this.markers[role];
    if (existing) {
      existing.setLngLat([coord.lng, coord.lat]);
      return;
    }
    const marker = new maplibregl.Marker({
      element: createPinElement(role),
      draggable: true,
      anchor: "center",
    })
      .setLngLat([coord.lng, coord.lat])
      .addTo(this.map);
    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      this.onDragEnd(role, { lat, lng });
    });
    this.markers[role] = marker;
  }

  clear(role: PinRole): void {
    this.markers[role]?.remove();
    this.markers[role] = null;
  }

  has(role: PinRole): boolean {
    return this.markers[role] !== null;
  }
}
