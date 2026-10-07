import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import {
  recordStudioAgentEvent,
  receiveStudioAgentEvents,
} from "../src/studio-runtime/app/agentOutbox.js";
import { studioAgentPolicy } from "../src/studio-runtime/domain/agentToolPolicy.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioAgentTask, StudioAgentEvent } from "../src/studio-runtime/agentToolTypes.js";
import { fixture, until } from "./studio-agent-tools.fixture.js";

const policy = studioAgentPolicy({ retryMs: 100, deliveryAttempts: 2 });
test("duplicate terminal events, lost ACK and real SQLite reopen retain immutable refs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-outbox-"));
  const path = join(dir, "runtime.sqlite");
  let now = 1000;
  const clock = { id: randomUUID, now: () => now, delay: async () => {} };
  let db = new StudioDatabase(path);
  const run: StoredRun = {
    id: "child-run",
    kind: "chat",
    targetId: "child",
    state: "succeeded",
    input: "task",
    createdAt: 1,
    updatedAt: 2,
    attempt: 1,
    resultKnown: true,
    checkpoint: {
      steps: { reply: { status: "succeeded", text: "preview", resultKnown: true } },
      values: {},
      completedRounds: 0,
    },
  };
  const task: StudioAgentTask = {
    id: "child-task",
    runId: run.id,
    parentRunId: "parent",
    parentCallerId: "parent-caller",
    parentAttempt: 1,
    rootRunId: "parent",
    targetId: "child",
    kernel: "codex",
    permission: "ask",
    depth: 1,
    rounds: 1,
    createdAt: 1,
    workspace: {
      runId: "workspace-child",
      stepId: "reply",
      path: "/synthetic/child",
      sourcePath: "/synthetic",
    },
  };
  try {
    db.transaction(() => {
      db.write("run", run.id, run, run.targetId);
      db.write("agent-task", task.id, task, "parent");
      db.write("agent-run-link", run.id, { taskId: task.id, deadlineAt: 5000 }, task.id);
      db.write(
        "step-result",
        `${run.id}:reply`,
        { status: "succeeded", text: "full ".repeat(3000), resultKnown: true },
        run.id,
      );
      recordStudioAgentEvent(db, clock, run);
      recordStudioAgentEvent(db, clock, run);
    });
    const event = receiveStudioAgentEvents(db, clock, "parent-caller", policy)[0]!;
    assert.equal(db.list("agent-result").length, 1);
    assert.equal(event.deliveries, 1);
    db.close();
    db = new StudioDatabase(path);
    now = 1101;
    const replay = receiveStudioAgentEvents(db, clock, "parent-caller", policy)[0]!;
    assert.equal(replay.id, event.id);
    assert.deepEqual(replay.resultRef, event.resultRef);
    now = 1202;
    assert.deepEqual(receiveStudioAgentEvents(db, clock, "parent-caller", policy), []);
    assert.equal(db.read<StudioAgentEvent>("agent-event", event.id)?.delivery, "exhausted");
    db.transaction(() => {
      const newer = { ...run, attempt: 2, state: "failed" as const, error: "second attempt" };
      db.write("run", run.id, newer, run.targetId);
      recordStudioAgentEvent(db, clock, newer);
      recordStudioAgentEvent(db, clock, { ...run, error: "stale" });
    });
    assert.equal(db.list("agent-event").length, 2);
    assert.deepEqual(db.read("agent-result", event.resultRef.id), event.resultRef);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("late native attempt events/results cannot reset newer results under the same lease", async () => {
  let release!: () => void;
  const f = await fixture({
    async run(_turn, sink) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await sink.emit({ type: "text", text: "stale response" });
      await sink.emit({ type: "session", sessionId: "stale-session" });
      return {
        status: "succeeded",
        text: "stale response",
        nativeSessionId: "stale-session",
        resultKnown: true,
      };
    },
  });
  try {
    const child = (await f.tools.call("dispatch_task", {
      commandId: "late",
      kernel: "codex",
      task: "work",
      context: "fake project",
    })) as { runId: string };
    f.service.tick();
    await until(() => Boolean(release));
    f.db.transaction(() => {
      const run = f.db.read<StoredRun>("run", child.runId)!;
      f.db.write(
        "run",
        run.id,
        {
          ...run,
          attempt: 2,
          checkpoint: {
            ...run.checkpoint,
            steps: { reply: { status: "succeeded", text: "new", resultKnown: true } },
          },
        },
        run.targetId,
      );
      f.db.write(
        "step-result",
        `${run.id}:reply`,
        { status: "succeeded", text: "new", resultKnown: true },
        run.id,
      );
    });
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(f.db.read<{ text: string }>("step-result", `${child.runId}:reply`)?.text, "new");
    assert.equal(f.db.read<StoredRun>("run", child.runId)?.attempt, 2);
    assert.equal(f.db.list("session").length, 0);
    assert.equal(f.db.list("agent-event").length, 0);
    assert.equal(
      f.db.list<{ text: string }>("message").some((item) => item.text.includes("stale response")),
      false,
    );
    await assert.rejects(f.children[0]!.tools.call("list_kernels", {}), /调用方/);
  } finally {
    release?.();
    await f.close();
  }
});

