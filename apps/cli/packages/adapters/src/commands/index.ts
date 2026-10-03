import { open, readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import type {
  CustomCommandContent,
  CustomCommandDiagnostic,
  CustomCommandLoadOutcome,
  CustomCommandMetadata,
  CustomCommandOperationOptions,
  CustomCommandPort,
  CustomCommandRoot,
} from "@knorvia/contracts";
import {
  resolveDefaultCustomCommandRoots,
  type CustomCommandRootResolutionOptions,
} from "./roots.js";

const MAX_DEPTH = 12;
const DESCRIPTION_LIMIT = 1024;
const DEFAULT_MAX_BYTES = 100000;
const FRONTMATTER_DELIMITER = "---";
const KNOWN_KEYS = [
  "allowed-tools",
  "argument-hint",
  "description",
  "disable-noninteractive",
  "model",
  "skills",
];

export interface NodeCustomCommandAdapterOptions extends CustomCommandRootResolutionOptions {
  disabledPaths?: Iterable<string>;
}

function cancelled(options?: CustomCommandOperationOptions): void {
  if (options?.signal?.aborted) {
    throw new Error("Custom command operation cancelled");
  }
}

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function normalizeName(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

function frontmatterLines(
  content: string,
  exactOpening: boolean,
):
  | {
      lines: string[];
      end: number;
    }
  | undefined {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith(FRONTMATTER_DELIMITER)) return undefined;
  const lines = normalized.split(/\r?\n/);
  if (exactOpening && lines[0].trim() !== FRONTMATTER_DELIMITER) return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER);
  return end < 0 ? undefined : { lines, end };
}

function removeFrontmatter(content: string): string {
  const section = frontmatterLines(content, false);
  return section ? section.lines.slice(section.end + 1).join("\n") : content;
}

function scalar(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function list(value: string | undefined): string[] {
  const text = scalar(value);
  if (!text) return [];
  return text
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function enabled(value: string | undefined): boolean {
  const text = scalar(value)?.toLowerCase();
  return text === "true" || text === "yes";
}

async function enumerateDirectory(
  directory: string,
  depth: number,
  diagnostics: CustomCommandDiagnostic[],
): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      let directoryEntry = entry.isDirectory();
      let fileEntry = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const target = await stat(path);
          directoryEntry = target.isDirectory();
          fileEntry = target.isFile();
        } catch {
          continue;
        }
      }
      if (directoryEntry) {
        files.push(...(await enumerateDirectory(path, depth + 1, diagnostics)));
      } else if (fileEntry && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path);
      }
    }
    return files;
  } catch (error) {
    diagnostics.push({
      code: "custom_command_scan_failed",
      message: errorMessage(error, "Failed to scan command directory: " + directory),
      path: directory,
      severity: "warning",
    });
    return [];
  }
}

async function enumerateRoot(
  root: CustomCommandRoot,
  diagnostics: CustomCommandDiagnostic[],
): Promise<string[]> {
  try {
    const info = await stat(root.path);
    if (!info.isDirectory()) return [];
  } catch (error) {
    if (!missing(error)) {
      diagnostics.push({
        code: "custom_command_scan_failed",
        message: errorMessage(error, "Failed to scan command root: " + root.path),
        path: root.path,
        severity: "warning",
      });
    }
    return [];
  }
  return enumerateDirectory(root.path, 0, diagnostics);
}

