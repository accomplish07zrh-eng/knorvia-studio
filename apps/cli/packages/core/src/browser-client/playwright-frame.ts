// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Run, ObjectWrapper, TextMatcher } from "./playwright-contract.js";
import { PlaywrightLocator } from "./playwright-locator.js";
import {
  appendSelector,
  frameScope,
  query,
  roleQuery,
  testIdQuery,
  requireSelector,
} from "./playwright-selectors.js";
import { identityWrapper, publicObject } from "./playwright-runtime.js";

export class PlaywrightFrameLocator {
  #run: Run;
  #owner: object;
  #selector: string;
  #wrap: ObjectWrapper;
  constructor(
    run: Run,
    owner: object,
    frameSelector: string,
    wrap: ObjectWrapper = identityWrapper,
  ) {
    this.#run = run;
    this.#owner = owner;
    this.#selector = frameSelector;
    this.#wrap = wrap;
  }
  #locator(selector: string): PlaywrightLocator {
    const scoped = appendSelector(frameScope(this.#selector), selector);
    return publicObject(
      new PlaywrightLocator(this.#run, this.#owner, scoped, this.#wrap),
      "PlaywrightLocator",
      this.#wrap,
    );
  }
  locator(selector: string): PlaywrightLocator {
    return this.#locator(requireSelector(selector, "frameLocator.locator"));
  }
  frameLocator(selector: string): PlaywrightFrameLocator {
    const scoped = appendSelector(
      frameScope(this.#selector),
      requireSelector(selector, "frameLocator.frameLocator"),
    );
    return publicObject(
      new PlaywrightFrameLocator(this.#run, this.#owner, scoped, this.#wrap),
      "PlaywrightFrameLocator",
      this.#wrap,
    );
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
}