test("sent receipts after an uncertain preparation restart never duplicate dispatch", async () => {
  const f = await fixture();
  try {
    const { canonicalStudioValue } = await import("../src/studio-runtime/domain/canonicalValue.js");
    const input = {
      commandId: "lost-admission",
      kernel: "codex",
      task: "work",
      context: "project",
    };
    const key = `${f.caller.conversationId}:${input.commandId}`;
    f.db.transaction(() =>
      f.db.write(
        "agent-operation",
        key,
        {
          payload: canonicalStudioValue({ tool: "dispatch_task", input }),
          result: { state: "sent", needsUserPolicy: true },
        },
        f.parent.id,
      ),
    );
    assert.deepEqual(await f.tools.call("dispatch_task", input), {
      state: "sent",
      needsUserPolicy: true,
    });
    assert.equal(f.db.list("agent-task").length, 0);
    assert.equal(f.paths.length, 0);
  } finally {
    await f.close();
  }
});

test("busy reuse queues within the fanout budget and cancellation stays unconfirmed until all runs settle", async () => {
  const f = await fixture(
    {
      async run(_turn, _sink, signal) {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        return { status: "interrupted", text: "", resultKnown: false };
      },
    },
    { policy: { maxActive: 1, maxRounds: 2 } },
  );
  try {
    const input = { commandId: "busy", kernel: "codex", task: "work", context: "project" };
    const child = (await f.tools.call("dispatch_task", input)) as { taskId: string; runId: string };
    f.service.tick();
    await until(() => f.children.length === 1);
    const queued = (await f.tools.call("message_task", {
      commandId: "busy-followup",
      taskId: child.taskId,
      task: "more",
      context: "same",
    })) as { runId: string };
    assert.equal(f.db.read<StoredRun>("run", queued.runId)?.state, "queued");
    const cancelled = (await f.tools.call("cancel_task", {
      commandId: "stop-all",
      taskId: child.taskId,
    })) as { state: string };
    assert.equal(cancelled.state, "cancel-unconfirmed");
    assert.equal(f.db.read<StoredRun>("run", queued.runId)?.state, "cancelled");
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", child.runId)?.state === "interrupted");
    assert.equal(
      ((await f.tools.call("get_task", { taskId: child.taskId })) as { state: string }).state,
      "cancel-unconfirmed",
    );
  } finally {
    await f.close();
  }
});

