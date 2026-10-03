import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SkillMetadata } from "@knorvia/shared";
import { parse as parseYaml } from "yaml";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface SkillDefinition {
  hasFrontmatter: boolean;
  name: string;
  description: string;
  body: string;
  keys: string[];
  parseOk: boolean;
}

function inlineValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function looseFields(lines: string[]): { name: string; description: string } {
  const fields = { name: "", description: "" };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    if (key === "name") fields.name = inlineValue(raw);
    if (key !== "description") continue;
    if (!raw.startsWith("|") && !raw.startsWith(">")) {
      fields.description = inlineValue(raw);
      continue;
    }
    const block: string[] = [];
    while (index + 1 < lines.length && /^[ \t]/.test(lines[index + 1] ?? "")) {
      index += 1;
      block.push((lines[index] ?? "").replace(/^\s{1,2}/, ""));
    }
    fields.description = block.join(raw.startsWith(">") ? " " : "\n");
  }
  return fields;
}

function looseKeys(lines: string[]): string[] {
  const keys = new Set<string>();
  for (const line of lines) {
    if (!line.trim() || /^\s/.test(line) || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    if (key) keys.add(key);
  }
  return [...keys];
}

function unsafeInline(lines: string[]): boolean {
  return lines.some((line) => {
    const colon = line.indexOf(":");
    if (colon < 0) return false;
    const key = line.slice(0, colon).trim();
    if (key !== "name" && key !== "description") return false;
    const raw = line.slice(colon + 1).trim();
    return Boolean(raw) && !/^["'|>]/.test(raw) && raw.includes(": ");
  });
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function parseSkillDefinition(source: string): SkillDefinition {
  const normalized = source.replace(/\r\n|\r/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) {
    return {
      hasFrontmatter: false,
      name: "",
      description: "",
      body: normalized.trim(),
      keys: [],
      parseOk: false,
    };
  }
  const frontmatter = match[1] ?? "";
  const lines = frontmatter.split("\n");
  const heading = lines.findIndex((line, index) => index > 0 && /^#{1,6}\s+\S/.test(line));
  const metadataText = heading < 0 ? frontmatter : lines.slice(0, heading).join("\n").trimEnd();
  const leakedBody = heading < 0 ? "" : lines.slice(heading).join("\n").trim();
  const tail = normalized.slice(match[0].length).trim();
  const body = [leakedBody, tail].filter(Boolean).join("\n\n").trim();
  const metadataLines = metadataText.split("\n");
  const loose = looseFields(metadataLines);
  const fallback: SkillDefinition = {
    hasFrontmatter: true,
    ...loose,
    body,
    keys: looseKeys(metadataLines),
    parseOk: false,
  };
  if (unsafeInline(metadataLines)) return fallback;
  let parsed: unknown;
  try {
    parsed = parseYaml(metadataText);
  } catch {
    return fallback;
  }
  if (!isRecord(parsed)) return fallback;
  return {
    hasFrontmatter: true,
    name: asText(parsed.name) || loose.name,
    description: asText(parsed.description) || loose.description,
    body,
    keys: Object.keys(parsed),
    parseOk: true,
  };
}

export async function readSkillMetadata(skillPath: string): Promise<SkillMetadata | undefined> {
  const raw = await readFile(join(dirname(skillPath), "_meta.json"), "utf-8").catch(() => null);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    const metadata: SkillMetadata = {};
    for (const key of ["slug", "version", "ownerId"] as const) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) metadata[key] = value.trim();
    }
    if (typeof parsed.publishedAt === "number" && Number.isFinite(parsed.publishedAt)) {
      metadata.publishedAt = parsed.publishedAt;
    }
    return Object.keys(metadata).length ? metadata : undefined;
  } catch {
    return undefined;
  }
}
