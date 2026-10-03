import { homedir } from "node:os";
import { join } from "node:path";

export function withoutComment(line: string): string {
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}

export function words(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    const next = line.charAt(index + 1);
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && next && (next === quote || next === "\\")) {
        current += next;
        index += 1;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (
      char === "\\" &&
      next &&
      (/\s/.test(next) || next === "\\" || next === '"' || next === "'" || next === "#")
    ) {
      current += next;
      index += 1;
    } else if (/\s/.test(char)) {
      if (current.length > 0) result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function homeToken(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const home = homedir();
  const expanded = value.replace(/^%d(?=$|[/\\])/, home);
  if (expanded === "~") return home;
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    return join(home, expanded.slice(2));
  }
  return expanded;
}
