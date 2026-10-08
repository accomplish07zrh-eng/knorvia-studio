import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { studioRunHistory } from "../src/studio-runtime/app/runQueries.js";

test("workbench history contains all unresolved SQLite records beyond the former cutoff", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-workbench-history-"));
  const db = new StudioDatabase(join(root, "studio.sqlite"));
  try {
    db.transaction(() => {
      for (let i = 0; i < 10003; i++) {
        db.write(
          "run",
          `waiting-${i}`,
          { id: `waiting-${i}`, targetId: "chat", state: "waiting" },
          "chat",
        );
        db.write("active", `waiting-${i}`, { id: `waiting-${i}`, targetId: "chat" });
      }
      for (let i = 0; i < 105; i++)
        db.write(
          "run",
          `done-${i}`,
          { id: `done-${i}`, targetId: "chat", state: "succeeded" },
          "chat",
        );
    });
    const runs = studioRunHistory(db);
    assert.equal(runs.filter((run) => run.state === "waiting").length, 10003);
    assert.equal(runs.filter((run) => run.state === "succeeded").length, 100);
    assert.ok(runs.some((run) => run.id === "waiting-0"));
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
