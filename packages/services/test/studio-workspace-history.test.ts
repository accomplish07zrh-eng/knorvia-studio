import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";

test("a member workspace remains reviewable after its last step leaves the bounded checkpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-workspace-history-"));
  const db = new StudioDatabase(join(root, "db.sqlite"));
  let inspected: string[] = [];
  const service = new StudioRuntimeService({
    db,
    clock: { now: Date.now, id: randomUUID, delay: async () => {} },
    kernels: {
      adapter: () => {
        throw new Error("unused");
      },
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: {
      prepare: async () => root,
      changes: async (...args) => {
        inspected = args;
        return [];
      },
      apply: async () => {},
    },
    onDidChange: () => ({ dispose() {} }),
    notify() {},
  });
  try {
    db.transaction(() => {
      db.write(
        "run",
        "run",
        {
          id: "run",
          targetId: "group",
          kind: "group",
          state: "succeeded",
          checkpoint: { steps: {}, values: {}, completedRounds: 40 },
        },
        "group",
      );
      db.write(
        "workspace",
        "run:early-step",
        { runId: "group-group", stepId: "codex", path: root, sourcePath: root },
        "run",
      );
      db.write("workspace-head", "run:codex", { stepId: "early-step", path: root }, "run");
    });
    const run = (await service.timeline("group")).runs[0]!;
    assert.deepEqual(run.workspaceStepIds, ["early-step"]);
    assert.equal(run.checkpoint.steps["early-step"], undefined);
    await service.workspaceChanges({ runId: run.id, stepId: run.workspaceStepIds![0]! });
    assert.deepEqual(inspected, ["group-group", "codex"]);
  } finally {
    await service.disposeAllAndWait();
  }
});
