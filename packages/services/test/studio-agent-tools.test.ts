import assert from "node:assert/strict";
import test from "node:test";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type {
  StudioAgentEvent,
  StudioAgentFullResult,
} from "../src/studio-runtime/agentToolTypes.js";
import { fixture, until } from "./studio-agent-tools.fixture.js";

const dispatch = {
  commandId: "child-one",
  kernel: "codex",
  task: "write a report",
  context: "synthetic project",
  model: "child-model",
};

test("duplicate/concurrent dispatch uses one isolated owned conversation, full results and ACK replay", async () => {
  const f = await fixture();
  try {
    const [first, duplicate] = (await Promise.all([
      f.tools.call("dispatch_task", dispatch),
      f.tools.call("dispatch_task", dispatch),
    ])) as Array<{ taskId: string; runId: string }>;
    assert.deepEqual(first, duplicate);
    assert.equal(f.paths.length, 1);
    await assert.rejects(
      f.tools.call("dispatch_task", { ...dispatch, task: "different" }),
      /请求编号/,
    );
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", first!.runId)?.state === "succeeded");
    const events = (await f.tools.call("get_events", {})) as StudioAgentEvent[];
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, "completed");
    const result = (await f.tools.call("get_result", {
      taskId: first!.taskId,
      resultId: events[0]!.resultRef.id,
    })) as StudioAgentFullResult;
    assert.equal(result.results[0]!.result.text.length, 18000);
    assert.equal(result.workspaces[0]!.path, f.paths[0]);
    assert.deepEqual(await f.tools.call("get_events", {}), []);
    f.now(1101);
    f.service.tick();
    const replay = (await f.tools.call("get_events", {})) as StudioAgentEvent[];
    assert.equal(replay[0]!.id, events[0]!.id);
    await f.tools.call("ack_event", { eventId: events[0]!.id });
    await f.tools.call("ack_event", { eventId: events[0]!.id });
    assert.deepEqual(await f.tools.call("get_events", {}), []);
    const second = (await f.tools.call("message_task", {
      commandId: "message-one",
      taskId: first!.taskId,
      task: "extend",
      context: "same project",
    })) as { runId: string };
    assert.equal(f.paths.length, 1);
    assert.notEqual(second.runId, first!.runId);
  } finally {
    await f.close();
  }
});

test("caller, schemas, provider options, real read-only support and permission ceilings fail closed", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.tools.call("dispatch_task", { ...dispatch, config: { permission: "full-access" } }),
    );
    await assert.rejects(
      f.tools.call("dispatch_task", { ...dispatch, model: "other-provider/model" }),
      /模型/,
    );
    await assert.rejects(
      f.tools.call("dispatch_task", {
        ...dispatch,
        commandId: "bad-reason",
        reasoningEffort: "unconfigured",
      }),
      /思考/,
    );
    await assert.rejects(f.tools.call("get_task", { taskId: "unowned" }), /所属/);
    await assert.rejects(f.tools.call("answer", { decision: "allow-once" }), /工具/);
    const forged = f.service.agentTools(
      { ...f.caller, permission: "full-access", turnId: "missing" },
      f.sink,
      new AbortController().signal,
    );
    await assert.rejects(forged.call("list_kernels", {}), /执行权|调用方/);
    f.db.transaction(() =>
      f.db.write("kernel-status", "codex", {
        id: "codex",
        installed: true,
        capabilities: { readOnly: false },
      }),
    );
    await assert.rejects(
      f.tools.call("dispatch_task", { ...dispatch, commandId: "review", permission: "read-only" }),
      /只读/,
    );
  } finally {
    await f.close();
  }
});

