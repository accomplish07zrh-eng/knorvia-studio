// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBrowserApiCatalog } from "./api-catalog.js";
import type { BrowserApiManifest } from "./api-contract.js";
export type {
  BrowserApiMemberKind,
  BrowserApiManifestMember,
  BrowserApiManifestObject,
  BrowserApiManifest,
} from "./api-contract.js";
export { BrowserApiPolicy, createBrowserApiProxy } from "./api-policy.js";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const optional = (value: unknown, valid: (value: unknown) => boolean): boolean =>
  value === undefined || valid(value);
const stringMap = (value: unknown): boolean =>
  record(value) && Object.values(value).every((item) => typeof item === "string");

function declaration(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.signature === "string" &&
    optional(value.documented, (item) => typeof item === "boolean") &&
    optional(value.requiresCapabilities, strings) &&
    optional(
      value.unsupportedByDefaultIn,
      (item) => strings(item) && item.every((type) => ["iab", "extension", "cdp"].includes(type)),
    )
  );
}

function member(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.name === "string" &&
    ["method", "property"].includes(String(value.kind)) &&
    declaration(value) &&
    optional(value.command, (item) => typeof item === "string") &&
    optional(value.declarations, (item) => Array.isArray(item) && item.every(declaration))
  );
}

function manifest(value: unknown): value is BrowserApiManifest {
  return (
    record(value) &&
    typeof value.version === "number" &&
    Number.isFinite(value.version) &&
    optional(value.entrypoints, strings) &&
    optional(value.semantics, stringMap) &&
    optional(value.types, stringMap) &&
    record(value.objects) &&
    Object.values(value.objects).every(
      (object) => record(object) && Array.isArray(object.members) && object.members.every(member),
    )
  );
}

export function loadBrowserApiManifest(documentationRoot?: string): BrowserApiManifest {
  if (documentationRoot) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(documentationRoot, "api.json"), "utf8"));
      if (manifest(parsed)) return parsed;
    } catch {
      // 可选文档损坏不能让浏览器 SDK 无法初始化，继续使用内置接口目录。
    }
  }
  return createBrowserApiCatalog();
}
