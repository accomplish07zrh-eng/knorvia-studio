// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { isRegExp } from "node:util/types";
import type { TextMatcher } from "./playwright-contract.js";

export function matchText(value: TextMatcher, exact: boolean, method: string): string {
  if (typeof value === "string") return JSON.stringify(value) + (exact ? "s" : "i");
  if (isRegExp(value)) return value.toString();
  throw new Error(`${method} requires a string or RegExp`);
}

export function query(
  kind: "Text" | "Label" | "Placeholder",
  value: TextMatcher,
  exact = false,
): string {
  const encoded = matchText(value, exact, `getBy${kind}`);
  return kind === "Placeholder"
    ? `internal:attr=[placeholder=${encoded}]`
    : `internal:${kind.toLowerCase()}=${encoded}`;
}

export function roleQuery(
  role: string,
  options: { name?: TextMatcher; exact?: boolean } = {},
): string {
  if (!role) throw new Error("getByRole requires a role");
  const name =
    options.name === undefined
      ? ""
      : `[name=${matchText(options.name, options.exact ?? false, "getByRole")}]`;
  return `internal:role=${role}${name}`;
}

export function testIdQuery(id: string): string {
  if (!id) throw new Error("getByTestId requires a testId");
  return `internal:testid=[data-testid=${JSON.stringify(id)}s]`;
}

export function requireSelector(selector: string, method: string): string {
  if (!selector) throw new Error(`${method} requires a selector`);
  return selector;
}

export const appendSelector = (parent: string, child: string) => `${parent} >> ${child}`;
export const frameScope = (selector: string) =>
  appendSelector(selector, "internal:control=enter-frame");