test("user-approved parent continuation preserves durable ownership, command dedupe and old ACKs", async () => {
  const f = await fixture();
  try {
    const input = { commandId: "durable", kernel: "codex", task: "work", context: "project" };
    const first = (await f.tools.call("dispatch_task", input)) as { taskId: string; runId: string };
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", first.runId)?.state === "succeeded");
    const delivered = (await f.tools.call("get_events", {})) as StudioAgentEvent[];
    const caller = { ...f.caller, turnId: "continued-turn" };
    f.db.transaction(() => {
      const parent = f.db.read<StoredRun>("run", f.parent.id)!;
      f.db.write("run", parent.id, { ...parent, attempt: 2 }, parent.targetId);
      f.db.write(
        "turn",
        caller.turnId,
        {
          runId: parent.id,
          attempt: 2,
          state: "running",
          kernel: caller.kernel,
          permission: caller.permission,
          workspacePath: caller.workspacePath,
          conversationId: caller.conversationId,
        },
        parent.id,
      );
    });
    const continued = f.service.agentTools(caller, f.sink, new AbortController().signal);
    await assert.rejects(f.tools.call("list_kernels", {}), /调用方/);
    assert.deepEqual(await continued.call("dispatch_task", input), first);
    assert.equal(f.db.list("agent-task").length, 1);
    await continued.call("ack_event", { eventId: delivered[0]!.id });
    assert.deepEqual(await continued.call("get_events", {}), []);
    assert.equal(
      ((await continued.call("get_task", { taskId: first.taskId })) as { state: string }).state,
      "completed",
    );
  } finally {
    await f.close();
  }
});

test("two members of the same parent run cannot use each other's child ownership", async () => {
  const f = await fixture();
  try {
    const child = (await f.tools.call("dispatch_task", {
      commandId: "member",
      kernel: "codex",
      task: "work",
      context: "project",
    })) as { taskId: string };
    const sibling = {
      ...f.caller,
      turnId: "sibling-turn",
      conversationId: "group:synthetic:other-member",
    };
    f.db.transaction(() =>
      f.db.write(
        "turn",
        sibling.turnId,
        {
          runId: f.parent.id,
          attempt: 1,
          state: "running",
          kernel: sibling.kernel,
          permission: sibling.permission,
          workspacePath: sibling.workspacePath,
          conversationId: sibling.conversationId,
        },
        f.parent.id,
      ),
    );
    const tools = f.service.agentTools(sibling, f.sink, new AbortController().signal);
    await assert.rejects(tools.call("get_task", { taskId: child.taskId }), /所属/);
    await assert.rejects(
      tools.call("message_task", {
        commandId: "sibling-message",
        taskId: child.taskId,
        task: "modify",
        context: "no authority",
      }),
      /所属/,
    );
    assert.deepEqual(await tools.call("get_events", {}), []);
  } finally {
    await f.close();
  }
});

test("a later turn of the same parent conversation can retrieve, ACK and reuse its completed child", async () => {
  const f = await fixture();
  try {
    const input = { commandId: "reuse-later", kernel: "codex", task: "work", context: "project" };
    const original = (await f.tools.call("dispatch_task", input)) as {
      taskId: string;
      runId: string;
    };
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", original.runId)?.state === "succeeded");
    const events = (await f.tools.call("get_events", {})) as StudioAgentEvent[];
    f.completeParent();
    await until(() => f.db.read<StoredRun>("run", f.parent.id)?.state === "succeeded");
    const later = await f.service.command({
      commandId: "later-parent",
      type: "send",
      kind: "chat",
      targetId: "parent",
      text: "continue previous child",
    });
    f.service.tick();
    await until(() => f.caller.runId === later.id);
    assert.deepEqual(await f.tools.call("dispatch_task", input), original);
    assert.equal(
      (
        (await f.tools.call("get_result", {
          taskId: original.taskId,
          resultId: events[0]!.resultRef.id,
        })) as { runId: string }
      ).runId,
      original.runId,
    );
    await f.tools.call("ack_event", { eventId: events[0]!.id });
    const followup = (await f.tools.call("message_task", {
      commandId: "later-child",
      taskId: original.taskId,
      task: "extend",
      context: "same workspace",
    })) as { runId: string };
    assert.notEqual(followup.runId, original.runId);
    assert.equal(f.paths.length, 1);
  } finally {
    await f.close();
  }
});
