// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserPlaywrightAction } from "@knorvia/contracts/browser-control";
import type {
  Run,
  ObjectWrapper,
  TextMatcher,
  SelectOptionInput,
  LocatorClickOptions,
  LocatorCheckOptions,
  LocatorFilterOptions,
  WaitForState,
} from "./playwright-contract.js";
import {
  appendSelector,
  matchText,
  query,
  roleQuery,
  testIdQuery,
  requireSelector,
} from "./playwright-selectors.js";
import {
  evaluateExpression,
  identityWrapper,
  locatorIdentity,
  publicObject,
  readAction,
  sendAction,
  withActionContext,
} from "./playwright-runtime.js";

type LocatorAction = Omit<
  Extract<BrowserPlaywrightAction, { name: "locator" }>,
  "name" | "selector"
>;
type Timeout = { timeoutMs?: number };

export class PlaywrightLocator {
  #run: Run;
  #owner: object;
  #selector: string;
  #wrap: ObjectWrapper;
  constructor(run: Run, owner: object, selector: string, wrap: ObjectWrapper = identityWrapper) {
    this.#run = run;
    this.#owner = owner;
    this.#selector = selector;
    this.#wrap = wrap;
  }
  [locatorIdentity]() {
    return { owner: this.#owner, selector: this.#selector };
  }
  #create(selector: string): PlaywrightLocator {
    return publicObject(
      new PlaywrightLocator(this.#run, this.#owner, selector, this.#wrap),
      "PlaywrightLocator",
      this.#wrap,
    );
  }
  #command(action: LocatorAction): Extract<BrowserPlaywrightAction, { name: "locator" }> {
    return { name: "locator", selector: this.#selector, ...action };
  }
  #change(action: LocatorAction, description: string): Promise<void> {
    return withActionContext(
      () => sendAction(this.#run, this.#command(action)),
      `${description} for selector ${this.#selector}`,
    );
  }
  #value<T>(action: LocatorAction): Promise<T> {
    return readAction(this.#run, this.#command(action));
  }
  #compatible(locator: PlaywrightLocator, operation: string): string {
    if (!(locator instanceof PlaywrightLocator))
      throw new Error(`${operation} requires a PlaywrightLocator`);
    const identity = locator[locatorIdentity]();
    if (identity.owner !== this.#owner) throw new Error("Locators must belong to the same tab");
    return identity.selector;
  }
  click(options: LocatorClickOptions = {}): Promise<void> {
    return this.#change({ operation: "click", ...options }, "waiting on click");
  }
  dblclick(options: LocatorClickOptions = {}): Promise<void> {
    return this.#change({ operation: "dblclick", ...options }, "waiting on dblclick");
  }
  selectOption(
    input: SelectOptionInput | SelectOptionInput[],
    { timeoutMs }: Timeout = {},
  ): Promise<void> {
    return withActionContext(async () => {
      const selections = (Array.isArray(input) ? input : [input]).map((selection) => {
        if (typeof selection === "string") return { value: selection };
        if (!selection || typeof selection !== "object")
          throw new Error("locator.selectOption requires a string or { value?, label?, index? }");
        if (
          selection.value === undefined &&
          selection.label === undefined &&
          selection.index === undefined
        )
          throw new Error(
            "locator.selectOption requires value, label, or index for each selection",
          );
        return selection;
      });
      if (!selections.length) throw new Error("locator.selectOption requires at least one value");
      await sendAction(
        this.#run,
        this.#command({ operation: "selectOption", selections, timeoutMs }),
      );
    }, `locator.selectOption failed for selector ${this.#selector}`);
  }
  async fill(value: string, { timeoutMs }: Timeout = {}): Promise<void> {
    if (value === undefined || value === null) throw new Error("locator.fill requires a value");
    await this.#change(
      { operation: "fill", value, replace: true, timeoutMs },
      "locator.fill failed",
    );
  }
  async type(value: string, { timeoutMs }: Timeout = {}): Promise<void> {
    if (value === undefined || value === null) throw new Error("locator.type requires a value");
    await this.#change(
      { operation: "fill", value, replace: false, timeoutMs },
      "locator.type failed",
    );
  }
  async press(value: string, { timeoutMs }: Timeout = {}): Promise<void> {
    if (value === undefined || value === null) throw new Error("locator.press requires a value");
    await this.#change({ operation: "press", value, timeoutMs }, "locator.press failed");
  }
  setChecked(checked: boolean, options: LocatorCheckOptions = {}): Promise<void> {
    return this.#change(
      { operation: "setChecked", checked, ...options },
      `locator.setChecked(${checked}) failed`,
    );
  }
  check(options?: LocatorCheckOptions): Promise<void> {
    return this.setChecked(true, options);
  }
  uncheck(options?: LocatorCheckOptions): Promise<void> {
    return this.setChecked(false, options);
  }
  async waitFor(options: { state: WaitForState; timeoutMs?: number }): Promise<void> {
    if (!options?.state) throw new Error("locator.waitFor requires a state");
    await this.#change(
      { operation: "waitFor", ...options },
      `locator.waitFor(${options.state}) timed out`,
    );
  }
  count(): Promise<number> {
    return this.#value({ operation: "count" });
  }
  async all(): Promise<PlaywrightLocator[]> {
    const length = await this.count();
    return Array.from({ length }, (_, index) => this.nth(index));
  }
  textContent({ timeoutMs }: Timeout = {}): Promise<string | null> {
    return this.#value({ operation: "textContent", timeoutMs });
  }
  innerText({ timeoutMs }: Timeout = {}): Promise<string> {
    return this.#value({ operation: "innerText", timeoutMs });
  }
  getAttribute(name: string, { timeoutMs }: Timeout = {}): Promise<string | null> {
    if (!name) throw new Error("locator.getAttribute requires a name");
    return this.#value({ operation: "getAttribute", attribute: name, timeoutMs });
  }
  isVisible(): Promise<boolean> {
    return this.#value({ operation: "isVisible" });
  }
  isEnabled(): Promise<boolean> {
    return this.#value({ operation: "isEnabled" });
  }
  allTextContents({ timeoutMs }: Timeout = {}): Promise<string[]> {
    return this.#value({ operation: "allTextContents", timeoutMs });
  }
  evaluate<TResult, TArg = unknown>(
    pageFunction: string | ((element: Element, arg: TArg) => TResult | Promise<TResult>),
    arg?: TArg,
    options?: Timeout,
  ): Promise<TResult> {
    return this.#value({
      operation: "evaluate",
      ...evaluateExpression(pageFunction, "locator.evaluate"),
      arg,
      timeoutMs: options?.timeoutMs,
    });
  }
  downloadMedia({ timeoutMs }: Timeout = {}): Promise<void> {
    return this.#change({ operation: "downloadMedia", timeoutMs }, "locator.downloadMedia failed");
  }
  locator(selector: string, options?: Omit<LocatorFilterOptions, "visible">): PlaywrightLocator {
    const nested = this.#create(
      appendSelector(this.#selector, requireSelector(selector, "locator.locator")),
    );
    return nested.filter(options);
  }
  first(): PlaywrightLocator {
    return this.nth(0);
  }
  last(): PlaywrightLocator {
    return this.nth(-1);
  }
  nth(index: number): PlaywrightLocator {
    return this.#create(appendSelector(this.#selector, `nth=${index}`));
  }
  and(locator: PlaywrightLocator): PlaywrightLocator {
    return this.#create(
      appendSelector(
        this.#selector,
        `internal:and=${JSON.stringify(this.#compatible(locator, "locator.and"))}`,
      ),
    );
  }
  or(locator: PlaywrightLocator): PlaywrightLocator {
    return this.#create(
      appendSelector(
        this.#selector,
        `internal:or=${JSON.stringify(this.#compatible(locator, "locator.or"))}`,
      ),
    );
  }
  filter(options: LocatorFilterOptions = {}): PlaywrightLocator {
    const clauses: string[] = [];
    if (options.hasText !== undefined)
      clauses.push(`internal:has-text=${matchText(options.hasText, false, "locator.filter")}`);
    if (options.hasNotText !== undefined)
      clauses.push(
        `internal:has-not-text=${matchText(options.hasNotText, false, "locator.filter")}`,
      );
    if (options.has !== undefined)
      clauses.push(
        `internal:has=${JSON.stringify(this.#compatible(options.has, "locator.filter has"))}`,
      );
    if (options.hasNot !== undefined)
      clauses.push(
        `internal:has-not=${JSON.stringify(this.#compatible(options.hasNot, "locator.filter hasNot"))}`,
      );
    if (options.visible !== undefined) {
      if (typeof options.visible !== "boolean")
        throw new Error("locator.filter visible must be a boolean");
      clauses.push(`visible=${options.visible}`);
    }
    return this.#create([this.#selector, ...clauses].join(" >> "));
  }
  getByRole(role: string, options?: { exact?: boolean; name?: TextMatcher }): PlaywrightLocator {
    return this.#create(appendSelector(this.#selector, roleQuery(role, options)));
  }
  getByText(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator {
    return this.#create(appendSelector(this.#selector, query("Text", text, options?.exact)));
  }
  getByLabel(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator {
    return this.#create(appendSelector(this.#selector, query("Label", text, options?.exact)));
  }
  getByPlaceholder(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator {
    return this.#create(appendSelector(this.#selector, query("Placeholder", text, options?.exact)));
  }
  getByTestId(testId: string): PlaywrightLocator {
    return this.#create(appendSelector(this.#selector, testIdQuery(testId)));
  }
}
