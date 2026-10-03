import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SessionEventType } from "@knorvia/contracts";
import {
  baseline,
  cases,
  clock,
  consumer,
  current,
  gate,
  sha,
} from "./eval-workflow-snippet-execution-fixture.js";
const gold = JSON.parse(
  await readFile(
    new URL("./eval-workflow-snippet-business-contract.json", import.meta.url),
    "utf8",
  ),
);

test("snippet business failures retain full call-runner completion and display metadata", async () => {
  await clock(async () => {
    for (const name of ["diagnostics", "failed", "unavailable"]) {
      const run = async (selected: any) => {
        const pending = gate<any>();
        const f = consumer(selected, "normal", "owned", pending);
        if (name === "unavailable") f.deps.dynamicWorkflowSnippetPort = undefined;
        else pending.resolve(cases.find((c) => c.name === name).outcome);
        return f.run();
      };
      const old = await run(baseline);
      assert.equal(sha(JSON.stringify(old)), gold.digests[name], name);
      assert.deepEqual(await run(current), old, name);
      assert.equal(old.result.success, true);
      assert.equal(old.result.output.ok, false);
      assert.equal(old.result.display.kind, "eval_workflow_snippet");
      assert.equal(old.result.modelContent, old.result.output.response);
      assert.deepEqual(old.terminal, [{ name: "finishCompleted", args: [] }]);
      assert.equal(old.calls.length, name === "unavailable" ? 0 : 1);
      assert.ok(old.events.some((event: any) => event.type === SessionEventType.ToolCallResult));
      assert.ok(!old.events.some((event: any) => event.type === SessionEventType.ToolCallError));
    }
  });
});
