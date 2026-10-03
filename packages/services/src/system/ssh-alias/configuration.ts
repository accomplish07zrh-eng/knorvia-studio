import { existsSync } from "node:fs";
import { glob, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { homeToken, withoutComment, words } from "./tokens.js";

export interface Context {
  patterns: string[];
  directives: Array<{ key: string; value: string }>;
  source: string;
  eligibleHost: boolean;
}

export interface Declaration {
  alias: string;
  source: string;
}

async function includeFiles(tokens: string[], directory: string): Promise<string[]> {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokens) {
    const expanded = homeToken(raw);
    if (!expanded) continue;
    const absolute = isAbsolute(expanded) ? expanded : resolve(directory, expanded);
    if (!/[*?[\]]/.test(absolute)) {
      if (existsSync(absolute) && !seen.has(absolute)) {
        seen.add(absolute);
        targets.push(absolute);
      }
      continue;
    }
    try {
      for await (const match of glob(absolute)) {
        const target = resolve(match);
        if (!seen.has(target)) {
          seen.add(target);
          targets.push(target);
        }
      }
    } catch {
      // Preserve targets yielded before a glob or iterator failure.
    }
  }
  return targets;
}

async function visit(file: string, depth: number, visited: Set<string>): Promise<Context[]> {
  const absolute = resolve(file);
  if (visited.has(absolute) || depth > 8) return [];
  visited.add(absolute);
  let content: string;
  try {
    content = await readFile(absolute, "utf8");
  } catch {
    return [];
  }
  let current: Context = {
    patterns: ["*"],
    directives: [],
    source: absolute,
    eligibleHost: false,
  };
  const contexts: Context[] = [current];
  for (const raw of content.split(/\r?\n/)) {
    const line = withoutComment(raw).trim();
    if (!line) continue;
    const tokens = words(line);
    const first = tokens[0];
    if (!first) continue;
    const key = first.toLowerCase();
    if (key === "include") {
      const targets = await includeFiles(tokens.slice(1), dirname(absolute));
      for (const target of targets) {
        contexts.push(...(await visit(target, depth + 1, visited)));
      }
    } else if (key === "host") {
      current = {
        patterns: tokens.slice(1),
        directives: [],
        source: absolute,
        eligibleHost: true,
      };
      contexts.push(current);
    } else if (tokens.length >= 2) {
      current.directives.push({ key, value: tokens.slice(1).join(" ") });
    }
  }
  return contexts;
}

export function readContexts(root: string): Promise<Context[]> {
  return visit(root, 0, new Set<string>());
}

export function declarations(contexts: Context[]): Declaration[] {
  const result: Declaration[] = [];
  const admitted = new Set<string>();
  for (const context of contexts) {
    if (!context.eligibleHost || context.patterns.length !== 1) continue;
    const alias = context.patterns[0]!.trim();
    if (!alias || alias === "*" || alias.startsWith("!") || /[?*[\\\]]/.test(alias)) continue;
    if (admitted.has(alias)) continue;
    admitted.add(alias);
    result.push({ alias, source: context.source });
    if (result.length === 200) break;
  }
  return result;
}
