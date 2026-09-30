// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadSubject } from "./subject.mjs";
import { world, path } from "./fixture.mjs";
const [oldRoot, oldMode, newRoot, newMode] = process.argv.slice(2);
if (![oldRoot, oldMode, newRoot, newMode].every(Boolean))
  throw new Error("Expected explicit old/candidate root/mode");
const old = await loadSubject(oldRoot, oldMode),
  current = await loadSubject(newRoot, newMode),
  rollback = await loadSubject(oldRoot, oldMode);
try {
  const cases = [];
  for (const [encoding, hex] of [
    ["utf8", "e4bda0e5a5bd0d0a7365636f6e640d0a"],
    ["gb2312", "c4e3bac30d0acec4b1be"],
    ["utf16le", "fffe61000d000a0062000d000a00"],
    ["hex", "00010280ff"],
  ]) {
    const w = world(),
      bytes = Buffer.from(hex, "hex"),
      file = w.put("remaining-upgrade.txt", bytes);
    const before = await new (old.use(w).fs.NodeFileSystemAdapter)().readTextFile({
        path: file,
        encoding,
      }),
      candidate = new (current.use(w).fs.NodeFileSystemAdapter)();
    assert.deepEqual(await candidate.readTextFile({ path: file, encoding }), before);
    await candidate.writeTextFile({
      path: file,
      content: before.content,
      encoding,
      lineEndings: before.lineEndings,
      expectedRevision: before.revision,
      atomic: true,
    });
    assert.deepEqual(w.files.get(file), bytes);
    assert.deepEqual(
      await new (rollback.use(w).fs.NodeFileSystemAdapter)().readTextFile({ path: file, encoding }),
      before,
    );
    cases.push({
      encoding,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytesUnchanged: true,
    });
  }
  const w = world(),
    base = path("remaining-identity-upgrade"),
    file = w.put(
      "remaining-identity-upgrade/.knorvia-studio/v2/telemetry-state.json",
      '{"unknown":{"keep":[1,2]}}',
    );
  assert.equal(
    await old
      .use(w)
      .identity.ensureCliDeviceMid({ baseDir: base, createId: () => "synthetic-upgrade-device" }),
    "synthetic-upgrade-device",
  );
  const saved = Buffer.from(w.files.get(file));
  for (const subject of [current, rollback])
    assert.equal(
      await subject.use(w).identity.ensureCliDeviceMid({
        baseDir: base,
        createId: () => {
          throw new Error("Existing synthetic identity must be accepted");
        },
      }),
      "synthetic-upgrade-device",
    );
  assert.deepEqual(w.files.get(file), saved);
  assert.deepEqual(JSON.parse(saved.toString()), {
    unknown: { keep: [1, 2] },
    deviceMid: "synthetic-upgrade-device",
  });
  console.log(
    JSON.stringify(
      {
        sequence: ["old", "new", "fresh-old"],
        cases,
        identity: {
          unknownFieldsPreserved: true,
          stateBytesUnchangedAfterUpgrade: true,
          sha256: createHash("sha256").update(saved).digest("hex"),
        },
        scope: "Synthetic fixture only; no user data conversion",
      },
      null,
      2,
    ),
  );
} finally {
  await old.dispose();
  await current.dispose();
  await rollback.dispose();
}
