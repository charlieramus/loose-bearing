// Screen overlay — a small status surface pinned over the framed map screen. Stage 2 uses it
// for the graph LOADING indicator and the blocking `GraphLoadError` state (message + RETRY).
// It is deliberately minimal and reusable: later stages can show other blocking states through
// the same terse instrument-styled surface. Not a floating card — it's a thin panel anchored to
// the screen, matching the reference artifact's restraint.

export type OverlayAction = { label: string; onClick: () => void };

export class ScreenOverlay {
  private readonly el: HTMLElement;
  private readonly spinner: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly actionsEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "lb-overlay";
    this.el.hidden = true;

    const panel = document.createElement("div");
    panel.className = "lb-overlay-panel";

    this.spinner = document.createElement("div");
    this.spinner.className = "lb-spinner";

    this.titleEl = document.createElement("div");
    this.titleEl.className = "lb-overlay-title";

    this.detailEl = document.createElement("div");
    this.detailEl.className = "lb-overlay-detail";

    this.actionsEl = document.createElement("div");
    this.actionsEl.className = "lb-overlay-actions";

    panel.append(this.spinner, this.titleEl, this.detailEl, this.actionsEl);
    this.el.append(panel);
    parent.append(this.el);
  }

  /** Non-blocking-looking busy state with the running spinner. */
  showLoading(title: string, detail?: string): void {
    this.render("loading", title, detail, []);
  }

  /** Blocking fault state (red), e.g. GraphLoadError, with optional actions like RETRY. */
  showFault(title: string, detail?: string, actions: OverlayAction[] = []): void {
    this.render("fault", title, detail, actions);
  }

  hide(): void {
    this.el.hidden = true;
  }

  private render(
    kind: "loading" | "fault",
    title: string,
    detail: string | undefined,
    actions: OverlayAction[],
  ): void {
    this.el.dataset.kind = kind;
    this.el.hidden = false;
    this.spinner.hidden = kind !== "loading";
    this.titleEl.textContent = title;
    this.detailEl.textContent = detail ?? "";
    this.detailEl.hidden = !detail;

    this.actionsEl.textContent = "";
    for (const action of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lb-overlay-btn";
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
      this.actionsEl.append(btn);
    }
    this.actionsEl.hidden = actions.length === 0;
  }
}
