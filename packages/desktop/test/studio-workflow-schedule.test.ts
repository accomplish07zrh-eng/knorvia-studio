import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * 强制租约到期用的虚拟推进量。租约时长定义在
 * packages/services/src/studio-runtime/adapters/studioDatabase.ts（LEASE_MS，当前 8s），
 * 这里故意不硬编码该常量：用远超值表达“租约一定已到期”，避免实现常量调整后本测试失效。
 */
const LEASE_EXPIRY_ADVANCE_MS = 24 * 60 * 60 * 1000;
/** 每轮 tick 推进的虚拟时间。因为 tick 每轮都会续租，推进不会误触发租约到期。 */
const CLOCK_STEP_MS = 250;
/** 驱动轮数上限：有界，超限抛出诊断，绝不无界等待。 */
const MAX_TICK_ROUNDS = 60;

/**
 * StudioClock 的可控实现：now/id 完全由测试决定，delay 只在 advance() 时兑现。
 * 依据 specs/knorvia-test-stability.md R4：调度时序必须由可注入时钟驱动，
 * 固定 sleep 只是“等状态推进”的近似，机器越忙越不可靠。
 *
 * label 用于跨实例隔离 id：多个 runtime 共用同一个 sqlite 文件，
 * 若每个实例的 id 都从 1 重新计数，运行/回合 id 会互相覆盖，
 * 让“重启后重放”场景出现假通过（节点被误判为已执行）。前缀保持确定性，不用随机数。
 */
function createVirtualClock(label: string, start = 1_700_000_000_000) {
  let current = start;
  let sequence = 0;
  const waiters: Array<{ due: number; resolve: () => void }> = [];
  const flush = () => {
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index]!;
      if (waiter.due > current) continue;
      waiters.splice(index, 1);
      waiter.resolve();
    }
  };
  return {
    now: () => current,
    id: () => `${label}-${++sequence}`,
    delay: (milliseconds: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason ?? new Error("aborted"));
          return;
        }
        if (milliseconds <= 0) {
          resolve();
          return;
        }
        const waiter = { due: current + milliseconds, resolve };
        waiters.push(waiter);
        signal?.addEventListener(
          "abort",
          () => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(signal.reason ?? new Error("aborted"));
          },
          { once: true },
        );
      }),
    /** 显式推进虚拟时间：只有这里能让时间前进。 */
    advance(milliseconds: number) {
      current += milliseconds;
      flush();
    },
    pendingDelays: () => waiters.length,
  };
}
type VirtualClock = ReturnType<typeof createVirtualClock>;

