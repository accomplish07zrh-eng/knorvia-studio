// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  BROWSER_VIEWPORT_LIMITS,
  type BrowserCommand,
  type BrowserCommandResult,
  type BrowserKeyModifier,
  type BrowserTabSummary,
  type BrowserViewportSize,
} from "@knorvia/contracts/browser-control";
import type {
  BrowserCapabilityInfo,
  BrowserExecuteFn,
  ClickOptions,
  ClickTarget,
  Evaluation,
  Point,
  ScreenshotOptions,
  ScrollOptions,
  SnapshotOptions,
} from "./facade-contract.js";
import { BrowserApiPolicy, createBrowserApiProxy } from "./manifest.js";
import {
  createPlaywrightAPI,
  configurePlaywrightObjectWrapper,
  type PlaywrightAPI,
} from "./playwright.js";
import { identityWrapper } from "./playwright-runtime.js";
import type { ObjectWrapper } from "./playwright-contract.js";
import { commands } from "./browser-commands.js";
import { RawTab } from "./raw-tab.js";
import { BrowserCapabilityCollection } from "./browser-capabilities.js";
import { BrowserRecordingAPI } from "./browser-recording.js";
import { createDialog, type JsDialog } from "./browser-dialogs.js";
import { createCua, createDomCua } from "./tab-cua.js";
import { base64ToBytes, expectOk, expectPayload } from "./result.js";

