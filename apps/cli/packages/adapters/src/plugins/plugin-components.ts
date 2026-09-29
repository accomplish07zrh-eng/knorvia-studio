// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { lstatSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  KNORVIA_INLINE_PLUGIN_MARKETPLACE,
  type PluginComponentGroup,
  type PluginComponentItem,
  type PluginComponentKind,
  type PluginDiagnostic,
  type PluginManifest,
} from "@knorvia/contracts";
import { isRecord, resolveInside } from "./helpers.js";
import { componentPaths, skillFiles } from "./component-roots.js";
import { text } from "./discovery-diagnostics.js";
import { listPluginHookEventNames } from "./hook-sources.js";
import { readMarkdownFrontmatter } from "./markdown-frontmatter.js";
import { loadPluginMcpServerDefinitions } from "./mcp.js";
import type { LoadedPlugin } from "./types.js";

export type { PluginComponentGroup, PluginComponentItem, PluginComponentKind };

function markdownFiles(path: string): string[] {
  const files: string[] = [];
  const pending = [path];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) continue;
      if (stat.isFile() && extname(current).toLowerCase() === ".md") files.push(current);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(current, { withFileTypes: true }).toReversed()) {
          if (!entry.isSymbolicLink()) pending.push(join(current, entry.name));
        }
      }
    } catch {
      /* 详情允许保留同组其余可读条目。 */
    }
  }
  return files;
}

function fromMarkdown(path: string, skill: boolean): PluginComponentItem {
  const metadata = readMarkdownFrontmatter(path);
  const name =
    metadata.name ?? (skill ? basename(join(path, "..")) : basename(path, extname(path)));
  return {
    name,
    ...(metadata.description === undefined ? {} : { description: metadata.description }),
  };
}

function objectItems(value: unknown, rootPath: string): PluginComponentItem[] {
  if (!isRecord(value)) return [];
  const items: PluginComponentItem[] = [];
  for (const [name, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    let description = text(raw.description);
    if (!description && typeof raw.source === "string") {
      const path = resolveInside(rootPath, raw.source);
      if (path) description = readMarkdownFrontmatter(path).description;
    }
    items.push({ name, ...(description === undefined ? {} : { description }) });
  }
  return items;
}

export function enumeratePluginComponents(
  rootPath: string,
  manifest: PluginManifest | null,
  options?: { diagnostics?: PluginDiagnostic[]; loaded?: LoadedPlugin },
): PluginComponentGroup[] {
  const diagnostics = options?.diagnostics ?? [];
  const actual = manifest ?? { name: basename(rootPath) };
  const loaded = options?.loaded ?? {
    id: `${actual.name}@${KNORVIA_INLINE_PLUGIN_MARKETPLACE}`,
    rootPath,
    manifest: actual,
    manifestPath: join(rootPath, ".knorvia-plugin", "plugin.json"),
    marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
    source: "inline",
  };
  const groups: PluginComponentGroup[] = [];
  const append = (kind: PluginComponentKind, items: PluginComponentItem[]): void => {
    const deduped = new Map<string, PluginComponentItem>();
    for (const item of items) if (!deduped.has(item.name)) deduped.set(item.name, item);
    if (deduped.size) groups.push({ kind, items: [...deduped.values()] });
  };
  for (const [field, kind] of [
    ["agents", "agent"],
    ["commands", "command"],
  ] as const) {
    const files = componentPaths(loaded, field, diagnostics).flatMap(markdownFiles);
    append(kind, [
      ...files.map((path) => fromMarkdown(path, false)),
      ...objectItems(actual[field], rootPath),
    ]);
  }
  append(
    "skill",
    skillFiles(loaded, componentPaths(loaded, "skills", diagnostics), diagnostics).map((path) =>
      fromMarkdown(path, true),
    ),
  );
  append(
    "hook",
    listPluginHookEventNames({ loaded, diagnostics }).map((name) => ({ name })),
  );
  append(
    "mcp",
    Object.keys(loadPluginMcpServerDefinitions({ loaded, diagnostics })).map((name) => ({ name })),
  );
  return groups;
}