async function readMetadata(
  path: string,
  root: CustomCommandRoot,
  diagnostics: CustomCommandDiagnostic[],
): Promise<CustomCommandMetadata | null> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (!missing(error)) {
      diagnostics.push({
        code: "custom_command_read_failed",
        message: errorMessage(error, "Failed to read custom command: " + path),
        path,
        severity: "warning",
      });
    }
    return null;
  }
  const name = normalizeName(
    relative(root.path, path)
      .slice(0, -3)
      .split(/[\\/]+/)
      .join(":"),
  );
  if (!/^[a-z0-9][a-z0-9_:-]{0,63}$/.test(name)) {
    diagnostics.push({
      code: "custom_command_invalid_name",
      commandName: name,
      message: "Invalid custom command name: " + name,
      path,
      severity: "error",
    });
    return null;
  }
  const section = frontmatterLines(content, true);
  const header = section?.lines.slice(1, section.end).join("\n");
  const keys: string[] = [];
  const values: Record<string, string> = {};
  if (header) {
    const lines = header.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || /^\s/.test(line)) continue;
      const colon = line.indexOf(":");
      if (colon <= 0) {
        diagnostics.push({
          code: "custom_command_invalid_frontmatter",
          message: "Invalid frontmatter line " + (index + 1) + " in " + basename(path),
          path,
          severity: "warning",
        });
        continue;
      }
      const key = line.slice(0, colon).trim();
      keys.push(key);
      values[key] = line.slice(colon + 1).trim();
    }
  }
  const body = removeFrontmatter(content).trim();
  const bodyDescription =
    body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#+\s*/, "")
          .replace(/^[-*]\s*/, "")
          .trim(),
      )
      .find((line) => Boolean(line))
      ?.slice(0, DESCRIPTION_LIMIT) ?? "";
  const description = scalar(values.description) ?? bodyDescription;
  if (!description) {
    diagnostics.push({
      code: "custom_command_invalid_frontmatter",
      commandName: name,
      message: "Custom command must include a description or non-empty body: " + path,
      path,
      severity: "error",
    });
    return null;
  }
  for (const key of keys) {
    if (!KNOWN_KEYS.includes(key)) {
      diagnostics.push({
        code: "custom_command_unknown_frontmatter",
        commandName: name,
        message: "Unknown custom command frontmatter key: " + key,
        path,
        severity: "warning",
      });
    }
  }
  return {
    allowedTools: list(values["allowed-tools"]),
    argumentHint: scalar(values["argument-hint"]),
    description: description.slice(0, DESCRIPTION_LIMIT),
    disableNonInteractive: enabled(values["disable-noninteractive"]),
    frontmatterKeys: keys,
    model: scalar(values.model),
    name,
    path,
    plugin: root.plugin,
    rootPath: root.path,
    scope: root.scope,
    skills: list(values.skills),
    source: root.source,
  };
}

export class NodeCustomCommandAdapter implements CustomCommandPort {
  private readonly rootOptions: NodeCustomCommandAdapterOptions;
  private readonly disabled: Set<string>;

  constructor(options: NodeCustomCommandAdapterOptions = {}) {
    this.rootOptions = options;
    this.disabled = new Set(Array.from(options.disabledPaths ?? [], (path) => resolve(path)));
  }

  async discoverCommands(
    request: { roots?: CustomCommandRoot[]; workingDirectory: string },
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandLoadOutcome> {
    cancelled(options);
    const cwd = resolve(request.workingDirectory);
    const roots = request.roots ?? (await resolveDefaultCustomCommandRoots(cwd, this.rootOptions));
    const diagnostics: CustomCommandDiagnostic[] = [];
    const selected = new Map<string, CustomCommandMetadata>();
    let totalDiscovered = 0;
    for (const root of roots.toSorted((left, right) => left.priority - right.priority)) {
      cancelled(options);
      const files = await enumerateRoot(root, diagnostics);
      for (const path of files) {
        cancelled(options);
        const metadata = await readMetadata(path, root, diagnostics);
        if (!metadata || this.disabled.has(resolve(metadata.path))) continue;
        totalDiscovered++;
        if (selected.has(metadata.name)) {
          diagnostics.push({
            code: "custom_command_duplicate_name",
            commandName: metadata.name,
            message: "Duplicate custom command ignored: " + metadata.name,
            path,
            severity: "warning",
          });
        } else {
          selected.set(metadata.name, metadata);
        }
      }
    }
    const commands = Array.from(selected.values()).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
    return { commands, diagnostics, totalDiscovered };
  }

  async loadCommand(
    request: {
      maxBytes?: number;
      name: string;
      roots?: CustomCommandRoot[];
      workingDirectory: string;
    },
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandContent> {
    cancelled(options);
    const discovered = await this.discoverCommands(
      {
        roots: request.roots,
        workingDirectory: request.workingDirectory,
      },
      options,
    );
    const name = normalizeName(request.name);
    const metadata = discovered.commands.find((command) => command.name === name);
    if (!metadata) throw new Error("Custom command not found: " + request.name);
    const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
    const info = await stat(metadata.path);
    const truncated = info.size > maxBytes;
    let buffer: Buffer;
    if (truncated) {
      const handle = await open(metadata.path, "r");
      try {
        const allocated = Buffer.alloc(Math.max(0, maxBytes));
        const { bytesRead } = await handle.read(allocated, 0, allocated.byteLength, 0);
        buffer = allocated.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } else {
      buffer = await readFile(metadata.path);
    }
    return {
      metadata,
      bytesRead: buffer.byteLength,
      content: removeFrontmatter(buffer.toString("utf8")).trim(),
      sizeBytes: info.size,
      truncated,
    };
  }
}

export function createNodeCustomCommandAdapter(
  options: NodeCustomCommandAdapterOptions = {},
): NodeCustomCommandAdapter {
  return new NodeCustomCommandAdapter(options);
}