/** 让出事件循环，排空 tick() 触发的异步执行链；不消耗真实时间，因此不受机器负载影响。 */
async function settle() {
  for (let round = 0; round < 4; round++)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

/** 有界推进事件循环直到条件成立；不读时钟、不等待真实时间。 */
async function settleUntil(check: () => boolean, description: string, rounds = 50) {
  for (let round = 0; round < rounds; round++) {
    await settle();
    if (check()) return;
  }
  throw new Error(`事件循环推进 ${rounds} 轮后仍未满足条件：${description}`);
}

/**
 * 用虚拟时钟驱动调度：每轮 tick() → 检查 → 推进虚拟时间 → 让出事件循环。
 * 状态推进由 tick 与虚拟时间决定，不再依赖固定 sleep。
 */
async function tickUntil(
  clock: VirtualClock,
  service: { tick(): void },
  check: () => boolean,
  description: string,
) {
  for (let round = 0; round < MAX_TICK_ROUNDS; round++) {
    service.tick();
    if (check()) return round;
    clock.advance(CLOCK_STEP_MS);
    await settle();
  }
  throw new Error(
    `调度在 ${MAX_TICK_ROUNDS} 轮（虚拟时间 +${
      MAX_TICK_ROUNDS * CLOCK_STEP_MS
    }ms）内未满足条件：${description}；仍挂在虚拟延时上的等待数=${clock.pendingDelays()}`,
  );
}

/**
 * 有界真实时间逃生口（规格 S06）：StudioScheduleOutcomeObserver 内部有硬编码的 30s setInterval，
 * 其结果投递不经过 StudioClock、无法虚拟化，因此仅观察者用例允许有界真实等待。
 * 上限 2000ms，超时给出诊断；不存在无界等待。
 */
async function untilRealDelivery(check: () => boolean, description: string) {
  const deadline = Date.now() + 2000;
  for (;;) {
    if (check()) return;
    if (Date.now() > deadline) throw new Error(`真实时间上限 2000ms 内未满足条件：${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
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

/** 同一测试内每个 runtime 实例的确定性唯一前缀。 */
let runtimeSequence = 0;

/**
 * 构造注入了可控时钟的运行时。
 * hold=true 时内核执行被测试显式释放，用于确定性地覆盖“运行中取消/租约到期”场景。
 */
function runtime(path: string, options: { called?: () => void; hold?: boolean } = {}) {
  const db = new StudioDatabase(join(path, "studio.sqlite"));
  const clock = createVirtualClock(`rt${++runtimeSequence}`);
  let releaseHold: (() => void) | undefined;
  const held = options.hold
    ? new Promise<void>((resolve) => {
        releaseHold = resolve;
      })
    : undefined;
  const service = new StudioRuntimeService({
    db,
    clock,
    kernels: {
      adapter: () => ({
        run: async () => {
          options.called?.();
          if (held) await held;
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
  return { db, service, clock, release: () => releaseHold?.() };
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
  const first = runtime(dir, {
    called: () => {
      calls++;
    },
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
    await tickUntil(
      first.clock,
      first.service,
      () => first.db.read<StudioRun>("run", firstRunId)?.state === "succeeded",
      "首次计划运行完成",
    );
    assert.equal(calls, 1);
    await first.service.disposeAllAndWait();

    const reopened = runtime(dir, {
      called: () => {
        calls++;
      },
    });
    try {
      // 重复触发：同一个 runId 必须幂等复用同一条运行，且不重复执行已完成的节点。
      const duplicate = await submitScheduledStudioWorkflow({
        service: reopened.service,
        automation,
        runId: "automation-run-1",
        workspacePath: project,
        prompt: automation.prompt,
      });
      assert.equal(duplicate, firstRunId);
      reopened.service.tick();
      await settle();
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
      const resumed = runtime(dir, {
        called: () => {
          calls++;
        },
      });
      try {
        await tickUntil(
          resumed.clock,
          resumed.service,
          () => resumed.db.read<StudioRun>("run", queuedRunId)?.state === "succeeded",
          "重启后队列运行完成",
        );
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

test("lease due-time from the injected clock decides whether a run is requeued or interrupted", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-scheduled-lease-"));
  const project = join(dir, "project");
  const repo = new AutomationRepo(join(dir, "tasks.sqlite"));
  t.after(async () => {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  const automation = await new AutomationService(repo).create({
    title: "Lease review",
    cronExpr: "0 9 * * *",
    prompt: "Check project",
    recurring: true,
    workspacePath: project,
    studioWorkflowId: "workflow-1",
  });
  let calls = 0;
  // 内核受控挂起：执行中保留一条 running 的 turn，使租约到期后的恢复判定为“结果不确定”。
  const box = runtime(dir, {
    hold: true,
    called: () => {
      calls++;
    },
  });
  const runs = () => box.db.list<StudioRun>("run");
  try {
    await box.service.command({
      commandId: "save",
      type: "save-workflow",
      workflow: workflow(project),
    });
    const runId = await submitScheduledStudioWorkflow({
      service: box.service,
      automation,
      runId: "automation-run-lease",
      workspacePath: project,
      prompt: automation.prompt,
    });
    box.service.tick();
    assert.equal(box.db.read<StudioRun>("run", runId)?.state, "running");
    await settleUntil(() => calls === 1, "受控内核被调用，且 running turn 已落库");

    // 租约仍然有效时 tick() 只是续租：运行不得被判为中断。
    box.service.tick();
    await settle();
    assert.equal(box.db.read<StudioRun>("run", runId)?.state, "running");
    assert.equal(calls, 1);

    // 虚拟时间推过租约时长（实现常量为 LEASE_MS，此处用远超值避免耦合）：
    // tick() 重新获取租约并恢复，运行中的 turn 结果不确定 -> interrupted。
    box.clock.advance(LEASE_EXPIRY_ADVANCE_MS);
    box.service.tick();
    await settle();
    const interrupted = box.db.read<StudioRun>("run", runId);
    assert.equal(interrupted?.state, "interrupted");
    assert.equal(interrupted?.resultKnown, false);
    assert.match(interrupted?.error ?? "", /结果不确定/);
    // 不确定的运行不得被静默重新排队重放。
    assert.equal(box.db.queuedRuns().length, 0);

    // 迟到的内核结果不得覆盖已完成的不确定结论。
    box.release();
    await settle();
    assert.equal(box.db.read<StudioRun>("run", runId)?.state, "interrupted");
    box.service.tick();
    await settle();
    assert.equal(calls, 1, "不确定的运行不会自动重放");
    assert.equal(runs().length, 1);
  } finally {
    box.release();
    await box.service.disposeAllAndWait().catch(() => {});
  }
});

test("cancelling a running scheduled workflow is driven by the injected clock", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-scheduled-cancel-"));
  const project = join(dir, "project");
  const repo = new AutomationRepo(join(dir, "tasks.sqlite"));
  t.after(async () => {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  const automation = await new AutomationService(repo).create({
    title: "Cancel review",
    cronExpr: "0 9 * * *",
    prompt: "Check project",
    recurring: true,
    workspacePath: project,
    studioWorkflowId: "workflow-1",
  });
  let calls = 0;
  const box = runtime(dir, {
    hold: true,
    called: () => {
      calls++;
    },
  });
  try {
    await box.service.command({
      commandId: "save",
      type: "save-workflow",
      workflow: workflow(project),
    });
    const runId = await submitScheduledStudioWorkflow({
      service: box.service,
      automation,
      runId: "automation-run-cancel",
      workspacePath: project,
      prompt: automation.prompt,
    });
    box.service.tick();
    await settleUntil(() => calls === 1, "取消场景中内核已开始执行");

    // 取消命令写入 cancelRequested，并由 tick() 触发中止；状态推进完全由注入时钟与 tick 决定。
    assert.equal(
      (await box.service.command({ commandId: `cancel:${runId}`, type: "cancel", runId })).id,
      runId,
    );
    box.service.tick();
    await settle();
    assert.equal(box.db.read<StudioRun>("run", runId)?.cancelRequested, true);

    // 内核即使最终返回成功，也不得覆盖用户取消的终态。
    box.release();
    await settle();
    const cancelled = box.db.read<StudioRun>("run", runId);
    assert.equal(cancelled?.state, "cancelled");
    assert.equal(calls, 1);
  } finally {
    box.release();
    await box.service.disposeAllAndWait().catch(() => {});
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
    // 观察者的投递不经过 StudioClock（S06），只能使用有界真实时间逃生口。
    await untilRealDelivery(
      () => recorded === "interrupted" && released === 1,
      "观察者记录 interrupted 终态并释放人工占用",
    );
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
  // 这是“证明否定”的有界等待：必须给已销毁的观察者一次真正写入的机会，再断言它没有写。
  // 上限 50ms；观察者的投递不经过可注入时钟（S06），无法用虚拟时间表达。
  await new Promise((resolve) => setTimeout(resolve, 50));
  await settle();
  assert.equal(writes, 0);
});