export class Tab {
  readonly id: string;
  readonly tabId?: string;
  readonly raw: RawTab;
  readonly capabilities: BrowserCapabilityCollection;
  playwright: PlaywrightAPI;
  recording: BrowserRecordingAPI;
  #send: BrowserExecuteFn;
  #viewport: BrowserViewportSize | null;
  #wrap: ObjectWrapper = identityWrapper;
  constructor(
    execute: BrowserExecuteFn,
    tabId?: string,
    summary?: Pick<BrowserTabSummary, "url" | "title" | "active" | "viewport">,
    capabilityDescriptors: readonly BrowserCapabilityInfo[] = [],
    readCapabilityDocumentation: (name?: string) => string = () => "",
  ) {
    this.id = tabId ?? "";
    this.tabId = tabId;
    this.#send = execute;
    this.#viewport = summary?.viewport ? { ...summary.viewport } : null;
    const run: BrowserExecuteFn = (command) => this.#run(command);
    this.raw = new RawTab(run);
    this.playwright = createPlaywrightAPI(run);
    this.recording = new BrowserRecordingAPI(run);
    this.capabilities = new BrowserCapabilityCollection(
      () => capabilityDescriptors,
      readCapabilityDocumentation,
    );
  }
  #run(command: BrowserCommand): Promise<BrowserCommandResult> {
    const scoped: BrowserCommand & { tabId?: string } = this.tabId
      ? { ...command, tabId: this.tabId }
      : command;
    return this.#send(scoped);
  }
  async #result(command: BrowserCommand): Promise<BrowserCommandResult> {
    return expectOk(command, await this.#run(command));
  }
  async #action(command: BrowserCommand): Promise<void> {
    await this.#result(command);
  }
  async #payload<K extends keyof BrowserCommandResult>(
    command: BrowserCommand,
    field: K,
  ): Promise<NonNullable<BrowserCommandResult[K]>> {
    const result = await this.#run(command);
    return expectPayload(command, result, result[field], field) as NonNullable<
      BrowserCommandResult[K]
    >;
  }
  applyPlaywrightPolicy(policy: BrowserApiPolicy): this {
    this.#wrap = (value, name) => createBrowserApiProxy(value, name, policy, { hideUnknown: true });
    this.playwright = configurePlaywrightObjectWrapper(this.playwright, this.#wrap);
    this.recording = this.#wrap(this.recording, "BrowserRecordingAPI");
    return this;
  }
  goto(url: string): Promise<void> {
    return this.#action(commands.navigate(url));
  }
  navigate(url: string): Promise<void> {
    return this.goto(url);
  }
  async url(): Promise<string | undefined> {
    return (await this.getState()).url;
  }
  async title(): Promise<string | undefined> {
    return (await this.getState()).title;
  }
  getState() {
    return this.#payload(commands.getState(), "state");
  }
  async setViewportSize(viewportSize: BrowserViewportSize): Promise<void> {
    const limits = BROWSER_VIEWPORT_LIMITS;
    const width = viewportSize?.width,
      height = viewportSize?.height;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < limits.minWidth ||
      width > limits.maxWidth ||
      height < limits.minHeight ||
      height > limits.maxHeight
    )
      throw new TypeError(
        `setViewportSize requires integer width ${limits.minWidth}..${limits.maxWidth} and height ${limits.minHeight}..${limits.maxHeight}`,
      );
    await this.#action({ method: "browserViewportSet", width, height });
    this.#viewport = { width, height };
  }
  viewportSize(): BrowserViewportSize | null {
    return this.#viewport && { ...this.#viewport };
  }
  async screenshot(options?: Omit<ScreenshotOptions, "ref">): Promise<Uint8Array> {
    return base64ToBytes((await this.#payload(commands.screenshot(options), "image")).base64);
  }
  back(): Promise<void> {
    return this.#action(commands.back());
  }
  forward(): Promise<void> {
    return this.#action(commands.forward());
  }
  reload(): Promise<void> {
    return this.#action(commands.reload());
  }
  snapshot(options?: SnapshotOptions) {
    return this.#payload(commands.snapshot(options), "snapshot");
  }
  click(target: ClickTarget, options?: ClickOptions): Promise<void> {
    return this.#action(commands.click(target, options));
  }
  type(text: string, options?: { ref?: string }): Promise<void> {
    return this.#action(commands.type(text, options));
  }
  press(key: string, options?: { ref?: string; modifiers?: BrowserKeyModifier[] }): Promise<void> {
    return this.#action(commands.press(key, options));
  }
  scroll(options: ScrollOptions): Promise<void> {
    return this.#action(commands.scroll(options));
  }
  hover(target: string | Point): Promise<void> {
    return this.#action(commands.hover(target));
  }
  select(ref: string, values: string[]): Promise<void> {
    return this.#action(commands.select(ref, values));
  }
  check(ref: string, checked = true): Promise<void> {
    return this.#action(commands.check(ref, checked));
  }
  drag(
    from: string | Point,
    to: string | Point,
    options?: { modifiers?: BrowserKeyModifier[] },
  ): Promise<void> {
    return this.#action(commands.drag(from, to, options));
  }
  close(): Promise<void> {
    return this.#action(commands.close());
  }
  finalize(options?: { deliverable?: boolean }): Promise<void> {
    return this.#action({ method: "finalize", ...options });
  }
  markDeliverable(): Promise<void> {
    return this.#action({ method: "markDeliverable", tabId: this.id });
  }
  markHandoff(): Promise<void> {
    return this.#action({ method: "markHandoff", tabId: this.id });
  }
  async elementInfo(x: number, y: number) {
    return (await this.#result(commands.elementInfo(x, y))).element;
  }
  async evaluate(expressionOrFn: Evaluation): Promise<unknown> {
    return (await this.#result(commands.evaluate(expressionOrFn))).value;
  }
  async getDialog() {
    return (await this.#result(commands.getDialog())).dialog ?? null;
  }
  async getJsDialog(): Promise<JsDialog | undefined> {
    const dialog = await this.getDialog();
    if (!dialog) return undefined;
    const view = createDialog(dialog.type, (accept, promptText) =>
      this.handleDialog(accept, promptText),
    );
    const names = {
      alert: "AlertDialog",
      confirm: "ConfirmDialog",
      prompt: "PromptDialog",
      beforeunload: "BeforeUnloadDialog",
    };
    return this.#wrap(view, names[view.type]);
  }
  handleDialog(accept: boolean, promptText?: string): Promise<void> {
    return this.#action(commands.handleDialog(accept, promptText));
  }
  get cua() {
    return this.#wrap(
      createCua((command) => this.#action(command)),
      "CUAAPI",
    );
  }
  get dom_cua() {
    return this.#wrap(
      createDomCua(
        (command) => this.#action(command),
        () => this.snapshot(),
      ),
      "DomCUAAPI",
    );
  }
}
