// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync } from "node:fs";

function scalar(value: string): string {
  const clean = value.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(clean);
      return typeof parsed === "string" ? parsed : clean;
    } catch {
      return clean.slice(1, -1);
    }
  }
  if (clean.startsWith("'") && clean.endsWith("'")) return clean.slice(1, -1).replaceAll("''", "'");
  return clean.replace(/\s+#.*$/, "").trim();
}

export function readMarkdownFrontmatter(filePath: string): { name?: string; description?: string } {
  let lines: string[];
  try {
    lines = readFileSync(filePath, "utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);
  } catch {
    return {};
  }
  if (lines[0]?.trim() !== "---") return {};
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return {};
  const result: { name?: string; description?: string } = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index] ?? "";
    const match = /^(name|description):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as "name" | "description";
    const raw = match[2] ?? "";
    if (!/^[>|][+-]?\s*(?:#.*)?$/.test(raw)) {
      const value = scalar(raw);
      if (value) result[key] = value;
      continue;
    }
    const block: string[] = [];
    while (index + 1 < end) {
      const next = lines[index + 1] ?? "";
      if (next.trim() && !/^\s/.test(next)) break;
      block.push(next);
      index += 1;
    }
    const indents = block
      .filter((item) => item.trim())
      .map((item) => /^\s*/.exec(item)?.[0].length ?? 0);
    const indent = Math.min(...indents);
    const content = block.map((item) => item.slice(Number.isFinite(indent) ? indent : 0));
    let value = "";
    for (let offset = 0; offset < content.length; offset += 1) {
      const item = content[offset] ?? "";
      value += item;
      if (offset + 1 < content.length)
        value += raw.startsWith(">") && item && content[offset + 1] ? " " : "\n";
    }
    value = value.trim();
    if (value) result[key] = value;
  }
  return result;
}
