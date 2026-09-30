// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let imported;

export async function authModule() {
  const url = process.env.KNORVIA_TEST_AUTH_MODULE_URL;
  assert.ok(url, "runner must provide KNORVIA_TEST_AUTH_MODULE_URL");
  return (imported ??= import(url));
}

export function caseId() {
  return process.env.KNORVIA_TEST_CASE_ID ?? "unknown-case";
}

export function caseTemp(...parts) {
  const root = process.env.KNORVIA_TEST_TEMP_ROOT;
  assert.ok(root, "runner must provide KNORVIA_TEST_TEMP_ROOT");
  return path.join(root, ...parts);
}

export async function ensureCaseTemp() {
  await mkdir(caseTemp(), { recursive: true });
  return caseTemp();
}

export function identityCipher() {
  return {
    decrypt(value) {
      if (!value.startsWith("owned:")) throw new Error(`owned cipher rejected ${value}`);
      return value.slice("owned:".length);
    },
    encrypt(value) {
      return `owned:${value}`;
    },
  };
}

export function markedCipher(events = []) {
  return {
    decrypt(value) {
      events.push(`decrypt:${value}`);
      if (!value.startsWith("sealed:")) throw new Error("owned decrypt failure");
      return value.slice("sealed:".length);
    },
    encrypt(value) {
      events.push(`encrypt:${value}`);
      return `sealed:${value}`;
    },
  };
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function publicFacts() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return JSON.parse(await readFile(path.join(here, "..", "PUBLIC-FACTS.json"), "utf8"));
}