test("human gates cannot be self-approved and read-only children cannot gain write access", async () => {
  const f = await fixture(undefined, { permission: "ask" });
  try {
    const requested = f.tools.call("dispatch_task", dispatch) as Promise<{
      taskId: string;
      runId: string;
    }>;
    await until(() => f.db.list("interaction").length > 0);
    assert.equal(f.db.list("agent-task").length, 0);
    await assert.rejects(
      f.tools.call("request_permission", {
        commandId: "forged",
        title: "approve",
        detail: "approve",
        decision: "allow-once",
      }),
    );
    const question = f.db.list<{ id: string; status: string }>("interaction")[0]!;
    await assert.rejects(
      f.service.command({
        commandId: "session-approve",
        type: "answer",
        interactionId: question.id,
        answer: { decision: "allow-session" },
      }),
      /审批选项/,
    );
    await f.service.command({
      commandId: "user-approve",
      type: "answer",
      interactionId: question.id,
      answer: { decision: "allow-once" },
    });
    const accepted = await requested;
    assert.equal(f.db.read<StoredRun>("run", accepted.runId)?.kernelConfig?.permission, "ask");
    const permission = f.tools.call("request_permission", {
      commandId: "permission-request",
      title: "Need human input",
      detail: "A decision is required",
    });
    await until(() =>
      f.db.list<{ status: string }>("interaction").some((item) => item.status === "pending"),
    );
    const pending = f.db
      .list<{ id: string; status: string }>("interaction")
      .find((item) => item.status === "pending")!;
    await f.service.command({
      commandId: "deny-request",
      type: "answer",
      interactionId: pending.id,
      answer: { decision: "deny" },
    });
    assert.deepEqual(await permission, { decision: "deny", observed: true });
  } finally {
    await f.close();
  }
  const readonly = await fixture(undefined, { permission: "read-only" });
  try {
    const child = (await readonly.tools.call("dispatch_task", {
      ...dispatch,
      permission: "full-access",
    })) as { runId: string };
    assert.equal(
      readonly.db.read<StoredRun>("run", child.runId)?.kernelConfig?.permission,
      "read-only",
    );
  } finally {
    await readonly.close();
  }
});

test("all changed-file references survive long output projection and message reuse", async () => {
  let calls = 0;
  const nativeIds: Array<string | undefined> = [];
  const f = await fixture(
    {
      async run(turn, sink) {
        calls += 1;
        nativeIds.push(turn.nativeSessionId);
        await sink.emit({ type: "session", sessionId: "native-child" });
        return { status: "succeeded", text: "artifact output".repeat(2000), resultKnown: true };
      },
    },
    { artifactCount: 1205 },
  );
  try {
    const child = (await f.tools.call("dispatch_task", dispatch)) as {
      taskId: string;
      runId: string;
    };
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", child.runId)?.state === "succeeded");
    const event = ((await f.tools.call("get_events", {})) as StudioAgentEvent[])[0]!;
    const result = (await f.tools.call("get_result", {
      taskId: child.taskId,
      resultId: event.resultRef.id,
    })) as StudioAgentFullResult;
    assert.equal(result.artifacts.length, 1205);
    assert.equal(result.artifacts[1204]!.path, "reports/file-1204.txt");
    assert.equal(result.results[0]!.result.text.length, 30000);
    const page = (await f.tools.call("get_result", {
      taskId: child.taskId,
      resultId: event.resultRef.id,
      stepId: "reply",
      offset: 29900,
      length: 500,
      artifactOffset: 1200,
      artifactLimit: 100,
    })) as StudioAgentFullResult;
    assert.equal(page.results[0]!.result.text, result.results[0]!.result.text.slice(29900));
    assert.deepEqual(page.textPage, { offset: 29900, nextOffset: 30000, total: 30000, done: true });
    assert.equal(page.artifacts.length, 5);
    assert.equal(page.artifactPage?.total, 1205);
    assert.ok(f.db.read<StoredRun>("run", child.runId)!.checkpoint.steps.reply!.text.length < 2000);
    const second = (await f.tools.call("message_task", {
      commandId: "followup",
      taskId: child.taskId,
      task: "continue",
      context: "reuse this child",
    })) as { runId: string };
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", second.runId)?.state === "succeeded");
    assert.equal(calls, 2);
    assert.equal(f.paths.length, 1);
    assert.deepEqual(nativeIds, [undefined, "native-child"]);
    assert.equal(
      (
        (await f.tools.call("get_result", {
          taskId: child.taskId,
          resultId: event.resultRef.id,
        })) as StudioAgentFullResult
      ).runId,
      child.runId,
    );
  } finally {
    await f.close();
  }
});

