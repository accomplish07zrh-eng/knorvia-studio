// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  BrowserCommand,
  BrowserKeyModifier,
  BrowserSnapshot,
} from "@knorvia/contracts/browser-control";
import type { CuaTab, DomCuaTab } from "./facade-contract.js";

type Act = (command: BrowserCommand) => Promise<void>;
const modifierNames = new Set(["Alt", "Control", "ControlOrMeta", "Meta", "Shift"]);
function modifiers(keys?: string[]): BrowserKeyModifier[] | undefined {
  const recognized = keys?.filter((key): key is BrowserKeyModifier => modifierNames.has(key));
  return recognized?.length ? recognized : undefined;
}
function mouseButton(button = 1): "left" | "middle" | "right" {
  const name = new Map([
    [1, "left"],
    [2, "middle"],
    [3, "right"],
  ] as const).get(button as 1 | 2 | 3);
  if (!name) throw new Error(`Unsupported CUA mouse button: ${button}`);
  return name;
}
export function createCua(act: Act): CuaTab {
  return {
    click: (options) =>
      act({
        method: "click",
        x: options.x,
        y: options.y,
        button: mouseButton(options.button),
        modifiers: modifiers(options.keypress),
      }),
    double_click: (options) =>
      act({
        method: "click",
        x: options.x,
        y: options.y,
        doubleClick: true,
        modifiers: modifiers(options.keypress),
      }),
    downloadMedia: (options) => act({ method: "click", x: options.x, y: options.y }),
    drag: (options) =>
      act({ method: "cuaDrag", path: options.path, modifiers: modifiers(options.keys) }),
    keypress: (options) => act({ method: "cuaKeypress", keys: options.keys }),
    move: (options) =>
      act({ method: "hover", x: options.x, y: options.y, modifiers: modifiers(options.keys) }),
    scroll: (options) =>
      act({
        method: "cuaScroll",
        x: options.x,
        y: options.y,
        scrollX: options.scrollX,
        scrollY: options.scrollY,
        modifiers: modifiers(options.keypress),
      }),
    type: (options) => act({ method: "type", text: options.text }),
  };
}
export function createDomCua(act: Act, snapshot: () => Promise<BrowserSnapshot>): DomCuaTab {
  return {
    get_visible_dom: snapshot,
    click: (options) => act({ method: "click", ref: options.node_id }),
    double_click: (options) => act({ method: "click", ref: options.node_id, doubleClick: true }),
    downloadMedia: (options) => act({ method: "click", ref: options.node_id }),
    type: (options) => act({ method: "type", text: options.text }),
    scroll: (options) =>
      act({
        method: "domCuaScroll",
        nodeId: options.node_id,
        scrollX: options.x,
        scrollY: options.y,
      }),
    keypress: (options) => act({ method: "cuaKeypress", keys: options.keys }),
  };
}
