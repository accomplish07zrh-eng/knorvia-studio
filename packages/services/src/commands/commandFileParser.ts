import type { CommandConfig, CommandInfo } from "@knorvia/shared";

export type CommandFileFormat = "markdown";

function sections(content: string): { metadata: string[]; body: string[] } {
  const lines = content.split("\n");
  const opening = lines.findIndex((line) => line.trim() === "---");
  const closing = lines.findIndex((line, index) => index > opening && line.trim() === "---");
  if (opening < 0 || closing < 0) return { metadata: [], body: lines };
  return { metadata: lines.slice(opening + 1, closing), body: lines.slice(closing + 1) };
}

function metadataKey(line: string): string | undefined {
  if (/^[ \t]/.test(line)) return undefined;
  return /^([A-Za-z0-9_-]+)\s*:/.exec(line.trim())?.[1]?.toLowerCase();
}

function metadataValue(lines: string[], target: string): string | undefined {
  const start = lines.findIndex((line) => metadataKey(line) === target);
  if (start < 0) return undefined;
  const values: string[] = [];
  const first = lines[start].slice(lines[start].indexOf(":") + 1).trim();
  if (first) values.push(first);
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (metadataKey(line)) break;
    if (/^[ \t]/.test(line)) values.push(line.trim());
  }
  return values.join(" ").trim() || undefined;
}

export class CommandFileParser {
  static parseCommandFile(
    content: string,
    filePath: string,
    _format: CommandFileFormat = "markdown",
  ): CommandInfo | null {
    try {
      const { metadata, body } = sections(content);
      const commandContent = body.join("\n");
      const filename = filePath.split(/[\\/]+/).pop() ?? "";
      return {
        name: `/${filename.replace(/\.md$/i, "")}`,
        prompt: commandContent.trim(),
        content: commandContent,
        filePath,
        description: metadataValue(metadata, "description"),
        argumentHint: metadataValue(metadata, "argument-hint"),
      };
    } catch {
      return null;
    }
  }

  static generateCommandFileContent(
    config: CommandConfig,
    _format: CommandFileFormat = "markdown",
    existingContent?: string,
  ): string {
    const lines: string[] = [];
    let skip = false;
    const previous = existingContent === undefined ? [] : sections(existingContent).metadata;
    for (const line of previous) {
      const key = metadataKey(line);
      if (key) skip = key === "description" || key === "argument-hint";
      if (!skip) lines.push(line);
    }
    const description = config.description?.trim();
    const argumentHint = config.argumentHint?.trim();
    if (description) lines.push(`description: ${description}`);
    if (argumentHint) lines.push(`argument-hint: ${argumentHint}`);
    if (lines.length === 0) return config.prompt;
    return `---\n${lines.join("\n")}\n---\n\n${config.prompt}`;
  }
}
