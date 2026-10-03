// Frozen before replacement. Inputs are owned snapshots; no Git/FS/process effects.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  comparison,
  entry,
  projectionFixture,
  root,
  snapshot,
  workspace,
} from "./git-read-projection-fixture-fast-20261001.js";
const f = await projectionFixture();
const keys = [
  "path",
  "repoRelativePath",
  "workspaceRelativePath",
  "x",
  "y",
  "kind",
  "section",
  "added",
  "removed",
  "isStaged",
  "isUntracked",
  "isConflicted",
];
const values = [null, ".", "M"];
const flags = [
  { isUntracked: false, isConflicted: false, sections: [null, null, "unstaged"] },
  { isUntracked: true, isConflicted: false, sections: ["untracked", "untracked", "untracked"] },
  { isUntracked: false, isConflicted: true, sections: ["conflicted", "conflicted", "conflicted"] },
  { isUntracked: true, isConflicted: true, sections: ["conflicted", "conflicted", "conflicted"] },
];
for (const [flagIndex, flag] of flags.entries())
  for (const [xi, x] of values.entries())
    for (const [yi, y] of values.entries())
      for (const sourceId of ["staged", "unstaged"] as const)
        test(`frozen precedence flags=${flagIndex} x=${xi} y=${yi} ${sourceId}`, async () => {
          const status = snapshot([
            entry({ x, y, isUntracked: flag.isUntracked, isConflicted: flag.isConflicted }),
          ]);
          status.stagedStats.set("work/owned.txt", { added: 7, removed: 11, kind: "deleted" });
          status.unstagedStats.set("work/owned.txt", { added: 13, removed: 17 });
          status.untrackedStats.set("work/owned.txt", { added: 19, removed: 23 });
          const expected =
            sourceId === "staged"
              ? flagIndex === 0 && xi === 2
                ? "staged"
                : null
              : flag.sections[yi];
          const result = await f
            .service({ status })
            .api.getChanges({ workspacePath: workspace, sourceId });
          if (!expected) {
            assert.deepEqual(result, []);
            return;
          }
          const stats = {
            staged: [7, 11],
            unstaged: [13, 17],
            untracked: [19, 23],
            conflicted: [0, 0],
          }[expected]!;
          assert.deepEqual(result, [
            {
              path: resolve(root, "work", "owned.txt"),
              repoRelativePath: "work/owned.txt",
              workspaceRelativePath: "owned.txt",
              x: x ?? undefined,
              y: y ?? undefined,
              kind: "modified",
              section: expected,
              added: stats[0],
              removed: stats[1],
              isStaged: expected === "staged",
              isUntracked: expected === "untracked",
              isConflicted: expected === "conflicted",
            },
          ]);
          assert.deepEqual(Object.keys(result[0]!), keys);
          assert.equal(result[0]!.kind, "modified");
        });

for (const [path, originalPath, admitted, relative] of [
  ["work/a.txt", null, true, "a.txt"],
  ["other/a.txt", null, false, "other/a.txt"],
  ["workish/a.txt", null, false, "workish/a.txt"],
  ["other/a.txt", "work/old.txt", true, "other/a.txt"],
  ["work/new.txt", "other/old.txt", true, "new.txt"],
  ["other/a.txt", "workish/a.txt", false, "other/a.txt"],
  ["work", null, true, "."],
  ["./work/space 中文.txt", null, true, "space 中文.txt"],
  ["work\\nested\\a.txt", null, true, "nested/a.txt"],
  ["other/a.txt", "work\\old.txt", true, "other/a.txt"],
] as const)
  for (const mode of ["status", "branch"] as const)
    test(`scope ${mode} current=${path} rename=${originalPath}`, async () => {
      const status = snapshot([entry({ path, originalPath, kind: "renamed" })]);
      const branch = comparison();
      branch.changes = [{ path, originalPath, kind: "renamed", added: 5, removed: 6 }];
      const api = f.service({ status, branch }).api;
      const result =
        mode === "status"
          ? await api.getChanges({ workspacePath: workspace, sourceId: "staged" })
          : (await api.getBranchComparison({ workspacePath: workspace })).changes;
      assert.equal(result.length, admitted ? 1 : 0);
      if (admitted) {
        assert.equal(result[0]!.path, resolve(root, ...path.replace(/\\/g, "/").split("/")));
        assert.equal(result[0]!.repoRelativePath, path);
        assert.equal(result[0]!.workspaceRelativePath, relative);
        assert.equal(result[0]!.kind, "renamed");
        assert.equal(Object.hasOwn(result[0]!, "originalPath"), false);
        assert.equal(Object.hasOwn(result[0]!, "x"), mode === "status");
      }
    });

for (const [path, stat, count] of [
  ["work/zero.txt", undefined, 0],
  ["work/zero.txt", { added: 0, removed: 0 }, 0],
  ["work/empty/", undefined, 1],
  ["work/empty\\", undefined, 0],
  ["work/a.txt", { added: 1, removed: 0 }, 1],
  ["work/a.txt", { added: 0, removed: 1 }, 1],
  ["work/a.txt", { added: -1, removed: -2 }, 0],
  ["work/a.txt", { added: NaN, removed: NaN }, 0],
  ["work/a.txt", { added: Infinity, removed: -2 }, 1],
] as const)
  test(`untracked visibility ${path} ${String(stat?.added)}/${String(stat?.removed)}`, async () => {
    const status = snapshot([entry({ path, isUntracked: true })]);
    if (stat) status.untrackedStats.set(path, stat);
    status.unstagedStats.set(path, { added: 90, removed: 80 });
    const result = await f
      .service({ status })
      .api.getChanges({ workspacePath: workspace, sourceId: "unstaged" });
    assert.equal(result.length, count);
    if (count) {
      assert.equal(result[0]!.section, "untracked");
      assert.equal(result[0]!.added, stat?.added ?? 0);
    }
  });

