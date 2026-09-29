// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function at(context, ...segments) {
  return join(context.runRoot, ...segments);
}

export async function writeText(context, relativePath, text) {
  const path = at(context, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return path;
}

export async function writeJson(context, relativePath, value) {
  return writeText(context, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(context, relativePath) {
  return JSON.parse(await readFile(at(context, relativePath), "utf8"));
}

export async function readText(context, relativePath) {
  return readFile(at(context, relativePath), "utf8");
}

export async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function syntheticError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function captureThrow(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  throw new Error("Expected callback to throw");
}

export function events(context, kind) {
  return context.world.events.filter((entry) => entry.kind === kind);
}

export function makeCase(id, run, options = {}) {
  return {
    id,
    crashMatrix: options.crashMatrix === true,
    timeoutMs: options.timeoutMs,
    setup: options.setup,
    world: options.world,
    run,
  };
}
