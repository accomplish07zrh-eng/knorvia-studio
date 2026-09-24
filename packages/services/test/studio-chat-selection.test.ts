import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { admitStudioCommand } from "../src/studio-runtime/app/commandAdmission.js";
import type { StudioCommand, StudioConversation } from "../src/studio-runtime/contract.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";

test("chat model selection is frozen per queued turn, inherited per conversation and explicitly cleared", () => {
  const db = new StudioDatabase(
    join(mkdtempSync(join(tmpdir(), "studio-selection-")), "db.sqlite"),
  );
  const clock = { now: Date.now, id: randomUUID, delay: async () => {} };
  const command = (value: Omit<StudioCommand, "commandId">) =>
    admitStudioCommand(db, clock, { ...value, commandId: randomUUID() } as StudioCommand);
  const send = (targetId: string, selection?: { model?: string; reasoningEffort?: string }) =>
    command({ type: "send", kind: "chat", targetId, text: "hello", selection } as StudioCommand).id;
  try {
    command({
      type: "configure",
      kernel: "codex",
      config: {
        executablePath: "D:/codex.exe",
        permission: "read-only",
        model: "global",
        reasoningEffort: "medium",
      },
    } as StudioCommand);
    for (const id of ["first", "second"])
      command({
        type: "create-conversation",
        id,
        kernel: "codex",
        workspacePath: "D:/project",
      } as StudioCommand);
    const first = send("first", { model: "gpt-5.6-luna", reasoningEffort: "low" });
    command({
      type: "configure",
      kernel: "codex",
      config: {
        executablePath: "D:/new-codex.exe",
        permission: "ask",
        model: "other-default",
        reasoningEffort: "high",
      },
    } as StudioCommand);
    assert.deepEqual(db.read<StoredRun>("run", first)?.kernelConfig, {
      executablePath: "D:/codex.exe",
      permission: "read-only",
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
    });
    assert.equal(db.read<StoredRun>("run", send("first"))?.kernelConfig?.model, "gpt-5.6-luna");
    assert.equal(db.read<StoredRun>("run", send("second"))?.kernelConfig?.model, "other-default");
    const cleared = db.read<StoredRun>("run", send("first", {}))?.kernelConfig;
    assert.equal(cleared?.model, undefined);
    assert.equal(cleared?.reasoningEffort, undefined);
    assert.deepEqual(db.read<StudioConversation>("conversation", "first")?.selection, {});
    assert.equal(db.read<StoredRun>("run", send("first"))?.kernelConfig?.model, undefined);
    assert.throws(() => send("first", { reasoningEffort: "bad\0value" }), /思考档位/);
  } finally {
    db.close();
  }
});
