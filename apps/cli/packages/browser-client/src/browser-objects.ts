// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { BrowserApiPolicy, createBrowserApiProxy } from "./manifest.js";
import { BrowserCommandError } from "./result.js";

/** Bind instance methods before applying a dynamic visibility policy. */
export function policyObject<T extends object>(
  value: T,
  name: string,
  policy: BrowserApiPolicy,
  hideUnknown = false,
): T {
  const receiver = new Proxy(value, {
    get(target, key) {
      const member = Reflect.get(target, key, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  return createBrowserApiProxy(receiver, name, policy, { hideUnknown });
}
export function unavailable(message: string): BrowserCommandError {
  return new BrowserCommandError(
    { method: "list" },
    { ok: false, elapsedMs: 0, error: { code: "backend_unavailable", message } },
    "backend_unavailable",
  );
}
