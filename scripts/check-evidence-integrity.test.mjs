// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkEvidenceIntegrity } from "./check-evidence-integrity.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-evidence-integrity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["docs/evidence", "licensing/evidence"])
    await mkdir(join(root, path), { recursive: true });
  const records = [
    {
      path: "docs/evidence/types.d.ts",
      content: Buffer.from("same declaration\r\nsame declaration\n"),
    },
    { path: "licensing/evidence/original.bin", content: Buffer.from([0, 255, 13, 10]) },
  ];
  for (const record of records) await writeFile(join(root, record.path), record.content);
  const manifest = {
    schemaVersion: 1,
    baselineCommit: "a".repeat(40),
    roots: ["docs/evidence", "licensing/evidence"],
    files: records.map(({ path, content }) => ({
      path,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    })),
  };
  const save = () =>
    writeFile(join(root, "licensing/frozen-evidence.json"), JSON.stringify(manifest));
  await save();
  return { root, records, manifest, save };
}

test("keeps duplicate declarations, binary payload and mixed line endings byte-identical", async (t) => {
  const { root, records } = await fixture(t);
  const result = await checkEvidenceIntegrity(root);
  assert.equal(result.files, 2);
  assert.equal(
    result.bytes,
    records.reduce((sum, record) => sum + record.content.length, 0),
  );
  for (const record of records)
    assert.deepEqual(await readFile(join(root, record.path)), record.content);
});

test("rejects same-length tampering and line-ending normalization", async (t) => {
  const { root, records } = await fixture(t);
  await writeFile(join(root, records[1].path), Buffer.from([0, 254, 13, 10]));
  await assert.rejects(checkEvidenceIntegrity(root), /Frozen evidence changed/);
  await writeFile(join(root, records[1].path), records[1].content);
  await writeFile(
    join(root, records[0].path),
    records[0].content.toString().replaceAll("\r\n", "\n"),
  );
  await assert.rejects(checkEvidenceIntegrity(root), /Frozen evidence changed/);
});

test("rejects missing and unregistered records instead of auto-refreshing", async (t) => {
  const { root, records } = await fixture(t);
  await rm(join(root, records[0].path));
  await writeFile(join(root, "docs/evidence/new.ts"), "unregistered source");
  await assert.rejects(checkEvidenceIntegrity(root), (error) => {
    assert.match(error.message, /Frozen evidence missing/);
    assert.match(error.message, /Unregistered frozen evidence/);
    return true;
  });
});

test("rejects duplicate records and repository-relative path escapes", async (t) => {
  const { root, manifest, save } = await fixture(t);
  manifest.files.push({ ...manifest.files[0] });
  await save();
  await assert.rejects(checkEvidenceIntegrity(root), /duplicate frozen evidence record/);
  manifest.files.pop();
  for (const path of ["docs/evidence/../outside", "docs/evidence\\outside", "/docs/evidence/file"])
    await t.test(path, async () => {
      manifest.files[0].path = path;
      await save();
      await assert.rejects(checkEvidenceIntegrity(root), /Invalid frozen evidence path/);
    });
});

test("rejects an archive directory link rather than reading outside the snapshot", async (t) => {
  const { root } = await fixture(t);
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(
    outside,
    join(root, "docs/evidence/linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(checkEvidenceIntegrity(root), /must be a regular file/);
});
