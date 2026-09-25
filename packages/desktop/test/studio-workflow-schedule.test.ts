import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import { Event } from "@knorvia/rpc";
import type { IStudioRuntimeService, StudioRun, StudioWorkflowDefinition } from "@knorvia/services";
import { AutomationRepo } from "../../services/src/session/automationRepo.js";
import { AutomationService } from "../../services/src/session/automationService.js";
import { StudioDatabase } from "../../services/src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../../services/src/studio-runtime/app/studioRuntimeService.js";
import {
  StudioScheduleOutcomeObserver,
  type StudioScheduledRun,
} from "../src/host/studioScheduleOutcome.js";
import { submitScheduledStudioWorkflow } from "../src/host/studioWorkflowSchedule.js";

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for Studio workflow");
    await sleep(10);
  }
}

function workflow(path: string): StudioWorkflowDefinition {
  const data = {
    label: "",
    kernel: "codex" as const,
    prompt: "",
    condition: "",
    retryCount: 0,
    retryDelay: 0,
    joinPolicy: "all" as const,
  };
  return {
    id: "workflow-1",
    name: "Offline review",
    workspacePath: path,
    updatedAt: Date.now(),
    nodes: [
      { id: "start", data: { ...data, kind: "start" }, position: { x: 0, y: 0 } },
      {
        id: "agent",
        data: { ...data, kind: "agent", prompt: "Review {{input}}" },
        position: { x: 100, y: 0 },
      },
      { id: "end", data: { ...data, kind: "end" }, position: { x: 200, y: 0 } },
    ],
    edges: [
      { id: "a", source: "start", target: "agent" },
      { id: "b", source: "agent", target: "end" },
    ],
  };
}

