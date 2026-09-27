// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";
import { BrowserApiPolicy, loadBrowserApiManifest, type BrowserApiManifest } from "./manifest.js";
import { BROWSER_FALLBACK_GUIDE, renderBrowserDocumentation } from "./documentation-render.js";

interface Conditions {
  browserTypes?: string[];
  requiredApiMembers?: string[];
  requiredBrowserCapabilities?: string[];
  requiredTabCapabilities?: string[];
}
interface DocumentEntry {
  path: string;
  name?: string;
  title?: string;
  mode?: "included" | "lookup";
  when?: Conditions;
}
interface DocumentIndex {
  title?: string;
  documents: DocumentEntry[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function inside(root: string, path: string): boolean {
  const distance = relative(root, path);
  return distance !== ".." && !distance.startsWith(`..${sep}`) && !isAbsolute(distance);
}

function documentPath(root: string, path: string): string | undefined {
  const rejectOutside = () => {
    console.warn(
      "[Knorvia Browser Docs] A reference outside the documentation directory was ignored.",
    );
    return undefined;
  };
  if (isAbsolute(path) || win32.isAbsolute(path)) return rejectOutside();
  const candidate = resolve(root, path);
  if (!inside(root, candidate)) return rejectOutside();
  try {
    const physical = realpathSync(candidate);
    // 同时检查真实路径，避免 junction 或 symlink 绕过文档目录边界。
    return inside(root, physical) ? physical : rejectOutside();
  } catch (error) {
    if (!record(error) || error.code !== "ENOENT")
      console.warn("[Knorvia Browser Docs] A documentation reference could not be resolved.");
    return undefined;
  }
}

function readDocument(root: string, path: string): string | undefined {
  const candidate = documentPath(root, path);
  if (!candidate) return undefined;
  try {
    return readFileSync(candidate, "utf8");
  } catch {
    console.warn("[Knorvia Browser Docs] A documentation file could not be read.");
    return undefined;
  }
}

function isEntry(value: unknown): value is DocumentEntry {
  if (!record(value) || typeof value.path !== "string") return false;
  if (value.name !== undefined && typeof value.name !== "string") return false;
  if (value.title !== undefined && typeof value.title !== "string") return false;
  if (value.mode !== undefined && value.mode !== "included" && value.mode !== "lookup")
    return false;
  if (value.when === undefined) return true;
  const conditions = value.when;
  if (!record(conditions)) return false;
  return [
    "browserTypes",
    "requiredApiMembers",
    "requiredBrowserCapabilities",
    "requiredTabCapabilities",
  ].every((key) => conditions[key] === undefined || strings(conditions[key]));
}

function indexFrom(text: string | undefined): DocumentIndex {
  try {
    const parsed: unknown = JSON.parse(text ?? "{}");
    if (!record(parsed) || (parsed.documents !== undefined && !Array.isArray(parsed.documents))) {
      console.warn(
        "[Knorvia Browser Docs] Invalid documents.json; the document list is unavailable.",
      );
      return { documents: [] };
    }
    const documents = Array.isArray(parsed.documents) ? parsed.documents.filter(isEntry) : [];
    if (Array.isArray(parsed.documents) && documents.length !== parsed.documents.length)
      console.warn("[Knorvia Browser Docs] Invalid entries in documents.json were ignored.");
    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      documents,
    };
  } catch {
    console.warn(
      "[Knorvia Browser Docs] Unable to parse documents.json; the document list is unavailable.",
    );
    return { documents: [] };
  }
}

function applies(
  entry: DocumentEntry,
  descriptor: BrowserBackendDescriptor | undefined,
  policy: BrowserApiPolicy | undefined,
): boolean {
  if (!entry.when) return true;
  if (!descriptor || !policy) return false;
  const conditions = entry.when;
  if (conditions.browserTypes && !conditions.browserTypes.includes(descriptor.type)) return false;
  const available = (scope: "browser" | "tab", requirements: string[] = []) =>
    requirements.every((id) =>
      descriptor.capabilities[scope]?.some((capability) => capability.id === id),
    );
  if (
    !available("browser", conditions.requiredBrowserCapabilities) ||
    !available("tab", conditions.requiredTabCapabilities)
  )
    return false;
  return (conditions.requiredApiMembers ?? []).every((qualified) => {
    const dot = qualified.indexOf(".");
    if (dot < 1) return false;
    const object = qualified.slice(0, dot),
      member = qualified.slice(dot + 1);
    return policy.isKnown(object, member) && policy.supports(object, member);
  });
}

export function loadBrowserDocumentation(
  documentationRoot?: string,
  name?: string,
  descriptor?: BrowserBackendDescriptor,
): string {
  const missing = (): never => {
    throw new Error(`Browser documentation not found: ${name}`);
  };
  let root: string | undefined;
  try {
    if (documentationRoot) root = realpathSync(documentationRoot);
  } catch {
    /* Missing optional docs use the built-in guide. */
  }
  if (!root) return name ? missing() : BROWSER_FALLBACK_GUIDE;
  const indexText = readDocument(root, "documents.json");
  const apiPath = documentPath(root, "api.json");
  if (indexText === undefined && !apiPath) return name ? missing() : BROWSER_FALLBACK_GUIDE;
  const api: BrowserApiManifest = loadBrowserApiManifest(apiPath ? root : undefined);
  const index = indexFrom(indexText);
  const policy = descriptor ? new BrowserApiPolicy(api, descriptor) : undefined;
  const eligible = index.documents.filter((entry) => applies(entry, descriptor, policy));
  if (name) {
    const entry = eligible.find(
      (item) => item.name === name || item.path.replace(/\.md$/i, "") === name,
    );
    const text = entry && readDocument(root, entry.path);
    return text ?? missing();
  }
  const contents = eligible
    .filter((entry) => entry.mode !== "lookup")
    .map((entry) => readDocument(root, entry.path))
    .filter((text): text is string => text !== undefined);
  return renderBrowserDocumentation(
    api,
    index.title ?? "Knorvia Browser API",
    contents,
    descriptor,
  );
}
