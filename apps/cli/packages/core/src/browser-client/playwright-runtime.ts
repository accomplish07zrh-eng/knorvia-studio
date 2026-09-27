// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserPlaywrightAction } from "@knorvia/contracts/browser-control";
import { createBrowserApiCatalog } from "./api-catalog.js";
import { expectOk } from "./result.js";
import type { ObjectWrapper, Run } from "./playwright-contract.js";

export const locatorIdentity = Symbol("knorvia.browser.locator");
export const installObjectWrapper = Symbol("knorvia.browser.object-wrapper");
export const identityWrapper: ObjectWrapper = (value) => value;
const publicNames = new Map(
  Object.entries(createBrowserApiCatalog().objects).map(([name, definition]) => [
    name,
    new Set(definition.members.map((member) => member.name)),
  ]),
);

/** The immutable interface catalog is the sole source of the default public view. */
export function publicObject<T extends object>(
  value: T,
  name: string,
  wrapper: ObjectWrapper = identityWrapper,
): T {
  const allowed = (key: string | symbol) =>
    typeof key === "symbol" || publicNames.get(name)?.has(key) === true;
  const view = new Proxy(value, {
    get(target, key) {
      if (!allowed(key)) return undefined;
      const member = Reflect.get(target, key, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
    has: (target, key) => allowed(key) && Reflect.has(target, key),
    ownKeys: (target) => Reflect.ownKeys(target).filter(allowed),
    getOwnPropertyDescriptor: (target, key) =>
      allowed(key) ? Reflect.getOwnPropertyDescriptor(target, key) : undefined,
  });
  return wrapper(view, name);
}

export async function sendAction(run: Run, action: BrowserPlaywrightAction) {
  const command = { method: "playwright" as const, action };
  return expectOk(command, await run(command));
}

export async function readAction<T>(run: Run, action: BrowserPlaywrightAction): Promise<T> {
  return (await sendAction(run, action)).value as T;
}

export async function withActionContext(
  invoke: () => Promise<unknown>,
  context: string,
): Promise<void> {
  try {
    await invoke();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const error = new Error(`${detail}\n${context}`, { cause });
    if (cause instanceof Error && cause.stack) {
      const frames = cause.stack.split("\n").filter((line) => /^\s+at\s/.test(line));
      error.stack = `${error.name}: ${error.message}\n${frames.join("\n")}`;
    }
    throw error;
  }
}

export function evaluateExpression(
  value: unknown,
  name: string,
): { expression: string; expressionKind: "string" | "function" } {
  if (typeof value !== "string" && typeof value !== "function")
    throw new Error(`${name} requires a string or function`);
  return {
    expression: String(value),
    expressionKind: typeof value === "string" ? "string" : "function",
  };
}
