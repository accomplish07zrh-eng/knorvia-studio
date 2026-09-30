// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const [moduleUrl, filePath, prefix, roundsText, readyPath, startPath] = process.argv.slice(2);
const rounds = Number(roundsText);
assert.ok(moduleUrl && filePath && prefix && readyPath && startPath);
assert.ok(Number.isInteger(rounds) && rounds > 0);
const auth = await import(moduleUrl);
const cipher = {
  decrypt: (value) => value.slice("worker:".length),
  encrypt: (value) => `worker:${value}`,
};
const store = auth.createSharedKnorviaCredentialStore({ filePath, cipher, env: {} });
await writeFile(readyPath, String(process.pid), "utf8");
for (let attempt = 0; attempt < 600; attempt += 1) {
  try {
    await access(startPath);
    break;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (attempt === 599) throw new Error("owned worker barrier timed out");
    await delay(5);
  }
}
for (let index = 0; index < rounds; index += 1) {
  await store.save(`${prefix}-${index}`, `${prefix}-value-${index}`);
}
const own = await store.loadMany(
  Array.from({ length: rounds }, (_, index) => `${prefix}-${index}`),
);
for (let index = 0; index < rounds; index += 1) {
  assert.equal(own[`${prefix}-${index}`], `${prefix}-value-${index}`);
}
process.stdout.write(`${JSON.stringify({ assertions: rounds, prefix })}\n`);
