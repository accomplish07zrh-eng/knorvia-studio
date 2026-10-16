// SPDX-License-Identifier: Apache-2.0
// 权限预览。rawInput 键即使值为 null 也挡住 input；路径最多 6 条，目录键整棵跳过。
import type { KnorviaPermissionRequest } from "./task-types-core.js";
import {
  asPlainRecord,
  collapseInlineWhitespace,
  normalizeCommandBlock,
} from "./internal-s03/value-shape.js";

const PERMISSION_SCOPES = ["command", "file", "generic"] as const;

export type PermissionRequestScope = (typeof PERMISSION_SCOPES)[number];

export type PermissionRequestFileChange = {
  path: /* 变更路径，取 changes 对象的键 */ string;
  type: /* 只收 add 与 update */ "add" | "update";
};

export type PermissionRequestPreview = {
  title: /* 折叠后的标题；空串不回落到 description */ string;
  command: /* 规范化命令，没有则为 null */ string | null;
  filePaths: /* 最多 6 条折叠路径 */ string[];
  scope: /* 有命令则为 command，否则看路径 */ PermissionRequestScope;
  fileChange: /* 恰好一条时与 fileChanges[0] 同一引用 */ PermissionRequestFileChange | null;
  fileChanges: /* 按路径加类型去重 */ PermissionRequestFileChange[];
};

const COMMAND_KEY_NAMES = ["command", "cmd", "script", "shellcommand"] as const;
const ARGUMENT_KEY_NAMES = ["args", "argv", "arguments"] as const;
const PATH_KEY_GROUPS = [
  ["path", "paths", "file", "file_path"],
  ["filepath", "files", "filename", "filenames"],
  ["target", "targets", "location", "locations"],
] as const;
const DIRECTORY_KEY_NAMES = ["cwd", "directory", "workingdirectory"] as const;
const NESTED_COMMAND_KEY_NAMES = [
  "rawInput",
  "input",
  "params",
  "toolCall",
] as const;

const commandKeySet = new Set<string>(COMMAND_KEY_NAMES);
const argumentKeySet = new Set<string>(ARGUMENT_KEY_NAMES);
const pathKeySet = new Set<string>(PATH_KEY_GROUPS.flat());
const directoryKeySet = new Set<string>(DIRECTORY_KEY_NAMES);

const PREVIEW_PATH_CAP = 6;
const GENERIC_TITLE = "permission";
const NO_COMMAND: string | null = null;

type PathBag = {
  paths: string[];
  seen: Set<object>;
};

