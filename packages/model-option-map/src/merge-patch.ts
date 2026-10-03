import { PatchPathClaims } from "./patch-path-claims.js";
import type { JsonObject, JsonValue } from "./types.js";

export interface NamedJsonMergePatch {
  readonly option: string;
  readonly patch: JsonObject;
}

function jsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(clone);
  if (!jsonObject(value)) return value;
  const copy = Object.create(null) as Record<string, JsonValue>;
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(copy, key, { value: clone(child), enumerable: true, configurable: true, writable: true });
  }
  return copy;
}

function writtenPaths(patch: JsonObject): string[][] {
  const paths: string[][] = [];
  const work: (() => void)[] = [];
  function descend(object: JsonObject, prefix: readonly string[]): void {
    const entries = Object.entries(object);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]!;
      const path = [...prefix, key];
      work.push(() => {
        if (jsonObject(value) && Object.keys(value).length) descend(value, path);
        else paths.push(path);
      });
    }
  }
  descend(patch, []);
  while (work.length) work.pop()!();
  return paths;
}

function mergeInto(result: Record<string, JsonValue>, patch: JsonObject): void {
  const work: (() => void)[] = [];
  function descend(target: Record<string, JsonValue>, object: JsonObject): void {
    const entries = Object.entries(object);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]!;
      work.push(() => {
        if (value === null) { delete target[key]; return; }
        if (!jsonObject(value)) { target[key] = clone(value); return; }
        if (!jsonObject(target[key])) target[key] = Object.create(null) as Record<string, JsonValue>;
        descend(target[key] as Record<string, JsonValue>, value);
      });
    }
  }
  descend(result, patch);
  while (work.length) work.pop()!();
}

export function applyOrderedJsonMergePatches(body: JsonObject, patches: readonly NamedJsonMergePatch[]): JsonObject {
  const claims = new PatchPathClaims();
  const result = clone(body) as Record<string, JsonValue>;
  for (const { option, patch } of patches) {
    const paths = writtenPaths(patch);
    for (const path of paths) claims.write(option, path);
    mergeInto(result, patch);
  }
  return result;
}
