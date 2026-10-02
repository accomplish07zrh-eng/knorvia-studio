import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import {
  actual,
  archive,
  caller,
  current,
  historical,
  loadCurrent,
  loadHistorical,
  surface,
} from "./workflow-scheduler-observation-fixture.js";
import { node, ports, snapshot } from "./workflow-scheduler-observation-ports.js";

test(`${surface}: actual scheduled-phase caller retains summary and paused error`, async () => {
  for (const blocked of [false, true]) {
    const p = ports(
      snapshot(
        blocked
          ? [
              node("a", { phase: "execute", dependsOn: ["outside"] }),
              node("outside", { phase: "other" }),
            ]
          : [],
      ),
    );
    const trace: string[] = [],
      artifacts: string[] = [],
      definition = {
        phase: "execute",
        title: "Owned phase",
        description: "Owned objective",
        behavior: "scheduled_graph" as const,
      };
    const ctx = {
      definition: { kind: "expert" },
      createActivityId: p.deps.createActivityId,
      now: p.deps.now,
      agentRunner: {
        run() {
          assert.fail("no node/planner launch in caller case");
        },
      },
      store: {
        ...p.deps,
        writeArtifact(_run: string, path: string, content: string) {
          artifacts.push(content);
          trace.push(`artifact:${path}`);
          return Promise.resolve({ path, relativePath: path });
        },
      },
      timestamp: () => "owned-phase-time",
      updatePhase(value: WorkflowRunSnapshot, phase: string, patch: Record<string, unknown>) {
        trace.push(`phase:${patch.status}`);
        return { ...value, phases: [{ phase, ...patch }] };
      },
      appendEvent(_run: string, type: string) {
        trace.push(`event:${type}`);
        return Promise.resolve();
      },
      addArtifact(value: WorkflowRunSnapshot, artifact: WorkflowRunSnapshot["artifacts"][number]) {
        return { ...value, artifacts: [...value.artifacts, artifact] };
      },
      appendGraphStatus() {
        trace.push("graph:completed");
        return Promise.resolve();
      },
    };
    const run = caller.runScheduledPhase(ctx as any, p.options.snapshot, definition, {
      abortSignal: p.controller.signal,
      cwd: "owned-cwd",
      task: p.options.snapshot.task,
    });
    if (blocked) {
      await assert.rejects(run, { message: "Workflow execute scheduler paused: deadlock" });
      assert.deepEqual(trace, ["phase:active", "event:phase_started"]);
      assert.equal(artifacts.length, 0);
    } else {
      const result = await run;
      assert.deepEqual(trace, [
        "phase:active",
        "event:phase_started",
        "artifact:artifacts/execute.md",
        "phase:completed",
        "graph:completed",
        "event:artifact_written",
        "event:phase_completed",
      ]);
      assert.equal(
        artifacts[0],
        "# execute Scheduler Summary\n\nRun: owned-run\nStatus: running\nUpdated: seed\n\n## Nodes\n\n- No scheduled nodes.\n\n## Activities\n\n- No activities.\n",
      );
      assert.equal(result.phases[0]?.status, "completed");
      assert.equal(result.artifacts[0]?.path, "artifacts/execute.md");
    }
  }
});

test(`${surface}: current owner/caller and exact historical loader remain distinct and fail closed`, async () => {
  assert.equal(current.WorkflowGraphScheduler, actual.WorkflowGraphScheduler);
  assert.notEqual(current.WorkflowGraphScheduler, historical.WorkflowGraphScheduler);
  assert.equal(archive.commit, "e972ca88b458787d59b31b914a73f32d0297f567");
  await assert.rejects(loadHistorical(async () => "wrong oracle"));
  const missing = new Error("Owned missing artifact");
  await assert.rejects(
    loadHistorical(async () => {
      throw missing;
    }),
    (e) => e === missing,
  );
  const { readFile } = await import("node:fs/promises");
  for (const name of [
    "src/workflow/scheduler.ts",
    "dist/workflow/scheduler.js",
    "dist/workflow/scheduler.d.ts",
    "src/workflow/expert/scheduled-phase.ts",
    "dist/workflow/expert/scheduled-phase.js",
    "dist/workflow/expert/scheduled-phase.d.ts",
  ]) {
    await assert.rejects(
      loadCurrent((url) =>
        url.pathname.endsWith(name) ? Promise.resolve("wrong artifact") : readFile(url, "utf8"),
      ),
    );
    await assert.rejects(
      loadCurrent((url) => {
        if (url.pathname.endsWith(name)) throw missing;
        return readFile(url, "utf8");
      }),
      (e) => e === missing,
    );
  }
});
