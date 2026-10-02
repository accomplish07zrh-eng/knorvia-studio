import assert from "node:assert/strict";
import test from "node:test";
import type { GitCheckpointMeta } from "@knorvia/shared";
import type { GitCheckpointStore } from "../src/git/repo/gitCheckpointStore.js";

test("fake checkpoint service gates identity and orders metadata/ref effects", async (t) => {
  const events: string[] = [];
  const workspacePath = "/synthetic/workspace";
  const meta: GitCheckpointMeta = {
    checkpointId: "synthetic-id",
    workspacePath,
    repoRoot: "/synthetic/repo",
    workspaceInRepoPath: "workspace",
    createdAt: 1,
    refName: "refs/knorvia/checkpoints/fake/synthetic-id",
    commitOid: "fake-oid",
    scope: "workspace",
  };
  let stored: GitCheckpointMeta | null = meta;
  let refFailure: Error | undefined;
  const store = {
    save: async (value: GitCheckpointMeta) => {
      events.push("save");
      assert.equal(value, meta);
    },
    load: async () => {
      events.push("load");
      return stored;
    },
    delete: async () => {
      events.push("manifest-delete");
    },
  } as unknown as GitCheckpointStore;
  const repo = {
    createCheckpoint: async (input: { workspacePath: string; checkpointId: string }) => {
      events.push("create-ref");
      assert.deepEqual(input, { workspacePath, checkpointId: "synthetic-id" });
      return meta;
    },
    diffCheckpoints: async () => {
      events.push("diff");
      return { fromCheckpointId: "a", toCheckpointId: "b", files: [] };
    },
    restoreBetweenCheckpoints: async () => {
      events.push("restore");
      return { success: true, restoredPaths: [] };
    },
    deleteCheckpoint: async () => {
      events.push("ref-delete");
      if (refFailure) throw refFailure;
    },
  };
  t.mock.module("node:crypto", { namedExports: { randomUUID: () => "synthetic-id" } });
  t.mock.module("../src/git/repo/gitCheckpointStore.js", {
    namedExports: { GitCheckpointStore: class {} },
  });
  t.mock.module("../src/git/repo/gitCheckpointRepo.js", {
    namedExports: { createGitCheckpointRepo: () => assert.fail("unexpected default repository") },
  });
  const { createGitCheckpointService } = await import("../src/git/gitCheckpointService.js");
  const owner = createGitCheckpointService({ store, repo });
  assert.equal(await owner.createCheckpoint({ workspacePath }), meta);
  assert.deepEqual(events, ["create-ref", "save"]);
  events.length = 0;
  refFailure = new Error("synthetic permission refusal");
  await assert.rejects(
    owner.deleteCheckpoint({ workspacePath, checkpointId: meta.checkpointId }),
    (error) => error === refFailure,
  );
  assert.deepEqual(events, ["load", "ref-delete"]);
  refFailure = undefined;
  events.length = 0;
  await owner.deleteCheckpoint({ workspacePath, checkpointId: meta.checkpointId });
  assert.deepEqual(events, ["load", "ref-delete", "manifest-delete"]);
  events.length = 0;
  stored = { ...meta, workspacePath: "/synthetic/other" };
  await assert.rejects(
    owner.restoreBetweenCheckpoints({
      workspacePath,
      fromCheckpointId: "a",
      toCheckpointId: "b",
      force: true,
    }),
    /Checkpoint workspace mismatch:/,
  );
  assert.equal(events.includes("restore"), false);
  stored = null;
  await assert.rejects(
    owner.diffCheckpoints({ workspacePath, fromCheckpointId: "absent", toCheckpointId: "b" }),
    /Checkpoint does not exist: absent/,
  );
  assert.equal(events.includes("diff"), false);
});
