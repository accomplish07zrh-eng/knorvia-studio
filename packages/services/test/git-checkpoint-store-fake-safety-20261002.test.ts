import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { GitCheckpointMeta } from "@knorvia/shared";

test("fake manifest queue preserves atomic target, failures and subsequent admission", async (t) => {
  const files = new Map<string, string>();
  const root = join("/", "synthetic", "manifests");
  const target = join(root, "workspace-hash", "checkpoint.json");
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = true;
  let denied: Error | undefined;
  let writes = 0;
  t.mock.module("../src/paths.js", {
    namedExports: {
      getAppConfigDir: () => join("/", "synthetic", "config"),
      getWorkspaceHash: () => "workspace-hash",
    },
  });
  t.mock.module("node:fs/promises", {
    namedExports: {
      mkdir: async () => undefined,
      writeFile: async (path: string, content: string, encoding: string) => {
        assert.equal(encoding, "utf-8");
        writes += 1;
        files.set(path, content);
      },
      rename: async (from: string, to: string) => {
        if (held) {
          held = false;
          await hold;
        }
        if (denied) throw denied;
        assert.equal(to, target);
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      readFile: async (path: string) => {
        if (!files.has(path)) throw new Error("synthetic absent");
        return files.get(path)!;
      },
      rm: async (path: string, options: { force: boolean }) => {
        assert.equal(options.force, true);
        if (denied) throw denied;
        files.delete(path);
      },
    },
  });
  const { GitCheckpointStore } = await import("../src/git/repo/gitCheckpointStore.js");
  const owner = new GitCheckpointStore({ rootDir: root });
  const meta: GitCheckpointMeta = {
    checkpointId: "checkpoint",
    workspacePath: "/synthetic/workspace",
    repoRoot: "/synthetic/repo",
    workspaceInRepoPath: "workspace",
    createdAt: 1,
    refName: "refs/knorvia/checkpoints/fake/checkpoint",
    commitOid: "first",
    scope: "workspace",
  };
  const first = owner.save(meta);
  const secondMeta = { ...meta, commitOid: "second" };
  const second = owner.save(secondMeta);
  const loading = owner.load(meta.workspacePath, meta.checkpointId);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(writes, 1);
  assert.equal(files.has(target), false);
  release!();
  await Promise.all([first, second]);
  assert.deepEqual(await loading, secondMeta);
  assert.equal(files.get(target), `${JSON.stringify(secondMeta, null, 2)}\n`);
  const prior = files.get(target);
  denied = new Error("synthetic rename permission refusal");
  await assert.rejects(owner.save({ ...meta, commitOid: "denied" }), (error) => error === denied);
  assert.equal(files.get(target), prior);
  assert.equal(
    [...files.keys()].some((path) => path.endsWith(".tmp")),
    true,
  );
  await assert.rejects(
    owner.delete(meta.workspacePath, meta.checkpointId),
    (error) => error === denied,
  );
  assert.equal(files.get(target), prior);
  denied = undefined;
  await owner.save(meta);
  assert.deepEqual(await owner.load(meta.workspacePath, meta.checkpointId), meta);
  files.set(target, "invalid synthetic JSON");
  assert.equal(await owner.load(meta.workspacePath, meta.checkpointId), null);
  await owner.delete(meta.workspacePath, meta.checkpointId);
  assert.equal(files.has(target), false);
});
