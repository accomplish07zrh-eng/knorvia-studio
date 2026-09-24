import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { MAX_FILE_BYTES } from "../src/studio-runtime/adapters/workspaceFiles.js";

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(join(tmpdir(), "knorvia-studio-workspace-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = join(root, "project");
  const data = join(root, "data");
  await fs.mkdir(source);
  await fs.writeFile(join(source, "a.txt"), "uncommitted source\n");
  const manager = createStudioWorkspaceManager(data);
  const prepare = (mode: "isolated" | "shared" = "isolated") =>
    manager.prepare({ runId: "run", stepId: "step", sourcePath: source, mode });
  return { root, source, data, manager, prepare };
}

test("snapshot includes current uncommitted files and excludes git/large dependency caches", async (t) => {
  const f = await fixture(t);
  await fs.mkdir(join(f.source, ".git"));
  await fs.writeFile(join(f.source, ".git", "config"), "unmodified");
  await fs.mkdir(join(f.source, "node_modules"));
  await fs.writeFile(join(f.source, "node_modules", "large"), Buffer.alloc(MAX_FILE_BYTES + 1));
  const working = await f.prepare();
  assert.equal(await fs.readFile(join(working, "a.txt"), "utf8"), "uncommitted source\n");
  await assert.rejects(fs.stat(join(working, ".git")), { code: "ENOENT" });
  await assert.rejects(fs.stat(join(working, "node_modules")), { code: "ENOENT" });
  assert.equal(await fs.readFile(join(f.source, ".git", "config"), "utf8"), "unmodified");
});

test("same run/step is idempotent across concurrent calls and manager recreation", async (t) => {
  const f = await fixture(t);
  const [one, two] = await Promise.all([f.prepare(), f.prepare()]);
  assert.equal(one, two);
  await fs.writeFile(join(one, "a.txt"), "agent edit");
  const resumed = createStudioWorkspaceManager(f.data);
  assert.equal(
    await resumed.prepare({ runId: "run", stepId: "step", sourcePath: f.source, mode: "isolated" }),
    one,
  );
  assert.equal(await fs.readFile(join(one, "a.txt"), "utf8"), "agent edit");
  await assert.rejects(f.prepare("shared"), /already belongs/);
});

test(
  "Windows case and slash aliases reuse the snapshot while distinct directories and modes remain fenced",
  { skip: process.platform !== "win32" },
  async (t) => {
    const f = await fixture(t);
    const original = await f.prepare();
    await fs.writeFile(join(original, "a.txt"), "retained isolated edit");
    const alias = f.source.toUpperCase().replaceAll("\\", "/") + "/";
    assert.notEqual(alias, f.source);
    assert.equal(
      await f.manager.prepare({
        runId: "run",
        stepId: "step",
        sourcePath: alias,
        mode: "isolated",
      }),
      original,
    );
    assert.equal(await fs.readFile(join(original, "a.txt"), "utf8"), "retained isolated edit");
    assert.equal((await f.manager.changes("run", "step"))[0]?.after, "retained isolated edit");
    await assert.rejects(
      f.manager.prepare({ runId: "run", stepId: "step", sourcePath: alias, mode: "shared" }),
      /already belongs/,
    );
    const different = join(f.root, "other-project");
    await fs.mkdir(different);
    await assert.rejects(
      f.manager.prepare({ runId: "run", stepId: "step", sourcePath: different, mode: "isolated" }),
      /already belongs/,
    );
  },
);

test("add/modify/delete previews apply only explicit paths and repeated apply is safe", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.source, "delete.txt"), "gone");
  const working = await f.prepare();
  await fs.writeFile(join(working, "a.txt"), "edited\n");
  await fs.writeFile(join(working, "new.txt"), "new");
  await fs.unlink(join(working, "delete.txt"));
  const changes = await f.manager.changes("run", "step");
  assert.deepEqual(
    changes.map(({ path, kind }) => [path, kind]),
    [
      ["a.txt", "modified"],
      ["delete.txt", "deleted"],
      ["new.txt", "added"],
    ],
  );
  await f.manager.apply("run", "step", ["a.txt"]);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "edited\n");
  assert.equal(await fs.readFile(join(f.source, "delete.txt"), "utf8"), "gone");
  await assert.rejects(fs.stat(join(f.source, "new.txt")), { code: "ENOENT" });
  await f.manager.apply("run", "step", ["a.txt", "new.txt", "delete.txt"]);
  assert.equal(await fs.readFile(join(f.source, "new.txt"), "utf8"), "new");
  await assert.rejects(fs.stat(join(f.source, "delete.txt")), { code: "ENOENT" });
});

