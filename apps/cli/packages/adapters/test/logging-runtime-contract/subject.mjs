// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function subject(name) {
  const root = process.env.KNORVIA_LOGGING_CONTRACT_ROOT;
  const suffix = process.env.KNORVIA_LOGGING_CONTRACT_MODE === "dist" ? ".js" : ".ts";
  if (!root) throw new Error("Missing explicit logging contract target");
  return import(pathToFileURL(join(root, `${name}${suffix}`)).href);
}

export async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-logging-contract-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

export async function records(root) {
  const files = (await readdir(root)).filter((name) => name.endsWith(".jsonl"));
  const rows = [];
  for (const file of files) {
    const text = await readFile(join(root, file), "utf8");
    rows.push(
      ...text
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line)),
    );
  }
  return rows;
}

export function spyLogger() {
  const calls = [];
  const logger = {};
  for (const level of ["debug", "info", "warn", "error"]) {
    logger[level] = function (message, context) {
      if (this !== logger) throw new Error("Logger receiver lost");
      calls.push({ level, message, context });
    };
  }
  return { calls, logger };
}
