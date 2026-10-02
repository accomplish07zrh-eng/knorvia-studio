import type { KnorviaPermissionRequest } from "./task-types-core.js";

export type PermissionRequestScope = "command" | "file" | "generic";

export interface PermissionRequestFileChange {
  path: string;
  type: "add" | "update";
}

export interface PermissionRequestPreview {
  title: string;
  command: string | null;
  filePaths: string[];
  scope: PermissionRequestScope;
  fileChange: PermissionRequestFileChange | null;
  fileChanges: PermissionRequestFileChange[];
}

const commandKeys = new Set(["command", "cmd", "script", "shellcommand"]);
const argumentKeys = new Set(["args", "argv", "arguments"]);
const filePathKeys = new Set([
  "path",
  "paths",
  "file",
  "file_path",
  "filepath",
  "files",
  "filename",
  "filenames",
  "target",
  "targets",
  "location",
  "locations",
]);
const directoryKeys = new Set(["cwd", "directory", "workingdirectory"]);
const nestedCommandKeys = ["rawInput", "input", "params", "toolCall"] as const;
const filePathLimit = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInline(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeBlock(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function getInputSource(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if ("rawInput" in value && value.rawInput !== undefined) return value.rawInput;
  if ("input" in value) return value.input;
  return value;
}

function formatArguments(value: unknown[]): string[] {
  return value
    .map((argument) => {
      if (typeof argument === "string") return argument.trim();
      if (
        typeof argument === "number" ||
        typeof argument === "boolean" ||
        typeof argument === "bigint"
      ) {
        return String(argument);
      }
      return "";
    })
    .filter((argument) => argument.length > 0);
}

function findCommand(value: unknown, seen: Set<object>, allowBareString = false): string | null {
  if (typeof value === "string") {
    if (!allowBareString) return null;
    return normalizeBlock(value) || null;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    for (const item of value) {
      const command = findCommand(item, seen);
      if (command) return command;
    }
    return null;
  }

  if (!isRecord(value) || seen.has(value)) return null;
  seen.add(value);

  for (const [key, candidate] of Object.entries(value)) {
    if (!commandKeys.has(key.toLowerCase()) || typeof candidate !== "string") continue;
    const command = normalizeBlock(candidate);
    if (!command) continue;

    for (const [argumentKey, argumentValue] of Object.entries(value)) {
      if (!argumentKeys.has(argumentKey.toLowerCase()) || !Array.isArray(argumentValue)) {
        continue;
      }
      const argumentsList = formatArguments(argumentValue);
      if (argumentsList.length > 0) return `${command} ${argumentsList.join(" ")}`;
    }
    return command;
  }

  for (const key of nestedCommandKeys) {
    if (!(key in value)) continue;
    const command = findCommand(value[key], seen, key !== "toolCall");
    if (command) return command;
  }

  for (const candidate of Object.values(value)) {
    if (!Array.isArray(candidate) && !isRecord(candidate)) continue;
    const command = findCommand(candidate, seen);
    if (command) return command;
  }
  return null;
}

function extractPaths(value: unknown, paths: string[], seen: Set<object>): void {
  if (paths.length >= filePathLimit) return;

  if (typeof value === "string") {
    const path = normalizeInline(value);
    if (path && !paths.includes(path)) paths.push(path);
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of value) {
      extractPaths(item, paths, seen);
      if (paths.length >= filePathLimit) return;
    }
    return;
  }

  if (!isRecord(value) || seen.has(value)) return;
  seen.add(value);
  if (typeof value.path === "string") {
    extractPaths(value.path, paths, seen);
    if (paths.length >= filePathLimit) return;
  }
  for (const candidate of Object.values(value)) {
    extractPaths(candidate, paths, seen);
    if (paths.length >= filePathLimit) return;
  }
}

function collectPaths(value: unknown, paths: string[], seen: Set<object>): void {
  if (paths.length >= filePathLimit) return;

  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of value) {
      collectPaths(item, paths, seen);
      if (paths.length >= filePathLimit) return;
    }
    return;
  }

  if (!isRecord(value) || seen.has(value)) return;
  seen.add(value);
  for (const [key, candidate] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (directoryKeys.has(normalizedKey)) continue;
    if (filePathKeys.has(normalizedKey)) {
      extractPaths(candidate, paths, seen);
    } else if (Array.isArray(candidate) || isRecord(candidate)) {
      collectPaths(candidate, paths, seen);
    }
    if (paths.length >= filePathLimit) return;
  }
}

function collectChanges(
  value: unknown,
  changes: PermissionRequestFileChange[],
  seen: Set<object>,
): void {
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of value) collectChanges(item, changes, seen);
    return;
  }

  if (!isRecord(value) || seen.has(value)) return;
  seen.add(value);

  if (isRecord(value.changes)) {
    for (const [path, change] of Object.entries(value.changes)) {
      if (!isRecord(change) || (change.type !== "add" && change.type !== "update")) continue;
      const type = change.type;
      if (!changes.some((existing) => existing.path === path && existing.type === type)) {
        changes.push({ path, type });
      }
    }
  }

  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate) || isRecord(candidate)) collectChanges(candidate, changes, seen);
  }
}

export function getPermissionRequestPreview(
  request: Pick<KnorviaPermissionRequest, "title" | "description" | "kind" | "raw">,
): PermissionRequestPreview {
  const rawSource = request.raw;
  const filePaths: string[] = [];
  collectPaths(rawSource, filePaths, new Set<object>());
  const title =
    normalizeInline(request.title ?? request.description ?? request.kind) || "permission";
  const command = findCommand(getInputSource(rawSource), new Set<object>(), true);
  const fileChanges: PermissionRequestFileChange[] = [];
  collectChanges(rawSource, fileChanges, new Set<object>());
  const fileChange = fileChanges.length === 1 ? fileChanges[0]! : null;
  const scope: PermissionRequestScope = command
    ? "command"
    : filePaths.length > 0
      ? "file"
      : "generic";
  return { title, command, filePaths, scope, fileChange, fileChanges };
}