test("summary scope is status owner; resolution scope is branch owner, root spellings preserved", async () => {
  const status = snapshot([entry({ path: "else/a.txt" })]);
  status.summary.workspaceInRepoPath = "else";
  const branch = comparison();
  branch.changes[0]!.path = "work/a.txt";
  const api = f.service({ status, branch }).api;
  assert.equal(
    (await api.getChanges({ workspacePath: workspace, sourceId: "staged" }))[0]!
      .workspaceRelativePath,
    "a.txt",
  );
  assert.equal(
    (await api.getBranchComparison({ workspacePath: workspace })).changes[0]!.workspaceRelativePath,
    "a.txt",
  );
  status.summary.workspaceInRepoPath = "./";
  assert.equal(
    (await api.getChanges({ workspacePath: workspace, sourceId: "staged" }))[0]!
      .workspaceRelativePath,
    "else/a.txt",
  );
});
test("entry order, duplicates and sparse holes are preserved without input mutation", async () => {
  const entries = [
    entry({ path: "work/z.txt" }),
    entry({ path: "work/placeholder.txt" }),
    entry({ path: "work/a.txt" }),
    entry({ path: "work/z.txt" }),
  ] as ReturnType<typeof entry>[];
  delete entries[1];
  const before = entries.slice(),
    status = snapshot(entries),
    branch = comparison();
  branch.changes = entries.map((value) => ({
    path: value.path,
    originalPath: null,
    kind: value.kind,
    added: 0,
    removed: 0,
  }));
  const api = f.service({ status, branch }).api;
  for (const result of [
    await api.getChanges({ workspacePath: workspace, sourceId: "unstaged" }),
    (await api.getBranchComparison({ workspacePath: workspace })).changes,
  ])
    assert.deepEqual(
      result.map((value) => value.repoRelativePath),
      ["work/z.txt", "work/a.txt", "work/z.txt"],
    );
  assert.deepEqual(entries, before);
});
test("defaults, raw status letters, exact stat keys and runtime source fallback", async () => {
  const status = snapshot([entry({ path: "work\\a.txt", x: "", y: "?" })]);
  status.unstagedStats.set("work/a.txt", { added: 99, removed: 99 });
  const api = f.service({ status }).api;
  assert.deepEqual(await api.getChanges({ workspacePath: workspace, sourceId: "staged" }), []);
  const result = await api.getChanges({
    workspacePath: workspace,
    sourceId: "unexpected" as "unstaged",
  });
  assert.equal(result[0]!.added, 0);
  assert.equal(result[0]!.removed, 0);
  assert.equal(result[0]!.x, "");
  assert.equal(result[0]!.y, "?");
});
test("branch metadata, own key order and raw stats remain exact", async () => {
  const branch = comparison();
  branch.baseRef = branch.headRef = branch.comparisonLabel = null;
  branch.changes[0]!.added = -3;
  branch.changes[0]!.removed = NaN;
  const result = await f.service({ branch }).api.getBranchComparison({ workspacePath: workspace });
  assert.deepEqual(Object.keys(result), ["baseRef", "headRef", "comparisonLabel", "changes"]);
  assert.deepEqual(
    Object.keys(result.changes[0]!),
    keys.filter((key) => key !== "x" && key !== "y"),
  );
  assert.equal(result.baseRef, null);
  assert.equal(result.headRef, null);
  assert.equal(result.comparisonLabel, null);
  assert.equal(result.changes[0]!.added, -3);
  assert.ok(Number.isNaN(result.changes[0]!.removed));
  assert.equal(result.changes[0]!.isStaged, false);
  assert.equal(result.changes[0]!.isUntracked, false);
  assert.equal(result.changes[0]!.isConflicted, false);
});
test("scope and first-match rejection never acquire forbidden flags or maps", async () => {
  const outside = entry({ path: "other/a.txt" });
  for (const key of ["isConflicted", "isUntracked", "x", "y"])
    Object.defineProperty(outside, key, { get: () => assert.fail(`outside flag ${key}`) });
  const conflict = entry({ isConflicted: true, isUntracked: true }),
    status = snapshot([outside, conflict]);
  for (const key of ["stagedStats", "unstagedStats", "untrackedStats"])
    Object.defineProperty(status, key, { get: () => assert.fail(`forbidden map ${key}`) });
  const api = f.service({ status }).api;
  assert.equal(
    (await api.getChanges({ workspacePath: workspace, sourceId: "unstaged" }))[0]!.section,
    "conflicted",
  );
  assert.deepEqual(await api.getChanges({ workspacePath: workspace, sourceId: "staged" }), []);
});
test("selected map error precedes output path/kind evaluation and remains same error", async () => {
  const failure = new Error("owned stat lookup"),
    value = entry(),
    status = snapshot([value]);
  Object.defineProperty(value, "kind", {
    get: () => assert.fail("record construction before stats"),
  });
  status.unstagedStats.get = () => {
    throw failure;
  };
  await assert.rejects(
    f.service({ status }).api.getChanges({ workspacePath: workspace, sourceId: "unstaged" }),
    (error) => error === failure,
  );
});
test("current path wins scope without reading rename getter; record failures remain unchanged", async () => {
  const value = entry(),
    status = snapshot([value]),
    failure = new Error("owned kind getter");
  Object.defineProperty(value, "originalPath", {
    get: () => assert.fail("unneeded original path"),
  });
  Object.defineProperty(value, "kind", {
    get: () => {
      throw failure;
    },
  });
  await assert.rejects(
    f.service({ status }).api.getChanges({ workspacePath: workspace, sourceId: "staged" }),
    (error) => error === failure,
  );
});
