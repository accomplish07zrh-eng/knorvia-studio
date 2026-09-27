// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  Run,
  ObjectWrapper,
  TextMatcher,
  LoadState,
  WaitUntil,
  ElementInfo,
} from "./playwright-contract.js";
import { PlaywrightLocator } from "./playwright-locator.js";
import { PlaywrightFrameLocator } from "./playwright-frame.js";
import { PlaywrightDownload, PlaywrightFileChooser } from "./playwright-handles.js";
import { query, roleQuery, testIdQuery, requireSelector } from "./playwright-selectors.js";
import {
  evaluateExpression,
  identityWrapper,
  installObjectWrapper,
  publicObject,
  readAction,
  sendAction,
} from "./playwright-runtime.js";
import { base64ToBytes, expectOk } from "./result.js";

type Timeout = { timeoutMs?: number };
type PointOptions = { x: number; y: number; includeNonInteractable?: boolean };

function validatePoint(point: PointOptions, operation: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error(`playwright.${operation} requires numeric x and y coordinates`);
}

export class PlaywrightAPI {
  #run: Run;
  #owner = {};
  #wrap: ObjectWrapper = identityWrapper;
  constructor(run: Run) {
    this.#run = run;
  }
  [installObjectWrapper](wrap: ObjectWrapper): void {
    this.#wrap = wrap;
  }
  #locator(selector: string): PlaywrightLocator {
    return publicObject(
      new PlaywrightLocator(this.#run, this.#owner, selector, this.#wrap),
      "PlaywrightLocator",
      this.#wrap,
    );
  }
  evaluate<TResult, TArg = unknown>(
    pageFunction: string | ((arg: TArg) => TResult | Promise<TResult>),
    arg?: TArg,
    options?: Timeout,
  ): Promise<TResult> {
    return readAction(this.#run, {
      name: "evaluate",
      ...evaluateExpression(pageFunction, "playwright.evaluate"),
      arg,
      timeoutMs: options?.timeoutMs,
    });
  }
  locator(selector: string): PlaywrightLocator {
    return this.#locator(requireSelector(selector, "playwright.locator"));
  }
  getByRole(role: string, options?: { exact?: boolean; name?: TextMatcher }): PlaywrightLocator {
    return this.#locator(roleQuery(role, options));
  }
  getByText(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator {
    return this.#locator(query("Text", text, options?.exact));
  }
  getByLabel(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator {
    return this.#locator(query("Label", text, options?.exact));
  }
  getByPlaceholder(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator {
    return this.#locator(query("Placeholder", text, options?.exact));
  }
  getByTestId(testId: string): PlaywrightLocator {
    return this.#locator(testIdQuery(testId));
  }
  frameLocator(selector: string): PlaywrightFrameLocator {
    const frame = new PlaywrightFrameLocator(
      this.#run,
      this.#owner,
      requireSelector(selector, "playwright.frameLocator"),
      this.#wrap,
    );
    return publicObject(frame, "PlaywrightFrameLocator", this.#wrap);
  }
  async waitForURL(url: string, options: Timeout & { waitUntil?: WaitUntil } = {}): Promise<void> {
    await sendAction(this.#run, { name: "waitForURL", url, ...options });
  }
  async waitForLoadState(options: Timeout & { state?: LoadState } = {}): Promise<void> {
    await sendAction(this.#run, { name: "waitForLoadState", ...options });
  }
  async waitForTimeout(timeoutMs: number): Promise<void> {
    const command = { method: "playwrightWaitForTimeout" as const, timeoutMs };
    expectOk(command, await this.#run(command));
  }
  waitForEvent(event: "download", options?: Timeout): Promise<PlaywrightDownload>;
  waitForEvent(event: "filechooser", options?: Timeout): Promise<PlaywrightFileChooser>;
  async waitForEvent(
    event: "download" | "filechooser",
    options: Timeout = {},
  ): Promise<PlaywrightDownload | PlaywrightFileChooser> {
    if (event !== "download" && event !== "filechooser")
      throw new Error("playwright.waitForEvent only supports 'download' and 'filechooser'");
    const value = await readAction<{ id: string; isMultiple?: boolean }>(this.#run, {
      name: "waitForEvent",
      event,
      timeoutMs: options.timeoutMs,
    });
    return event === "download"
      ? publicObject(new PlaywrightDownload(this.#run, value.id), "PlaywrightDownload", this.#wrap)
      : publicObject(
          new PlaywrightFileChooser(this.#run, value.id, Boolean(value.isMultiple)),
          "PlaywrightFileChooser",
          this.#wrap,
        );
  }
  async expectNavigation<T>(
    action: () => Promise<T>,
    options: Timeout & { url?: string; waitUntil?: LoadState } = {},
  ): Promise<T> {
    const waiting = options.url
      ? this.waitForURL(options.url, { timeoutMs: options.timeoutMs, waitUntil: options.waitUntil })
      : this.waitForLoadState({ timeoutMs: options.timeoutMs, state: options.waitUntil });
    // 同步抛错也转为 Promise 拒绝，让等待失败始终有接收者，不形成未处理 rejection。
    const acting = new Promise<T>((resolve) => resolve(action()));
    const [result] = await Promise.all([acting, waiting]);
    return result;
  }
  elementInfo(options: PointOptions): Promise<ElementInfo[]> {
    validatePoint(options, "elementInfo");
    return readAction(this.#run, { name: "elementInfo", ...options });
  }
  async elementScreenshot(options: PointOptions): Promise<Uint8Array> {
    validatePoint(options, "elementScreenshot");
    const result = await sendAction(this.#run, { name: "elementScreenshot", ...options });
    if (!result.image) throw new Error("Browser result missing image");
    return base64ToBytes(result.image.base64);
  }
  domSnapshot(): Promise<string> {
    return readAction(this.#run, { name: "domSnapshot" });
  }
}

export function createPlaywrightAPI(run: Run): PlaywrightAPI {
  return publicObject(new PlaywrightAPI(run), "PlaywrightAPI");
}

export function configurePlaywrightObjectWrapper(
  api: PlaywrightAPI,
  wrap: ObjectWrapper,
): PlaywrightAPI {
  api[installObjectWrapper](wrap);
  return wrap(api, "PlaywrightAPI");
}
