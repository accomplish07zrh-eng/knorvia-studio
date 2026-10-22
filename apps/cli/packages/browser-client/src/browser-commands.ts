// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserCommand, BrowserKeyModifier } from "@knorvia/contracts/browser-control";
import type {
  ClickOptions,
  ClickTarget,
  Evaluation,
  Point,
  ScreenshotOptions,
  ScrollOptions,
  SnapshotOptions,
} from "./facade-contract.js";

/** Protocol construction is pure; transport and result interpretation have separate owners. */
export const commands = {
  navigate: (url: string): BrowserCommand => ({ method: "navigate", url }),
  getState: (): BrowserCommand => ({ method: "getState" }),
  screenshot: (options?: ScreenshotOptions): BrowserCommand => ({
    method: "screenshot",
    ...options,
  }),
  snapshot: (options?: SnapshotOptions): BrowserCommand => ({ method: "snapshot", ...options }),
  back: (): BrowserCommand => ({ method: "back" }),
  forward: (): BrowserCommand => ({ method: "forward" }),
  reload: (): BrowserCommand => ({ method: "reload" }),
  close: (): BrowserCommand => ({ method: "close" }),
  click: (target: ClickTarget, options?: ClickOptions): BrowserCommand => ({
    method: "click",
    ...(typeof target === "string" ? { ref: target } : target),
    ...options,
  }),
  type: (text: string, options?: { ref?: string }): BrowserCommand => ({
    method: "type",
    text,
    ...options,
  }),
  press: (
    key: string,
    options?: { ref?: string; modifiers?: BrowserKeyModifier[] },
  ): BrowserCommand => ({ method: "press", key, ...options }),
  scroll: (options: ScrollOptions): BrowserCommand => ({ method: "scroll", ...options }),
  hover: (target: string | Point): BrowserCommand => ({
    method: "hover",
    ...(typeof target === "string" ? { ref: target } : target),
  }),
  select: (ref: string, values: string[]): BrowserCommand => ({ method: "select", ref, values }),
  check: (ref: string, checked = true): BrowserCommand => ({ method: "check", ref, checked }),
  drag: (
    from: string | Point,
    to: string | Point,
    options?: { modifiers?: BrowserKeyModifier[] },
  ): BrowserCommand => ({
    method: "drag",
    ...(typeof from === "string" ? { fromRef: from } : { from }),
    ...(typeof to === "string" ? { toRef: to } : { to }),
    ...options,
  }),
  elementInfo: (x: number, y: number): BrowserCommand => ({ method: "elementInfo", x, y }),
  evaluate: (expressionOrFn: Evaluation): BrowserCommand => ({
    method: "evaluate",
    expression:
      typeof expressionOrFn === "function" ? `(${String(expressionOrFn)})()` : expressionOrFn,
  }),
  getDialog: (): BrowserCommand => ({ method: "getDialog" }),
  handleDialog: (accept: boolean, promptText?: string): BrowserCommand => ({
    method: "handleDialog",
    accept,
    promptText,
  }),
};
