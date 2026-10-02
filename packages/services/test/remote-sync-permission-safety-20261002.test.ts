import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkRemoteSyncDirectoriesWriteAccess,
  checkRemoteSyncDirectoryWriteAccess,
} from "../src/remote-sync/remoteSyncWriteAccess.js";

test("synthetic preflight cleans markers and stops at the first unwritable directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-preflight-safety-"));
  try {
    const first = join(root, "nested", "first");
    assert.deepEqual(await checkRemoteSyncDirectoryWriteAccess(first), { ok: true, path: first });
    assert.deepEqual(await readdir(first), []);
    const blocked = join(root, "synthetic-file");
    await writeFile(blocked, "synthetic unchanged");
    const untouched = join(root, "later");
    const result = await checkRemoteSyncDirectoriesWriteAccess([first, blocked, untouched]);
    assert.equal(result.ok, false);
    assert.equal(result.path, blocked);
    assert.ok(result.error);
    assert.equal(await readFile(blocked, "utf8"), "synthetic unchanged");
    assert.deepEqual(await readdir(first), []);
    await assert.rejects(stat(untouched), { code: "ENOENT" });
    assert.deepEqual(await checkRemoteSyncDirectoriesWriteAccess([]), { ok: true, path: "" });
    assert.deepEqual(await checkRemoteSyncDirectoriesWriteAccess([first, first]), {
      ok: true,
      path: `${first}, ${first}`,
    });
    assert.deepEqual(await readdir(first), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
