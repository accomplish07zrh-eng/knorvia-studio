// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserKeyModifier } from "@knorvia/contracts/browser-control";
import type {
  BrowserExecuteFn,
  ClickOptions,
  ClickTarget,
  Evaluation,
  Point,
  ScreenshotOptions,
  ScrollOptions,
  SnapshotOptions,
} from "./facade-contract.js";
import { commands } from "./browser-commands.js";

export class RawTab {
  #send: BrowserExecuteFn;
  constructor(run: BrowserExecuteFn) {
    this.#send = run;
  }
  navigate(url: string) {
    return this.#send(commands.navigate(url));
  }
  getState() {
    return this.#send(commands.getState());
  }
  screenshot(options?: ScreenshotOptions) {
    return this.#send(commands.screenshot(options));
  }
  back() {
    return this.#send(commands.back());
  }
  forward() {
    return this.#send(commands.forward());
  }
  reload() {
    return this.#send(commands.reload());
  }
  snapshot(options?: SnapshotOptions) {
    return this.#send(commands.snapshot(options));
  }
  click(target: ClickTarget, options?: ClickOptions) {
    return this.#send(commands.click(target, options));
  }
  type(text: string, options?: { ref?: string }) {
    return this.#send(commands.type(text, options));
  }
  press(key: string, options?: { ref?: string; modifiers?: BrowserKeyModifier[] }) {
    return this.#send(commands.press(key, options));
  }
  scroll(options: ScrollOptions) {
    return this.#send(commands.scroll(options));
  }
  hover(target: string | Point) {
    return this.#send(commands.hover(target));
  }
  select(ref: string, values: string[]) {
    return this.#send(commands.select(ref, values));
  }
  check(ref: string, checked = true) {
    return this.#send(commands.check(ref, checked));
  }
  drag(from: string | Point, to: string | Point, options?: { modifiers?: BrowserKeyModifier[] }) {
    return this.#send(commands.drag(from, to, options));
  }
  close() {
    return this.#send(commands.close());
  }
  elementInfo(x: number, y: number) {
    return this.#send(commands.elementInfo(x, y));
  }
  evaluate(expressionOrFn: Evaluation) {
    return this.#send(commands.evaluate(expressionOrFn));
  }
  getDialog() {
    return this.#send(commands.getDialog());
  }
  handleDialog(accept: boolean, promptText?: string) {
    return this.#send(commands.handleDialog(accept, promptText));
  }
}
