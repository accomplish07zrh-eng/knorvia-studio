// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// Explicit old/candidate roots are required; normal offline CI never needs an old checkout.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadSubject } from "./subject.mjs";
import { world, portable } from "./fixture.mjs";

const [oldRoot, oldMode, newRoot, newMode] = process.argv.slice(2);
if (![oldRoot, oldMode, newRoot, newMode].every(Boolean))
  throw new Error("Expected old root/mode and candidate root/mode");
const old = await loadSubject(oldRoot, oldMode);
const candidate = await loadSubject(newRoot, newMode);
try {
  const cases = [];
  for (const [encoding, hex] of [
    ["utf8", "e4bda0e5a5bd0d0a7365636f6e640d0a"],
    ["gb2312", "c4e3bac30d0acec4b1be"],
    ["utf16le", "fffe61000d000a0062000d000a00"],
    ["hex", "00010280ff"],
  ]) {
    const w = world();
    const bytes = Buffer.from(hex, "hex");
    const path = w.put("upgrade.txt", bytes);
    const before = await new (old.use(w).fs.NodeFileSystemAdapter)().readTextFile({
      path,
      encoding,
    });
    const current = new (candidate.use(w).fs.NodeFileSystemAdapter)();
    assert.deepEqual(await current.readTextFile({ path, encoding }), before);
    await current.writeTextFile({
      path,
      content: before.content,
      encoding,
      lineEndings: before.lineEndings,
      expectedRevision: before.revision,
      atomic: false,
    });
    assert.deepEqual(w.files.get(path), bytes);
    const after = await new (old.use(w).fs.NodeFileSystemAdapter)().readTextFile({
      path,
      encoding,
    });
    assert.deepEqual(after, before);
    cases.push({
      encoding,
      bytesSha256: createHash("sha256").update(bytes).digest("hex"),
      result: portable(after),
    });
  }
  process.stdout.write(
    JSON.stringify(
      {
        sequence: ["old", "new", "old"],
        fixture: "Synthetic text bytes and real facade results; no user data",
        cases,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await candidate.dispose();
  await old.dispose();
}
