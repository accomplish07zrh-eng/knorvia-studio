import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import type { StudioKernelAdapter, StudioKernelTurn } from "../src/studio-runtime/contract.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { admitStudioCommand } from "../src/studio-runtime/app/commandAdmission.js";

const root = () => mkdtempSync(join(tmpdir(), "knorvia-runtime-test-"));
const clock = {
  now: Date.now,
  id: randomUUID,
  delay: (ms: number, signal?: AbortSignal) => sleep(ms, undefined, { signal }),
};
const commandId = () => randomUUID();
function fixture(path: string, adapter: StudioKernelAdapter, now: () => number = Date.now) {
  const db = new StudioDatabase(join(path, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    clock: { ...clock, now },
    kernels: {
      adapter: () => adapter,
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
  return { service, db };
}
async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Timed out");
    await sleep(10);
  }
}
async function createChat(
  service: StudioRuntimeService,
  path: string,
  id = "chat",
  kernel: "codex" | "claude-code" = "codex",
) {
  await service.command({
    commandId: commandId(),
    type: "create-conversation",
    id,
    kernel,
    workspacePath: path,
  });
}
const success: StudioKernelAdapter = {
  run: async () => ({ status: "succeeded", text: "ok", resultKnown: true }),
};

test("external kernel credentials in output and failure are absent from Studio SQLite", async () => {
  const path = root();
  const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
  const sshPassword = "fake-ssh-password-never-persist";
  const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";
  const privateBody = "FAKE_PRIVATE_KEY_MATERIAL_NEVER_PERSIST";
  const f = fixture(path, {
    async run(_turn, sink) {
      await sink.emit({
        type: "tool",
        id: "fixture",
        name: "local-substitute",
        state: "failed",
        output: `apiKey=${secret}\nsshPassword=${sshPassword}`,
      });
      await sink.emit({
        type: "text",
        text: `Bearer ${token}\n-----BEGIN OPENSSH PRIVATE KEY-----\n${privateBody}\n-----END OPENSSH PRIVATE KEY-----`,
      });
      return {
        status: "failed",
        text: `token=${secret}`,
        error: `Authorization: Bearer ${token}`,
        resultKnown: true,
      };
    },
  });
  try {
    await createChat(f.service, path);
    const sent = await f.service.command({
      commandId: commandId(),
      type: "send",
      kind: "chat",
      targetId: "chat",
      text: "local test",
    });
    await until(() => {
      f.service.tick();
      return f.db.read<StoredRun>("run", sent.id)?.state === "failed";
    });
    const timeline = JSON.stringify(await f.service.timeline("chat"));
    for (const marker of [secret, sshPassword, token, privateBody]) {
      assert.equal(timeline.includes(marker), false, marker);
    }
    await f.service.disposeAllAndWait();
    for (const file of await readdir(path)) {
      if (!file.startsWith("runtime.sqlite")) continue;
      const persisted = await readFile(join(path, file));
      for (const marker of [secret, sshPassword, token, privateBody]) {
        assert.equal(persisted.includes(marker), false, `${file}: ${marker}`);
      }
    }
  } finally {
    await f.service.disposeAllAndWait().catch(() => {});
    await rm(path, { recursive: true, force: true });
  }
});

test("native usage survives partial updates and restart without leaking into a queued turn", async () => {
  const path = root();
  const f = fixture(path, {
    run: async (_turn, sink) => {
      const usage = {
        type: "usage" as const,
        scope: "turn" as const,
        inputTokens: 90,
        outputTokens: 10,
        cacheReadTokens: 0,
      };
      await sink.emit(usage);
      await sink.emit(usage);
      await sink.emit({ type: "usage", contextUsedTokens: 100, contextMaxTokens: 10000 });
      return { status: "succeeded", text: "offline", resultKnown: true };
    },
  });
  await createChat(f.service, path);
  const sent = await f.service.command({
    commandId: commandId(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "one",
  });
  await until(() => {
    f.service.tick();
    return f.db.read<StoredRun>("run", sent.id)?.state === "succeeded";
  });
  const first = (await f.service.timeline("chat")).usage;
  assert.equal(first?.runId, sent.id);
  assert.equal(first?.inputTokens, 90);
  assert.equal(first?.outputTokens, 10);
  assert.equal(first?.contextMaxTokens, 10000);
  await f.service.disposeAllAndWait();
  const reopened = fixture(path, success);
  try {
    assert.deepEqual((await reopened.service.timeline("chat")).usage, first);
    await reopened.service.command({
      commandId: commandId(),
      type: "send",
      kind: "chat",
      targetId: "chat",
      text: "two",
    });
    assert.equal((await reopened.service.timeline("chat")).usage, undefined);
  } finally {
    await reopened.service.disposeAllAndWait();
  }
});

test("group member usage and execution time come from durable turns after restart", async () => {
  const path = root();
  const f = fixture(path, {
    run: async (turn, sink) => {
      const step = turn.dispatchId ?? "";
      if (step.includes("group:plan:"))
        return {
          status: "succeeded",
          resultKnown: true,
          text: JSON.stringify({
            tasks: [
              { id: "build", member: "codex", instruction: "Build" },
              { id: "check", member: "claude-code", instruction: "Check" },
            ],
          }),
        };
      if (step.includes("group:review:"))
        return {
          status: "succeeded",
          resultKnown: true,
          text: JSON.stringify({ status: "complete", summary: "Both tasks checked." }),
        };
      const usage = step.includes(":build")
        ? { type: "usage" as const, scope: "turn" as const, inputTokens: 10, outputTokens: 5 }
        : { type: "usage" as const, scope: "turn" as const, inputTokens: 7, outputTokens: 3 };
      await sink.emit(usage);
      await sink.emit(usage);
      return { status: "succeeded", resultKnown: true, text: "done" };
    },
  });
  try {
    await f.service.command({
      commandId: commandId(),
      type: "save-group",
      group: {
        id: "group",
        name: "Team",
        goal: "ship",
        members: ["codex", "claude-code"],
        host: "codex",
        sharedSummary: "",
        mode: "task",
        workspaceMode: "isolated",
        workspacePath: path,
        createdAt: 1,
        updatedAt: 1,
      },
    });
    const accepted = await f.service.command({
      commandId: commandId(),
      type: "send",
      kind: "group",
      targetId: "group",
      text: "ship",
      taskMode: true,
    });
    await until(() => {
      f.service.tick();
      return f.db.read<StoredRun>("run", accepted.id)?.state === "succeeded";
    });
    const before = await f.service.timeline("group");
    assert.equal(before.groupMetrics?.total.tokens, 25);
    assert.equal(
      before.groupMetrics?.total.tokensPartial,
      true,
      "host planning and review do not report usage",
    );
    assert.deepEqual(
      before.groupMetrics?.members.map((item) => item.tokens),
      [15, 10],
    );
    assert.equal(
      before.turns
        ?.filter((item) => item.stepId.includes(":task:"))
        .every(
          (item) => item.memberId && item.startedAt !== undefined && item.endedAt !== undefined,
        ),
      true,
    );
    assert.deepEqual((before.runs[0]!.checkpoint.plan as { review?: unknown }).review, {
      round: 0,
      status: "complete",
      summary: "Both tasks checked.",
    });
    await f.service.disposeAllAndWait();
    const reopened = fixture(path, success);
    try {
      const after = await reopened.service.timeline("group");
      assert.deepEqual(after.groupMetrics, before.groupMetrics);
    } finally {
      await reopened.service.disposeAllAndWait();
    }
  } finally {
    await f.service.disposeAllAndWait().catch(() => {});
    await rm(path, { recursive: true, force: true });
  }
});

test("command admission is transactional and idempotent without context crossing kernels", async () => {
  const path = root();
  const db = new StudioDatabase(join(path, "db.sqlite"));
  const create = {
    commandId: "create",
    type: "create-conversation" as const,
    id: "chat",
    kernel: "codex" as const,
    workspacePath: path,
  };
  admitStudioCommand(db, clock, create);
  const send = {
    commandId: "send",
    type: "send" as const,
    kind: "chat" as const,
    targetId: "chat",
    text: "hello",
  };
  const first = admitStudioCommand(db, clock, send);
  assert.deepEqual(admitStudioCommand(db, clock, send), first);
  assert.equal(db.list("run").length, 1);
  assert.equal(db.list("message").length, 1);
  assert.throws(() => admitStudioCommand(db, clock, { ...send, text: "different" }), /请求编号/);
  assert.throws(
    () => admitStudioCommand(db, clock, { ...create, commandId: "other", kernel: "claude-code" }),
    /独立/,
  );
  const revision = db.revision();
  assert.throws(() =>
    db.transaction(() => {
      db.write("test", "atomic", 1);
      throw new Error("rollback");
    }),
  );
  assert.equal(db.read("test", "atomic"), undefined);
  assert.equal(db.revision(), revision);
  db.close();
});

test("two Hosts share one executor and queue second turn with persisted native session", async () => {
  const path = root();
  const calls: StudioKernelTurn[] = [];
  const adapter: StudioKernelAdapter = {
    run: async (turn, sink) => {
      calls.push(turn);
      await sink.emit({ type: "session", sessionId: "native-one" });
      await sink.emit({ type: "text", text: calls.length === 1 ? "first" : "second" });
      return { status: "succeeded", text: "", resultKnown: true };
    },
  };
  const a = fixture(path, adapter);
  const b = fixture(path, adapter);
  await createChat(a.service, path);
  await a.service.command({
    commandId: commandId(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "one",
  });
  await b.service.command({
    commandId: commandId(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "two",
  });
  a.service.tick();
  b.service.tick();
  await until(() => {
    a.service.tick();
    b.service.tick();
    return (
      calls.length === 2 && a.db.list<StoredRun>("run").every((run) => run.state === "succeeded")
    );
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.nativeSessionId, "native-one");
  const messages = (await b.service.timeline("chat")).messages;
  assert.deepEqual(
    messages.filter((message) => message.sender === "codex").map((message) => message.text),
    ["first", "second"],
  );
  await a.service.disposeAllAndWait();
  await b.service.disposeAllAndWait();
});

test("approval survives renderer detach and duplicate or late answers are rejected", async () => {
  const path = root();
  let decision = "";
  const f = fixture(path, {
    run: async (_turn, sink) => {
      const answer = await sink.ask({
        id: "native-question",
        kind: "approval",
        title: "Write a file?",
      });
      decision = answer.decision ?? "";
      return { status: "succeeded", text: "done", resultKnown: true };
    },
  });
  await createChat(f.service, path);
  await f.service.command({
    commandId: commandId(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "ask",
  });
  f.service.tick();
  await until(async () => (await f.service.timeline("chat")).interactions.length > 0);
  const question = (await f.service.timeline("chat")).interactions[0]!;
  const answer = {
    commandId: "answer",
    type: "answer" as const,
    interactionId: question.id,
    answer: { decision: "allow-once" as const },
  };
  const accepted = await f.service.command(answer);
  assert.deepEqual(await f.service.command(answer), accepted);
  await until(() => decision === "allow-once");
  await assert.rejects(f.service.command({ ...answer, commandId: "late" }), /已回答|已失效/);
  await until(() => f.db.list<StoredRun>("run")[0]?.state === "succeeded");
  await f.service.disposeAllAndWait();
});

test("cancel fences late output, expires questions and stops only the owned turn", async () => {
  const path = root();
  let tailAcceptedWithoutTransportError = false;
  let stopped = false;
  const f = fixture(path, {
    run: async (_turn, sink, signal) => {
      try {
        await sink.ask({ id: "approval", kind: "approval", title: "Continue?" });
      } catch {
        stopped = signal.aborted;
      }
      await sink.emit({ type: "text", text: "late" });
      tailAcceptedWithoutTransportError = true;
      return { status: "cancelled", text: "", resultKnown: true };
    },
  });
  await createChat(f.service, path);
  const accepted = await f.service.command({
    commandId: commandId(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "stop",
  });
  f.service.tick();
  await until(async () => (await f.service.timeline("chat")).interactions.length > 0);
  await f.service.command({ commandId: commandId(), type: "cancel", runId: accepted.id });
  f.service.tick();
  await until(() => f.db.read<StoredRun>("run", accepted.id)?.state === "cancelled");
  assert.equal(stopped, true);
  assert.equal(tailAcceptedWithoutTransportError, true);
  assert.equal((await f.service.timeline("chat")).interactions[0]?.status, "expired");
  assert.equal(
    (await f.service.timeline("chat")).messages.some((message) => message.text === "late"),
    false,
  );
  await f.service.disposeAllAndWait();
});

test("crash recovery does not replay uncertain native effects; explicit retry creates new attempt", async () => {
  const path = root();
  let calls = 0;
  let now = 1000;
  const f = fixture(
    path,
    {
      run: async () => {
        calls++;
        return { status: "succeeded", text: "ok", resultKnown: true };
      },
    },
    () => now,
  );
  await createChat(f.service, path);
  const accepted = await f.service.command({
    commandId: commandId(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "write",
  });
  f.db.claim("dead-owner", now);
  f.db.transaction(() => {
    const run = f.db.read<StoredRun>("run", accepted.id)!;
    f.db.write("run", run.id, { ...run, state: "running", owner: "dead-owner" }, "chat");
    f.db.write("turn", "uncertain-turn", { state: "running", attempt: 1 }, run.id);
  });
  now += 9000;
  f.service.tick();
  assert.equal(calls, 0);
  assert.equal(f.db.read<StoredRun>("run", accepted.id)?.state, "interrupted");
  await assert.rejects(
    f.service.command({
      commandId: commandId(),
      type: "resume",
      runId: accepted.id,
      retryUncertain: false,
    }),
    /不确定/,
  );
  await f.service.command({
    commandId: commandId(),
    type: "resume",
    runId: accepted.id,
    retryUncertain: true,
  });
  f.service.tick();
  await until(() => f.db.read<StoredRun>("run", accepted.id)?.state === "succeeded");
  assert.equal(calls, 1);
  assert.equal(f.db.read<StoredRun>("run", accepted.id)?.attempt, 2);
  await f.service.disposeAllAndWait();
});

test("save or delete active definitions is rejected without losing saved draft", async () => {
  const path = root();
  const f = fixture(path, success);
  const group = {
    id: "group",
    name: "Team",
    goal: "",
    members: ["codex" as const],
    host: "codex" as const,
    sharedSummary: "only shared",
    mode: "manual" as const,
    workspaceMode: "isolated" as const,
    workspacePath: path,
    createdAt: 1,
    updatedAt: 1,
  };
  await f.service.command({ commandId: commandId(), type: "save-group", group });
  await f.service.command({
    commandId: commandId(),
    type: "send",
    kind: "group",
    targetId: group.id,
    text: "@Codex hello",
  });
  await assert.rejects(
    f.service.command({
      commandId: commandId(),
      type: "save-group",
      group: { ...group, name: "changed" },
    }),
    /先停止/,
  );
  await assert.rejects(
    f.service.command({ commandId: commandId(), type: "delete", kind: "group", id: group.id }),
    /先停止/,
  );
  assert.equal((await f.service.overview()).groups[0]?.name, "Team");
  await f.service.disposeAllAndWait();
});

test("definition saves based on a stale version are rejected without overwriting", async () => {
  const path = root();
  const f = fixture(path, success);
  const group = {
    id: "concurrent-group",
    name: "Team",
    goal: "",
    members: ["codex" as const],
    host: "codex" as const,
    sharedSummary: "",
    mode: "manual" as const,
    workspaceMode: "isolated" as const,
    workspacePath: path,
    createdAt: 1,
    updatedAt: 1,
  };
  await f.service.command({ commandId: commandId(), type: "save-group", group });
  // 窗口 A 基于版本 1 保存成功，得到版本 2。
  const replayed = {
    commandId: commandId(),
    type: "save-group" as const,
    group: { ...group, name: "From A", updatedAt: 2 },
    baseUpdatedAt: 1,
  };
  const first = await f.service.command(replayed);
  // 同一请求重放返回原结果，不按新版本再次判定为冲突。
  assert.deepEqual(await f.service.command(replayed), first);
  // 窗口 B 仍基于版本 1，保存被拒绝，A 的修改保留。
  await assert.rejects(
    f.service.command({
      commandId: commandId(),
      type: "save-group",
      group: { ...group, name: "From B", updatedAt: 3 },
      baseUpdatedAt: 1,
    }),
    /其他窗口修改/,
  );
  assert.equal((await f.service.overview()).groups[0]?.name, "From A");
  const workflow = {
    id: "concurrent-workflow",
    name: "Flow",
    workspacePath: null,
    nodes: [],
    edges: [],
    updatedAt: 5,
  };
  await f.service.command({ commandId: commandId(), type: "save-workflow", workflow });
  await f.service.command({
    commandId: commandId(),
    type: "delete",
    kind: "workflow",
    id: workflow.id,
  });
  await assert.rejects(
    f.service.command({
      commandId: commandId(),
      type: "save-workflow",
      workflow: { ...workflow, name: "Stale", updatedAt: 6 },
      baseUpdatedAt: 5,
    }),
    /已被删除/,
  );
  await assert.rejects(
    f.service.command({
      commandId: commandId(),
      type: "save-group",
      group,
      baseUpdatedAt: Number.NaN,
    }),
    /无效的定义版本/,
  );
  await f.service.disposeAllAndWait();
});

test("overview lists every conversation instead of silently truncating at the page limit", async () => {
  const path = root();
  const f = fixture(path, success);
  f.db.transaction(() => {
    for (let i = 0; i < 1200; i++)
      f.db.write("conversation", `c-${i}`, {
        id: `c-${i}`,
        kernel: "codex",
        workspacePath: path,
        title: "t",
        createdAt: i,
        updatedAt: i,
      });
  });
  const overview = await f.service.overview();
  assert.equal(overview.conversations.length, 1200);
  assert.ok(overview.conversations.some((item) => item.id === "c-0"));
  await f.service.disposeAllAndWait();
});