test("needs-input emits once; child cancellation retries retain native uncertainty", async () => {
  let calls = 0;
  const f = await fixture({
    async run(_turn, sink, signal) {
      calls += 1;
      try {
        await sink.ask({ id: "gate", kind: "approval", title: "Write?" }, signal);
      } catch {}
      return { status: "interrupted", text: "", resultKnown: false };
    },
  });
  try {
    const child = (await f.tools.call("dispatch_task", dispatch)) as {
      taskId: string;
      runId: string;
    };
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", child.runId)?.state === "waiting");
    const inputEvents = (await f.tools.call("get_events", {})) as StudioAgentEvent[];
    assert.equal(inputEvents.length, 1);
    assert.equal(inputEvents[0]!.state, "needs-input");
    const cancel = { commandId: "stop-child", taskId: child.taskId };
    const receipt = await f.tools.call("cancel_task", cancel);
    assert.deepEqual(await f.tools.call("cancel_task", cancel), receipt);
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", child.runId)?.state === "interrupted");
    const status = (await f.tools.call("get_task", { taskId: child.taskId })) as { state: string };
    assert.equal(status.state, "cancel-unconfirmed");
    await f.tools.call("cancel_task", { ...cancel, commandId: "retry-cancel" });
    await assert.rejects(
      f.tools.call("resume", { taskId: child.taskId, retryUncertain: true }),
      /工具/,
    );
    assert.equal(calls, 1);
    assert.equal(f.db.list<StudioAgentEvent>("agent-event").length, 2);
  } finally {
    await f.close();
  }
});

test("caller ownership denies another parent's status, result, message, cancellation and ACK", async () => {
  const f = await fixture();
  try {
    const firstTools = f.tools;
    const child = (await firstTools.call("dispatch_task", dispatch)) as {
      taskId: string;
      runId: string;
    };
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", child.runId)?.state === "succeeded");
    const event = ((await firstTools.call("get_events", {})) as StudioAgentEvent[])[0]!;
    await f.service.command({
      commandId: "other-create",
      type: "create-conversation",
      id: "parent-other",
      kernel: "codex",
      workspacePath: f.path,
    });
    const other = await f.service.command({
      commandId: "other-send",
      type: "send",
      kind: "chat",
      targetId: "parent-other",
      text: "another caller",
    });
    f.service.tick();
    await until(() => f.caller.runId === other.id);
    for (const [tool, args] of [
      ["get_task", { taskId: child.taskId }],
      ["get_result", { taskId: child.taskId, resultId: event.resultRef.id }],
      [
        "message_task",
        { commandId: "steal-message", taskId: child.taskId, task: "steal", context: "no grant" },
      ],
      ["cancel_task", { commandId: "steal-cancel", taskId: child.taskId }],
      ["ack_event", { eventId: event.id }],
    ] as const)
      await assert.rejects(f.tools.call(tool, args), /所属/);
    assert.deepEqual(await f.tools.call("get_events", {}), []);
  } finally {
    await f.close();
  }
});

test("fanout, recursive depth, rounds and execution deadline are runtime limits", async () => {
  const f = await fixture(
    {
      async run(_turn, _sink, signal) {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        return { status: "cancelled", text: "", resultKnown: true };
      },
    },
    { policy: { maxActive: 1, maxDepth: 1, maxRounds: 1 } },
  );
  try {
    const child = (await f.tools.call("dispatch_task", dispatch)) as {
      taskId: string;
      runId: string;
    };
    await assert.rejects(
      f.tools.call("dispatch_task", { ...dispatch, commandId: "fanout" }),
      /并发/,
    );
    await assert.rejects(
      f.tools.call("message_task", {
        commandId: "rounds",
        taskId: child.taskId,
        task: "another",
        context: "same",
      }),
      /轮次/,
    );
    f.service.tick();
    await until(() => f.children.length === 1);
    await assert.rejects(
      f.children[0]!.tools.call("dispatch_task", { ...dispatch, commandId: "recursive" }),
      /深度/,
    );
    f.now(8000);
    f.service.tick();
    f.now(11001);
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", child.runId)?.state === "cancelled");
    assert.equal(
      ((await f.tools.call("get_task", { taskId: child.taskId })) as { state: string }).state,
      "cancelled",
    );
  } finally {
    await f.close();
  }
});
