import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { admitStudioCommand } from "../src/studio-runtime/app/commandAdmission.js";
import {
  executionCheckpoint,
  readStudioStep,
  saveStudioStep,
  saveStudioValues,
} from "../src/studio-runtime/app/checkpointStorage.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioCommand, StudioGroupDefinition } from "../src/studio-runtime/contract.js";

const clock = { now: Date.now, id: randomUUID, delay: async () => {} };
const group: StudioGroupDefinition = {
  id: "group",
  name: "Team",
  members: ["knorvia", "codex"],
  host: "knorvia",
  goal: "finish",
  sharedSummary: "",
  mode: "task",
  workspaceMode: "isolated",
  workspacePath: "D:/project",
  createdAt: 1,
  updatedAt: 1,
};
function setup() {
  const db = new StudioDatabase(
    join(mkdtempSync(join(tmpdir(), "studio-continuity-")), "db.sqlite"),
  );
  admitStudioCommand(db, clock, { commandId: "group", type: "save-group", group });
  return { db };
}
test("old draft import never overwrites saved definitions and unchanged saves are allowed while queued", () => {
  const { db } = setup();
  try {
    admitStudioCommand(db, clock, {
      commandId: "import",
      type: "save-group",
      group: { ...group, name: "old" },
      onlyIfAbsent: true,
    });
    assert.equal(db.read<StudioGroupDefinition>("group", "group")?.name, "Team");
    admitStudioCommand(db, clock, {
      commandId: "send",
      type: "send",
      kind: "group",
      targetId: "group",
      text: "start",
      taskMode: true,
    });
    admitStudioCommand(db, clock, {
      commandId: "unchanged",
      type: "save-group",
      group: { ...group, updatedAt: 100 },
    });
    assert.throws(
      () =>
        admitStudioCommand(db, clock, {
          commandId: "changed",
          type: "save-group",
          group: { ...group, goal: "new goal" },
        }),
      /先停止/,
    );
  } finally {
    db.close();
  }
});
test("steering is durable and idempotent, stop revokes queued continuation without touching another group", () => {
  const { db } = setup();
  try {
    const run = admitStudioCommand(db, clock, {
      commandId: "task",
      type: "send",
      kind: "group",
      targetId: "group",
      text: "task",
      taskMode: true,
    });
    const steer: StudioCommand = {
      commandId: "steer",
      type: "steer",
      runId: run.id,
      text: "add a test before delivery",
    };
    admitStudioCommand(db, clock, steer);
    admitStudioCommand(db, clock, steer);
    assert.equal(db.list("steering", { scope: run.id }).length, 1);
    const queued = admitStudioCommand(db, clock, {
      commandId: "next",
      type: "send",
      kind: "group",
      targetId: "group",
      text: "followup",
    });
    admitStudioCommand(db, clock, {
      commandId: "other",
      type: "save-group",
      group: { ...group, id: "other" },
    });
    const other = admitStudioCommand(db, clock, {
      commandId: "other-run",
      type: "send",
      kind: "group",
      targetId: "other",
      text: "independent",
    });
    admitStudioCommand(db, clock, { commandId: "stop", type: "cancel", runId: run.id });
    assert.equal(db.read<StoredRun>("run", queued.id)?.state, "cancelled");
    assert.equal(db.read<StoredRun>("run", other.id)?.state, "queued");
    assert.throws(() => admitStudioCommand(db, clock, { ...steer, commandId: "late" }), /已结束/);
  } finally {
    db.close();
  }
});
test("long-running checkpoints remain bounded while full outputs remain available after restart", () => {
  const { db } = setup();
  try {
    const accepted = admitStudioCommand(db, clock, {
      commandId: "task",
      type: "send",
      kind: "group",
      targetId: "group",
      text: "long work",
      taskMode: true,
    });
    const fullText = "evidence ".repeat(10000);
    for (let index = 0; index < 120; index++)
      db.transaction(() => {
        const run = db.read<StoredRun>("run", accepted.id)!;
        saveStudioStep(db, run, `step:${index}`, {
          status: "succeeded",
          text: fullText,
          resultKnown: true,
        });
        db.write("run", run.id, run, run.targetId);
      });
    let saved = db.read<StoredRun>("run", accepted.id)!;
    assert.equal(Object.keys(saved.checkpoint.steps).length, 64);
    assert.ok(JSON.stringify(saved).length < 100000);
    assert.equal(readStudioStep(db, saved, "step:0")?.text, fullText);
    db.transaction(() => {
      saveStudioValues(db, saved, {
        value: JSON.stringify({ status: "succeeded", text: fullText, resultKnown: true }),
      });
      db.write("run", saved.id, saved, saved.targetId);
    });
    saved = db.read<StoredRun>("run", accepted.id)!;
    assert.equal(JSON.parse(executionCheckpoint(db, saved).values.value!).text, fullText);
    assert.ok(saved.checkpoint.values.value!.length < 2000);
  } finally {
    db.close();
  }
});
test("source project apply gate covers independent groups with equivalent Windows paths", () => {
  const { db } = setup();
  try {
    db.transaction(() => db.write("apply-lock", "d:\\project", { token: "pending", pid: 123 }));
    assert.throws(
      () =>
        admitStudioCommand(db, clock, {
          commandId: "task",
          type: "send",
          kind: "group",
          targetId: "group",
          text: "work",
        }),
      /修改正在应用/,
    );
  } finally {
    db.close();
  }
});
