// The instrument shell DOM — built once, in code, so the regions are typed handles later
// stages fill in. Layout matches the reference artifact: a thin top header (wordmark + mono
// readouts + square theme/replay buttons), a left control column (A/B inputs, numbered route
// list, readout-panel region), and the framed map "screen" with corner registration marks,
// ruler ticks, a compass, and a bearing readout. Nothing here does routing — these are the
// stable regions the rest of V4 wires into.

export type ShellRefs = {
  root: HTMLElement;
  headerStatus: HTMLElement;
  themeButton: HTMLButtonElement;
  replayButton: HTMLButtonElement;
  inputA: HTMLInputElement;
  inputB: HTMLInputElement;
  routeList: HTMLOListElement;
  readoutPanel: HTMLElement;
  mapContainer: HTMLElement;
  compass: HTMLElement;
  bearingReadout: HTMLElement;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Build the shell inside `mount` and return handles to every fillable region. */
export function buildShell(mount: HTMLElement): ShellRefs {
  mount.textContent = "";

  const root = el("div", "lb-app");

  // ---- Header -------------------------------------------------------------
  const header = el("header", "lb-header");
  const wordmark = el("div", "lb-wordmark");
  wordmark.append(el("span", "lb-wordmark-dot"), document.createTextNode("LOOSE BEARING"));

  const headerReadouts = el("div", "lb-header-readouts");
  headerReadouts.append(
    el("span", "lb-readout", "FRONT RANGE"),
    el("span", "lb-readout lb-readout-dim", "90° RULE"),
  );
  const headerStatus = el("span", "lb-readout lb-readout-status", "READY");
  headerReadouts.append(headerStatus);

  const headerButtons = el("div", "lb-header-buttons");
  const themeButton = el("button", "lb-sqbtn", "◐");
  themeButton.type = "button";
  themeButton.title = "Toggle light / dark";
  themeButton.setAttribute("aria-label", "Toggle light or dark theme");
  const replayButton = el("button", "lb-sqbtn", "▷");
  replayButton.type = "button";
  replayButton.title = "Replay (V5)";
  replayButton.setAttribute("aria-label", "Replay the search");
  replayButton.disabled = true; // the animated reveal lands in V5
  headerButtons.append(themeButton, replayButton);

  header.append(wordmark, headerReadouts, headerButtons);

  // ---- Control column -----------------------------------------------------
  const control = el("aside", "lb-control");

  const inputs = el("div", "lb-inputs");
  const fieldA = el("label", "lb-field");
  const inputA = el("input", "lb-input");
  inputA.type = "text";
  inputA.placeholder = "ORIGIN";
  inputA.autocomplete = "off";
  fieldA.append(el("span", "lb-tick", "A"), inputA);
  const fieldB = el("label", "lb-field");
  const inputB = el("input", "lb-input");
  inputB.type = "text";
  inputB.placeholder = "DESTINATION";
  inputB.autocomplete = "off";
  fieldB.append(el("span", "lb-tick", "B"), inputB);
  inputs.append(fieldA, fieldB);

  const routeList = el("ol", "lb-routelist");

  const readoutPanel = el("div", "lb-readoutpanel");

  control.append(inputs, routeList, readoutPanel);

  // ---- Framed map screen --------------------------------------------------
  const screen = el("section", "lb-screen");
  const mapContainer = el("div", "lb-map");
  mapContainer.id = "map";

  const rulerTop = el("div", "lb-ruler lb-ruler-top");
  const rulerLeft = el("div", "lb-ruler lb-ruler-left");

  const regs = el("div", "lb-regmarks");
  for (const corner of ["tl", "tr", "bl", "br"] as const) {
    regs.append(el("span", `lb-reg lb-reg-${corner}`));
  }

  const compass = el("div", "lb-compass");
  compass.append(el("span", "lb-compass-needle"), el("span", "lb-compass-n", "N"));

  const bearingReadout = el("div", "lb-bearing", "— — —°");

  screen.append(mapContainer, rulerTop, rulerLeft, regs, compass, bearingReadout);

  // ---- Assemble -----------------------------------------------------------
  const body = el("main", "lb-body");
  body.append(control, screen);
  root.append(header, body);
  mount.append(root);

  return {
    root,
    headerStatus,
    themeButton,
    replayButton,
    inputA,
    inputB,
    routeList,
    readoutPanel,
    mapContainer,
    compass,
    bearingReadout,
  };
}
