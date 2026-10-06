import { parse } from "smol-toml";

/**
 * 保留注释与顺序的最小 TOML 局部修改（specs/knorvia-cli-provider-switch.md）。
 *
 * 只支持切换器需要的几种操作：顶层键、整张表、表内单个键。修改后重新解析，
 * 与"在原解析结果上做同样的语义修改"逐项比较；任何不一致（例如值跨多行、
 * 用户用内联表或点号键写了同一位置）都拒绝写入，绝不产出意外内容。
 */

export type TomlScalar = string | boolean;
export type TomlEdit =
  | { op: "set-top"; key: string; value: TomlScalar }
  | { op: "remove-top"; key: string }
  | { op: "replace-table"; header: string; entries: Record<string, TomlScalar> }
  | { op: "remove-table"; header: string }
  | { op: "set-in-table"; header: string; key: string; value: TomlScalar }
  | { op: "remove-in-table"; header: string; key: string };

export class TomlPatchError extends Error {}

const BARE_KEY = /^[A-Za-z0-9_-]+$/;
const HEADER = /^\s*\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/;
const ARRAY_HEADER = /^\s*\[\[/;

function formatValue(value: TomlScalar): string {
  return typeof value === "boolean" ? String(value) : JSON.stringify(value);
}
function headerName(line: string): string | undefined {
  if (ARRAY_HEADER.test(line)) return "\0array";
  const match = HEADER.exec(line);
  return match ? match[1]!.replace(/\s*\.\s*/g, ".") : undefined;
}
function keyPattern(key: string): RegExp {
  if (!BARE_KEY.test(key)) throw new TomlPatchError(`不支持的键名：${key}`);
  return new RegExp(`^\\s*(?:${key}|"${key}")\\s*=`);
}

interface Region {
  start: number; // header line index, or -1 for top level
  end: number; // exclusive
}
function regions(lines: string[]): Map<string, Region> {
  const result = new Map<string, Region>();
  let current = "";
  let start = -1;
  for (let index = 0; index < lines.length; index++) {
    const name = headerName(lines[index]!);
    if (name === undefined) continue;
    if (!result.has(current)) result.set(current, { start, end: index });
    current = name;
    start = index;
  }
  if (!result.has(current)) result.set(current, { start, end: lines.length });
  return result;
}

/** 删除整张表时保留紧挨下一张表的注释和空行，它们通常属于下一张表。 */
function removeRegion(lines: string[], region: Region): void {
  let end = region.end;
  while (end > region.start + 1 && /^\s*(?:#.*)?$/.test(lines[end - 1]!)) end--;
  lines.splice(region.start, end - region.start);
}
function setKey(lines: string[], region: Region, key: string, value: TomlScalar): void {
  const pattern = keyPattern(key);
  const line = `${key} = ${formatValue(value)}`;
  for (let index = region.start + 1; index < region.end; index++)
    if (pattern.test(lines[index]!)) {
      lines[index] = line;
      return;
    }
  let insertAt = region.end;
  while (insertAt > region.start + 1 && !lines[insertAt - 1]!.trim()) insertAt--;
  lines.splice(insertAt, 0, line);
}
function removeKey(lines: string[], region: Region, key: string): void {
  const pattern = keyPattern(key);
  for (let index = region.end - 1; index > region.start; index--)
    if (pattern.test(lines[index]!)) lines.splice(index, 1);
}
function appendTable(lines: string[], header: string, entries: Record<string, TomlScalar>): void {
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  if (lines.length) lines.push("");
  lines.push(`[${header}]`);
  for (const [key, value] of Object.entries(entries)) {
    keyPattern(key);
    lines.push(`${key} = ${formatValue(value)}`);
  }
}

function applyLines(lines: string[], edit: TomlEdit): void {
  const map = regions(lines);
  const top = map.get("") ?? { start: -1, end: lines.length };
  switch (edit.op) {
    case "set-top":
      return setKey(lines, top, edit.key, edit.value);
    case "remove-top":
      return removeKey(lines, top, edit.key);
    case "remove-table": {
      const region = map.get(edit.header);
      if (region) removeRegion(lines, region);
      return;
    }
    case "replace-table": {
      const region = map.get(edit.header);
      if (region) removeRegion(lines, region);
      return appendTable(lines, edit.header, edit.entries);
    }
    case "set-in-table": {
      const region = map.get(edit.header);
      if (!region) return appendTable(lines, edit.header, { [edit.key]: edit.value });
      return setKey(lines, region, edit.key, edit.value);
    }
    case "remove-in-table": {
      const region = map.get(edit.header);
      if (region) removeKey(lines, region, edit.key);
      return;
    }
  }
}

type Tree = Record<string, unknown>;
function isTree(value: unknown): value is Tree {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nested(tree: Tree, path: string[], create: boolean): Tree | undefined {
  let node: Tree = tree;
  for (const part of path) {
    if (!isTree(node[part])) {
      if (!create) return undefined;
      node[part] = {};
    }
    node = node[part] as Tree;
  }
  return node;
}
function applyTree(tree: Tree, edit: TomlEdit): void {
  switch (edit.op) {
    case "set-top":
      tree[edit.key] = edit.value;
      return;
    case "remove-top":
      delete tree[edit.key];
      return;
    case "remove-table":
    case "replace-table": {
      const path = edit.header.split(".");
      const parent = nested(tree, path.slice(0, -1), edit.op === "replace-table");
      if (!parent) return;
      if (edit.op === "remove-table") delete parent[path.at(-1)!];
      else parent[path.at(-1)!] = { ...edit.entries };
      return;
    }
    case "set-in-table":
      nested(tree, edit.header.split("."), true)![edit.key] = edit.value;
      return;
    case "remove-in-table":
      delete nested(tree, edit.header.split("."), false)?.[edit.key];
      return;
  }
}

/** 空表在"删除最后一项后"是否仍出现在解析结果里取决于写法，比较前两侧都剪掉。 */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (!isTree(value)) return value instanceof Date ? value.toISOString() : value;
  const result: Tree = {};
  for (const [key, child] of Object.entries(value)) {
    const pruned = prune(child);
    if (isTree(pruned) && !Object.keys(pruned).length) continue;
    result[key] = pruned;
  }
  return result;
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isTree(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : typeof item === "bigint"
        ? item.toString()
        : item,
  );
}

export function parseToml(text: string): Tree {
  try {
    return parse(text) as Tree;
  } catch (error) {
    throw new TomlPatchError(
      `配置文件不是有效的 TOML：${error instanceof Error ? error.message.split("\n")[0] : ""}`,
    );
  }
}

export function patchToml(text: string, edits: readonly TomlEdit[]): string {
  const before = parseToml(text);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length ? text.split(/\r?\n/) : [];
  if (lines.length && lines.at(-1) === "") lines.pop();
  for (const edit of edits) applyLines(lines, edit);
  const output = lines.length ? lines.join(eol) + eol : "";
  const expected = structuredClone(before);
  for (const edit of edits) applyTree(expected, edit);
  const after = parseToml(output);
  if (stable(prune(after)) !== stable(prune(expected)))
    throw new TomlPatchError("此配置文件的写法无法安全地局部修改，Studio 未改动它");
  return output;
}
