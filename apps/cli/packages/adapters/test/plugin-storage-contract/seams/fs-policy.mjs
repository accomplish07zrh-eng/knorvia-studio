// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nativeProcess from "node:process";
import { getWorld, makeError, record } from "./state.mjs";

function pathText(value) {
  if (value instanceof URL) return fileURLToPath(value);
  if (typeof value !== "string") {
    throw new TypeError(`Owned filesystem seam requires a path string, got ${typeof value}`);
  }
  return value;
}

export function ownedPath(value) {
  const world = getWorld();
  const root = resolve(world.runRoot);
  const text = pathText(value);
  const absolute = isAbsolute(text) ? resolve(text) : resolve(world.config?.cwd ?? root, text);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    return absolute;
  }
  throw new Error(`Owned filesystem boundary rejected path: ${absolute}`);
}

function faultMatches(rule, op, paths) {
  if (rule.op !== op) return false;
  const joined = paths.join("\n");
  if (rule.pathSuffix && !paths.some((value) => value.endsWith(rule.pathSuffix))) return false;
  if (rule.pathIncludes && !joined.includes(rule.pathIncludes)) return false;
  return true;
}

export function beforeIo(op, rawPaths, details = {}) {
  const world = getWorld();
  const paths = rawPaths.map(ownedPath);
  record(`fs.${op}`, { paths, ...details });
  const abortRule = world.config?.abortOnIo;
  if (abortRule && faultMatches(abortRule, op, paths)) {
    const key = "abort-on-io";
    const attempt = (world.counters.io[key] ?? 0) + 1;
    world.counters.io[key] = attempt;
    if (abortRule.at === undefined || abortRule.at === attempt) {
      world.abortController?.abort();
      record("signal.abort", { op, attempt, paths });
    }
  }
  const rules = world.config?.ioFaults ?? [];
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (!faultMatches(rule, op, paths)) continue;
    const key = `io:${index}`;
    const attempt = (world.counters.io[key] ?? 0) + 1;
    world.counters.io[key] = attempt;
    const shouldFail =
      rule.always === true ||
      (Number.isInteger(rule.times) && attempt <= rule.times) ||
      (Array.isArray(rule.at) && rule.at.includes(attempt));
    if (shouldFail) {
      throw makeError(
        { code: rule.code ?? "EIO", message: rule.message ?? `Synthetic ${op} failure` },
        `Synthetic ${op} failure`,
      );
    }
  }
  return paths;
}

function commitMutation(op, paths) {
  const world = getWorld();
  const mutation = (world.counters.mutation ?? 0) + 1;
  world.counters.mutation = mutation;
  record("fs.mutation.commit", { mutation, op, paths });
  if (world.config?.crashAfterMutation === mutation) {
    nativeProcess.exit(86);
  }
}

export async function afterIo(op, paths) {
  const world = getWorld();
  for (const effect of world.config?.afterIo ?? []) {
    if (!faultMatches(effect, op, paths)) continue;
    const key = `after:${world.config.afterIo.indexOf(effect)}`;
    const attempt = (world.counters.io[key] ?? 0) + 1;
    world.counters.io[key] = attempt;
    if (effect.at !== undefined && effect.at !== attempt) continue;
    if (effect.writeJson) {
      const target = ownedPath(effect.writeJson.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(effect.writeJson.value, null, 2)}\n`);
      record("fs.afterIo.writeJson", { op, path: target });
    }
  }
  commitMutation(op, paths);
}

export function afterIoSync(op, paths) {
  commitMutation(op, paths);
}

export function writeDetails(data) {
  const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data ?? []);
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