function runtime(path: string, called: () => void) {
  const db = new StudioDatabase(join(path, "studio.sqlite"));
  const service = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async () => {
          called();
          return { status: "succeeded", text: "local result", resultKnown: true };
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: {
      prepare: async ({ sourcePath }) => sourcePath,
      changes: async () => [],
      apply: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  return { db, service };
}

test("scheduled workflow uses the saved definition and a restart does not replay completed nodes", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-scheduled-workflow-"));
  const project = join(dir, "project");
  const repo = new AutomationRepo(join(dir, "tasks.sqlite"));
  t.after(async () => {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  const automation = await new AutomationService(repo).create({
    title: "Daily review",
    cronExpr: "0 9 * * *",
    prompt: "Check project",
    recurring: true,
    workspacePath: project,
    studioWorkflowId: "workflow-1",
  });
  let calls = 0;
  const first = runtime(dir, () => {
    calls++;
  });
  try {
    await first.service.command({
      commandId: "save",
      type: "save-workflow",
      workflow: workflow(project),
    });
    const firstRunId = await submitScheduledStudioWorkflow({
      service: first.service,
      automation,
      runId: "automation-run-1",
      workspacePath: project,
      prompt: automation.prompt,
    });
    await until(() => {
      first.service.tick();
      return first.db.read<StudioRun>("run", firstRunId)?.state === "succeeded";
    });
    assert.equal(calls, 1);
    await first.service.disposeAllAndWait();

    const reopened = runtime(dir, () => {
      calls++;
    });
    try {
      const duplicate = await submitScheduledStudioWorkflow({
        service: reopened.service,
        automation,
        runId: "automation-run-1",
        workspacePath: project,
        prompt: automation.prompt,
      });
      assert.equal(duplicate, firstRunId);
      reopened.service.tick();
      await sleep(40);
      assert.equal(calls, 1);
      assert.equal((await reopened.service.timeline("workflow-1")).runs.length, 1);
      await assert.rejects(
        submitScheduledStudioWorkflow({
          service: reopened.service,
          automation,
          runId: "automation-run-2",
          workspacePath: join(dir, "other"),
          prompt: automation.prompt,
        }),
        /目标项目已改变/,
      );
      await assert.rejects(
        submitScheduledStudioWorkflow({
          service: reopened.service,
          automation: { ...automation, studioWorkflowId: "deleted" },
          runId: "automation-run-2",
          workspacePath: project,
          prompt: automation.prompt,
        }),
        /已不存在/,
      );
      let invalidGraphCommands = 0;
      const invalidGraph = {
        overview: async () => ({ workflows: [{ ...workflow(project), nodes: [] }] }),
        command: async () => {
          invalidGraphCommands++;
          return { id: "unexpected", revision: 1 };
        },
      } as unknown as Pick<IStudioRuntimeService, "overview" | "command">;
      await assert.rejects(
        submitScheduledStudioWorkflow({
          service: invalidGraph,
          automation,
          runId: "automation-run-2",
          workspacePath: project,
          prompt: automation.prompt,
        }),
        /尚不能运行/,
      );
      assert.equal(invalidGraphCommands, 0);
      const queuedRunId = await submitScheduledStudioWorkflow({
        service: reopened.service,
        automation,
        runId: "automation-run-2",
        workspacePath: project,
        prompt: automation.prompt,
      });
      assert.equal(reopened.db.read<StudioRun>("run", queuedRunId)?.state, "queued");
      await reopened.service.disposeAllAndWait();
      const resumed = runtime(dir, () => {
        calls++;
      });
      try {
        await until(() => {
          resumed.service.tick();
          return resumed.db.read<StudioRun>("run", queuedRunId)?.state === "succeeded";
        });
        assert.equal(calls, 2, "the queued run executes once after restart");
        assert.equal((await resumed.service.timeline("workflow-1")).runs.length, 2);
      } finally {
        await resumed.service.disposeAllAndWait();
      }
    } finally {
      await reopened.service.disposeAllAndWait();
    }
  } finally {
    await first.service.disposeAllAndWait().catch(() => {});
  }
});

test("result observer restores manual claim and records terminal outcomes after restart", async () => {
  const item: StudioScheduledRun = {
    automationRunId: "automation-1:manual:1",
    automationId: "automation-1",
    workspaceKey: "project",
    scheduledAt: null,
    trigger: "manual",
    studioRunId: "studio-1",
    workflowId: "workflow-1",
  };
  const listeners = new Set<() => void>();
  let state: StudioRun["state"] = "running";
  let recorded: string | undefined;
  let released = 0;
  const service = {
    timeline: async () => ({ runs: [{ id: item.studioRunId, state }] }),
    onDidChange: (listener: () => void) => {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
  } as unknown as Pick<IStudioRuntimeService, "timeline" | "onDidChange">;
  const repo = {
    listUnsettledStudioWorkflowRuns: async () => (recorded ? [] : [item]),
    ensureRunClaimed: async () => {},
    markRunDispatch: async () => {},
    markRunOutcome: async (_id: string, outcome: string) => {
      recorded = outcome;
    },
    touchManualClaim: async () => {},
    releaseManualClaim: async () => {
      released++;
    },
  };
  const errors: unknown[] = [];
  const observer = new StudioScheduleOutcomeObserver(service, repo, (_message, error) =>
    errors.push(error),
  );
  try {
    await observer.recover();
    assert.equal(recorded, undefined);
    state = "interrupted";
    for (const listener of listeners) listener();
    await until(() => recorded === "interrupted" && released === 1);
    assert.equal(listeners.size, 0);
    await observer.recover();
    assert.equal(released, 1);
    assert.deepEqual(errors, []);
  } finally {
    observer.dispose();
  }
});

test("disposed result observer cannot write a late terminal result", async () => {
  let finishTimeline!: (value: { runs: Array<{ id: string; state: "succeeded" }> }) => void;
  const pending = new Promise<{ runs: Array<{ id: string; state: "succeeded" }> }>((resolve) => {
    finishTimeline = resolve;
  });
  let writes = 0;
  const service = {
    timeline: async () => pending,
    onDidChange: () => ({ dispose() {} }),
  } as unknown as Pick<IStudioRuntimeService, "timeline" | "onDidChange">;
  const repo = {
    listUnsettledStudioWorkflowRuns: async () => [],
    ensureRunClaimed: async () => {},
    markRunDispatch: async () => {},
    markRunOutcome: async () => {
      writes++;
    },
    touchManualClaim: async () => {},
    releaseManualClaim: async () => {},
  };
  const observer = new StudioScheduleOutcomeObserver(service, repo, () => {});
  observer.observe({
    automationRunId: "run",
    automationId: "automation",
    workspaceKey: "project",
    scheduledAt: 1000,
    trigger: "schedule",
    studioRunId: "studio",
    workflowId: "workflow",
  });
  observer.dispose();
  finishTimeline({ runs: [{ id: "studio", state: "succeeded" }] });
  await sleep(10);
  assert.equal(writes, 0);
});