type ChangeBag = {
  changes: PermissionRequestFileChange[];
  seen: Set<object>;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function claim(seen: Set<object>, node: object): boolean {
  const fresh = !seen.has(node);
  if (fresh) seen.add(node);
  return fresh;
}

function argumentToken(value: unknown): string | undefined {
  if (isString(value)) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  const scalar =
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint";
  return scalar ? String(value) : undefined;
}

function formattedArguments(values: readonly unknown[]): string[] {
  const parts: string[] = [];
  for (const value of values) {
    const token = argumentToken(value);
    if (token !== undefined) parts.push(token);
  }
  return parts;
}

function matchingCommand(record: Record<string, unknown>): string | undefined {
  let found: string | undefined;
  for (const [key, candidate] of Object.entries(record)) {
    if (
      found === undefined &&
      commandKeySet.has(key.toLowerCase()) &&
      isString(candidate)
    ) {
      const command = normalizeCommandBlock(candidate);
      if (command.length > 0) found = command;
    }
  }
  return found;
}

function appendedArguments(
  record: Record<string, unknown>,
  command: string,
): string {
  for (const [key, candidate] of Object.entries(record)) {
    if (argumentKeySet.has(key.toLowerCase()) && isList(candidate)) {
      const parts = formattedArguments(candidate);
      if (parts.length > 0) return `${command} ${parts.join(" ")}`;
    }
  }
  return command;
}

function findCommand(
  value: unknown,
  seen: Set<object>,
  allowBareString = false,
): string | null {
  if (isString(value)) {
    if (!allowBareString) return NO_COMMAND;
    const command = normalizeCommandBlock(value);
    return command.length > 0 ? command : NO_COMMAND;
  }
  if (isList(value)) {
    if (!claim(seen, value)) return NO_COMMAND;
    for (const child of value) {
      const command = findCommand(child, seen);
      if (command !== null) return command;
    }
    return NO_COMMAND;
  }
  const record = asPlainRecord(value);
  if (record === undefined || !claim(seen, record)) return NO_COMMAND;
  const direct = matchingCommand(record);
  if (direct !== undefined) return appendedArguments(record, direct);
  for (const key of NESTED_COMMAND_KEY_NAMES) {
    if (key in record) {
      const nested = findCommand(record[key], seen, key !== "toolCall");
      if (nested !== null) return nested;
    }
  }
  for (const candidate of Object.values(record)) {
    if (isList(candidate) || asPlainRecord(candidate) !== undefined) {
      const nested = findCommand(candidate, seen);
      if (nested !== null) return nested;
    }
  }
  return NO_COMMAND;
}

function inputPayload(raw: unknown): unknown {
  const record = asPlainRecord(raw);
  if (record === undefined) return raw;
  if ("rawInput" in record && record.rawInput !== undefined)
    return record.rawInput;
  if ("input" in record) return record.input;
  return record;
}

function atPathCap(bag: PathBag): boolean {
  return bag.paths.length >= PREVIEW_PATH_CAP;
}

function rememberPath(bag: PathBag, value: string): void {
  const normalized = collapseInlineWhitespace(value);
  const fresh = normalized.length > 0 && !bag.paths.includes(normalized);
  if (fresh && !atPathCap(bag)) bag.paths.push(normalized);
}

function harvestPaths(value: unknown, bag: PathBag): void {
  if (atPathCap(bag)) {
    // 已满 6 条就停，后面的路径键不再进入。
  } else if (isString(value)) {
    rememberPath(bag, value);
  } else if (isList(value) && claim(bag.seen, value)) {
    let index = 0;
    while (index < value.length && !atPathCap(bag)) {
      harvestPaths(value[index], bag);
      index += 1;
    }
  } else if (!isList(value)) {
    const record = asPlainRecord(value);
    if (record !== undefined && claim(bag.seen, record)) {
      if (isString(record.path)) harvestPaths(record.path, bag);
      const nested = Object.values(record);
      let index = 0;
      while (index < nested.length && !atPathCap(bag)) {
        harvestPaths(nested[index], bag);
        index += 1;
      }
    }
  }
}

function walkPathFields(value: unknown, bag: PathBag): void {
  if (atPathCap(bag)) {
    // 目录键整棵跳过；路径键交给 harvest，其它对象继续走。
  } else if (isList(value) && claim(bag.seen, value)) {
    let index = 0;
    while (index < value.length && !atPathCap(bag)) {
      walkPathFields(value[index], bag);
      index += 1;
    }
  } else if (!isList(value)) {
    const record = asPlainRecord(value);
    if (record !== undefined && claim(bag.seen, record)) {
      for (const [key, candidate] of Object.entries(record)) {
        const folded = key.toLowerCase();
        if (!directoryKeySet.has(folded) && !atPathCap(bag)) {
          if (pathKeySet.has(folded)) harvestPaths(candidate, bag);
          else if (
            isList(candidate) ||
            asPlainRecord(candidate) !== undefined
          ) {
            walkPathFields(candidate, bag);
          }
        }
      }
    }
  }
}

function changeType(value: unknown): "add" | "update" | undefined {
  return value === "add" || value === "update" ? value : undefined;
}

function rememberChange(
  bag: ChangeBag,
  path: string,
  type: "add" | "update",
): void {
  const duplicate = bag.changes.some(
    (existing) => existing.path === path && existing.type === type,
  );
  if (!duplicate) {
    const recorded: PermissionRequestFileChange = { path, type };
    bag.changes.push(recorded);
  }
}

function readListedChanges(
  record: Record<string, unknown>,
  bag: ChangeBag,
): void {
  const listed = asPlainRecord(record.changes);
  if (listed === undefined) return;
  for (const [path, change] of Object.entries(listed)) {
    const changeRecord = asPlainRecord(change);
    const type = changeRecord ? changeType(changeRecord.type) : undefined;
    if (type !== undefined) rememberChange(bag, path, type);
  }
}

function harvestChanges(value: unknown, bag: ChangeBag): void {
  if (isList(value)) {
    if (claim(bag.seen, value)) {
      for (const child of value) harvestChanges(child, bag);
    }
  } else {
    const record = asPlainRecord(value);
    if (record !== undefined && claim(bag.seen, record)) {
      readListedChanges(record, bag);
      for (const candidate of Object.values(record)) {
        if (isList(candidate) || asPlainRecord(candidate) !== undefined) {
          harvestChanges(candidate, bag);
        }
      }
    }
  }
}

function previewTitle(
  title: string | undefined,
  description: string | undefined,
  kind: string,
): string {
  const chosen = collapseInlineWhitespace(title ?? description ?? kind);
  return chosen.length > 0 ? chosen : GENERIC_TITLE;
}

function previewScope(
  command: string | null,
  filePaths: readonly string[],
): PermissionRequestScope {
  if (command !== null) return "command";
  if (filePaths.length > 0) return "file";
  return "generic";
}

type PermissionRequestInput = Pick<
  KnorviaPermissionRequest,
  "title" | "description" | "kind" | "raw"
>;

export function getPermissionRequestPreview(
  request: PermissionRequestInput,
): PermissionRequestPreview {
  const paths: string[] = [];
  walkPathFields(request.raw, { paths, seen: new Set<object>() });
  const heading = previewTitle(
    request.title,
    request.description,
    request.kind,
  );
  const command = findCommand(
    inputPayload(request.raw),
    new Set<object>(),
    true,
  );
  const changes: PermissionRequestFileChange[] = [];
  harvestChanges(request.raw, { changes, seen: new Set<object>() });
  const sole = changes.length === 1 ? changes[0] : undefined;
  const scope = previewScope(command, paths);
  const preview: PermissionRequestPreview = {
    title: heading,
    command,
    filePaths: paths,
    scope,
    fileChange: sole ?? null,
    fileChanges: changes,
  };
  return preview;
}
