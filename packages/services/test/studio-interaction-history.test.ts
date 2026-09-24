import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";

test("pending user questions remain answerable after more than one page of completed interactions", async () => {
  const db = new StudioDatabase(
    join(mkdtempSync(join(tmpdir(), "studio-pending-history-")), "db.sqlite"),
  );
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
    workspaces: { prepare: async () => "", changes: async () => [], apply: async () => {} },
    onDidChange: () => ({ dispose() {} }),
    notify() {},
  });
  try {
    db.transaction(() => {
      db.write(
        "run",
        "run",
        { id: "run", targetId: "group", kind: "group", state: "waiting" },
        "group",
      );
      db.write(
        "interaction",
        "old-pending",
        { id: "old-pending", runId: "run", kind: "approval", status: "pending" },
        "group",
      );
    });
    for (let index = 0; index < 130; index++)
      db.transaction(() => {
        db.write(
          "interaction",
          `answered-${index}`,
          { id: `answered-${index}`, runId: "run", kind: "approval", status: "answered" },
          "group",
        );
      });
    assert.ok(
      (await service.timeline("group")).interactions.some((item) => item.id === "old-pending"),
    );
    await service.command({
      commandId: randomUUID(),
      type: "answer",
      interactionId: "old-pending",
      answer: { decision: "allow-once" },
    });
    assert.equal(
      db.list("interaction", { scope: "group", pendingInteractionsOnly: true }).length,
      0,
    );
  } finally {
    await service.disposeAllAndWait();
  }
});
