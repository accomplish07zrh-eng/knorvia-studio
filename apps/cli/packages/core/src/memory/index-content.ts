import { Lexer } from "marked";

const entryLimit = 200;
const characterLimit = 25000;

function renderedSize(count: number): string {
  if (count < 1024) return `${count} bytes`;

  let quantity = count / 1024;
  let unit = "KB";
  if (quantity >= 1024) {
    quantity /= 1024;
    unit = "MB";
    if (quantity >= 1024) {
      quantity /= 1024;
      unit = "GB";
    }
  }
  return `${quantity.toFixed(1).replace(/\.0$/u, "")}${unit}`;
}

export function formatProjectMemoryIndexContent(content: string): string {
  const body = content.replace(/^---\s*\n[\s\S]*?---\s*\n?/u, "");
  if (!body.includes("<!--")) return formatMemoryIndexContent(body);

  const pieces: string[] = [];
  for (const token of new Lexer({ gfm: false }).lex(body)) {
    const kind = token.type;
    const raw = token.raw;
    if (kind === "html" && raw.trimStart().startsWith("<!--") && raw.includes("-->")) {
      const remaining = raw.replace(/<!--[\s\S]*?-->/gu, "");
      if (remaining.trim().length > 0) pieces.push(remaining);
    } else {
      pieces.push(raw);
    }
  }
  return formatMemoryIndexContent(pieces.join(""));
}

export function formatMemoryIndexContent(content: string): string {
  const body = content.trim();
  if (body.length === 0) return "";

  const rows = body.split("\n");
  const tooManyRows = rows.length > entryLimit;
  const tooManyCharacters = body.length > characterLimit;
  if (!tooManyRows && !tooManyCharacters) return body;

  let excerpt = tooManyRows ? rows.slice(0, entryLimit).join("\n") : body;
  if (excerpt.length > characterLimit) {
    const boundary = excerpt.lastIndexOf("\n", characterLimit);
    excerpt = excerpt.slice(0, boundary > 0 ? boundary : characterLimit);
  }

  let description: string;
  if (tooManyRows && tooManyCharacters) {
    description = `${rows.length} lines and ${renderedSize(body.length)}`;
  } else if (tooManyRows) {
    description = `${rows.length} lines (limit: ${entryLimit})`;
  } else {
    description = `${renderedSize(body.length)} (limit: ${renderedSize(characterLimit)}) — index entries are too long`;
  }
  return `${excerpt}\n\n> WARNING: MEMORY.md is ${description}. Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`;
}