test("user edits are conflicts and reject the whole selected batch before any change", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.source, "b.txt"), "before");
  const working = await f.prepare();
  await fs.writeFile(join(working, "a.txt"), "agent a");
  await fs.writeFile(join(working, "b.txt"), "agent b");
  await fs.writeFile(join(f.source, "b.txt"), "user changed b");
  assert.equal(
    (await f.manager.changes("run", "step")).find((change) => change.path === "b.txt")?.conflict,
    true,
  );
  await assert.rejects(
    f.manager.apply("run", "step", ["a.txt", "b.txt"]),
    /changed since isolation/,
  );
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "uncommitted source\n");
});

test("failure while publishing a later file rolls back earlier files", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.source, "b.txt"), "original b");
  const working = await f.prepare();
  await fs.writeFile(join(working, "a.txt"), "agent a");
  await fs.writeFile(join(working, "b.txt"), "agent b");
  const originalLink = fs.link;
  const link = t.mock.method(fs, "link", async (source, destination) => {
    if (String(source).endsWith(".tmp") && String(destination) === join(f.source, "b.txt"))
      throw new Error("simulated disk failure");
    return originalLink(source, destination);
  });
  await assert.rejects(
    f.manager.apply("run", "step", ["a.txt", "b.txt"]),
    /simulated disk failure/,
  );
  link.mock.restore();
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "uncommitted source\n");
  assert.equal(await fs.readFile(join(f.source, "b.txt"), "utf8"), "original b");
  await f.manager.apply("run", "step", ["a.txt", "b.txt"]);
});

test("rollback preserves concurrent user writes and blocks later blind reapplication", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.source, "b.txt"), "original b");
  const working = await f.prepare();
  await fs.writeFile(join(working, "a.txt"), "agent a");
  await fs.writeFile(join(working, "b.txt"), "agent b");
  const originalLink = fs.link;
  const link = t.mock.method(fs, "link", async (source, destination) => {
    if (String(source).endsWith(".tmp") && String(destination) === join(f.source, "b.txt")) {
      await fs.writeFile(join(f.source, "a.txt"), "concurrent user write");
      throw new Error("simulated disk failure");
    }
    return originalLink(source, destination);
  });
  await assert.rejects(
    f.manager.apply("run", "step", ["a.txt", "b.txt"]),
    /concurrent edits were preserved/,
  );
  link.mock.restore();
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "concurrent user write");
  await assert.rejects(f.manager.apply("run", "step", ["b.txt"]), /interrupted workspace apply/);
});

test("traversal, ADS, reserved paths and case aliases cannot be applied", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  for (const path of [
    "../outside",
    "a.txt:stream",
    "C:/outside",
    ".git/config",
    "folder\\file",
    "CON.txt",
    "trailing.",
  ])
    await assert.rejects(f.manager.apply("run", "step", [path]), /Unsafe workspace path/);
  if (process.platform === "win32")
    await assert.rejects(f.manager.apply("run", "step", ["a.txt", "A.txt"]), /distinct/);
});

test("source and agent-created junctions are rejected without traversing targets", async (t) => {
  const f = await fixture(t);
  const outside = join(f.root, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(join(outside, "private.txt"), "unchanged");
  await fs.symlink(outside, join(f.source, "linked"), "junction");
  await assert.rejects(f.prepare(), /links are not supported/);
  await fs.unlink(join(f.source, "linked"));
  const working = await f.prepare();
  await fs.symlink(outside, join(working, "linked"), "junction");
  await assert.rejects(f.manager.changes("run", "step"), /links are not supported/);
  await assert.rejects(
    f.manager.apply("run", "step", ["linked/private.txt"]),
    /links are not supported/,
  );
  assert.equal(await fs.readFile(join(outside, "private.txt"), "utf8"), "unchanged");
});

test("binary preview is marked and oversize non-cache source fails explicitly", async (t) => {
  const f = await fixture(t);
  const working = await f.prepare();
  await fs.writeFile(join(working, "binary"), Buffer.from([0, 1, 2]));
  assert.deepEqual((await f.manager.changes("run", "step"))[0], {
    path: "binary",
    kind: "added",
    before: null,
    after: null,
    binary: true,
    conflict: false,
  });
  await fs.writeFile(join(f.source, "large"), Buffer.alloc(MAX_FILE_BYTES + 1));
  await assert.rejects(
    f.manager.prepare({ runId: "large", stepId: "step", sourcePath: f.source, mode: "isolated" }),
    /exceeds 16 MiB/,
  );
});

test("shared mode returns the exact project and does not imply a review/apply boundary", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.prepare("shared"), f.source);
  assert.deepEqual(await f.manager.changes("run", "step"), []);
  await assert.rejects(f.manager.apply("run", "step", ["a.txt"]), /already write directly/);
});
