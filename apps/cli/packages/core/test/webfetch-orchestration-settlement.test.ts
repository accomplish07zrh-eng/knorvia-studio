import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { entry } from "./webfetch-orchestration-fixture.js";
import {
  archive,
  baseline,
  edgeCases,
  paths,
  settlement,
} from "./webfetch-orchestration-settlement-fixture.js";
test("appended reference binds exact frozen baseline and unchanged public contracts", () => {
  assert.equal(archive.commit, "613c250629764cad1eca8e61a4d8df5f91d0e627");
  assert.equal(archive.sourceBytes, 8311);
  assert.equal(baseline.inputSchema, entry.inputSchema);
  assert.deepEqual(baseline.metadata, entry.metadata);
  assert.deepEqual(baseline.permission, entry.permission);
});
for (const driver of ["deadline", "executor"] as const)
  test(`appended ${driver}: queued network/cache/model/result completion matches exact baseline`, async () => {
    const digest = createHash("sha256"),
      totals = { completed: 0, cancelled: 0 };
    for (const c of edgeCases) {
      const old = await settlement(baseline, driver, c.path, c.stage, c.depth);
      const current = await settlement(entry, driver, c.path, c.stage, c.depth);
      assert.deepEqual(current, old, JSON.stringify({ driver, ...c }));
      assert.equal(old.fired, true);
      if (old.fact.success) totals.completed++;
      else {
        totals.cancelled++;
        assert.equal(
          old.fact.error.type ?? old.fact.error.thrown?.type,
          CoreErrorType.ToolCancelled,
        );
      }
      if (driver === "executor") {
        assert.deepEqual(
          old.telemetry.map((t: any) => t.name),
          [old.fact.success ? "finishCompleted" : "finishCancelled"],
        );
        assert.equal(old.terminalEvents.length, 1);
        assert.equal(
          old.terminalEvents[0].type,
          old.fact.success ? SessionEventType.ToolCallResult : SessionEventType.ToolCallError,
        );
      }
      digest.update(JSON.stringify(old) + "\n");
    }
    assert.ok(totals.completed > 0);
    assert.ok(totals.cancelled > 0);
    console.log(
      JSON.stringify({
        driver,
        comparisons: edgeCases.length,
        ...totals,
        sha256: digest.digest("hex"),
      }),
    );
  });
for (const driver of ["deadline", "executor"] as const)
  test(`appended ${driver}: early and uncancelled controls preserve output/metadata/events/telemetry`, async () => {
    for (const path of paths)
      for (const early of [false, true]) {
        const old = await settlement(baseline, driver, path, "none", 0, early);
        assert.deepEqual(
          await settlement(entry, driver, path, "none", 0, early),
          old,
          `${path}/${early}`,
        );
        assert.equal(old.fact.success, !early);
        if (early) assert.equal(old.effects.length, 0);
        if (driver === "executor")
          assert.deepEqual(
            old.telemetry.map((t: any) => t.name),
            [early ? "finishCancelled" : "finishCompleted"],
          );
      }
  });
