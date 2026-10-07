import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import type { StudioConversation, StudioMessage } from "../src/studio-runtime/types.js";
import type { StudioKernelTurn } from "../src/studio-runtime/kernelTypes.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";

test("admission ACK before native session keeps feedback queued, durable and scoped to its original target", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-feedback-admission-"));
  const databasePath = join(root, "studio.sqlite");
  const db = new StudioDatabase(databasePath);
  const calls: Array<{ turn: StudioKernelTurn; signal: AbortSignal }> = [];
  let release!: () => void;
  const starting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new StudioRuntimeService({
    db,
    clock: {
      id: randomUUID,
      now: Date.now,
      delay: (ms, signal) => delay(Math.min(ms, 5), undefined, { signal }),
    },
    kernels: {
      adapter: (kernel) => ({
        async run(turn, sink, signal) {
          assert.equal(turn.kernel, kernel);
          calls.push({ turn, signal });
          if (turn.text === "FIRST") {
            await starting;
            await sink.emit({ type: "session", sessionId: "native-first" });
          }
          return { status: "succeeded", text: "done", resultKnown: true };
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
  t.after(async () => {
    release();
    await service.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  });
  const readRun = (id: string) => db.read<StoredRun>("run", id)!;
  async function until(check: () => boolean) {
    const deadline = Date.now() + 30_000;
    while (!check()) {
      service.tick();
      if (Date.now() > deadline) throw new Error("admission review did not settle");
      await delay(2);
    }
  }
  for (const [id, kernel] of [
    ["source", "codex"],
    ["other", "claude-code"],
  ] as const)
    await service.command({
      commandId: `create-${id}`,
      type: "create-conversation",
      id,
      kernel,
      workspacePath: root,
    });
  const first = await service.command({
    commandId: "first",
    type: "send",
    kind: "chat",
    targetId: "source",
    text: "FIRST",
  });
  await until(() => calls.length === 1);
  assert.equal(calls[0]!.turn.nativeSessionId, undefined);
  assert.equal(
    db.read<{ nativeSessionId?: string }>("conversation", "source")?.nativeSessionId,
    undefined,
  );
  const feedback = {
    commandId: "feedback",
    type: "send",
    kind: "chat",
    targetId: "source",
    text: "FEEDBACK",
  } as const;
  const [accepted, duplicate] = await Promise.all([
    service.command(feedback),
    service.command(feedback),
  ]);
  assert.deepEqual(accepted, duplicate);
  await assert.rejects(service.command({ ...feedback, text: "different payload" }), /同一请求编号/);
  const other = await service.command({
    commandId: "other",
    type: "send",
    kind: "chat",
    targetId: "other",
    text: "OTHER",
  });
  await until(() => readRun(other.id).state === "succeeded");
  assert.deepEqual(
    calls.map(({ turn }) => turn.text),
    ["FIRST", "OTHER"],
  );
  assert.equal(calls[0]!.signal.aborted, false);
  assert.equal(readRun(first.id).state, "running");
  assert.equal(readRun(accepted.id).state, "queued");
  const reopened = new StudioDatabase(databasePath);
  try {
    assert.equal(reopened.read<StoredRun>("run", accepted.id)?.state, "queued");
    assert.equal(
      reopened.read<{ result: { id: string } }>("command", "feedback")?.result.id,
      accepted.id,
    );
  } finally {
    reopened.close();
  }
  release();
  await until(() => readRun(accepted.id).state === "succeeded");
  assert.equal(readRun(first.id).state, "succeeded");
  // 新增 turn 身份不能丢掉既有 conversation 回执；原生 session 事件仍须合并持久字段。
  assert.equal(
    db.read<StudioConversation>("conversation", "source")?.nativeSessionId,
    "native-first",
  );
  assert.deepEqual(
    calls.map(({ turn }) => turn.text),
    ["FIRST", "OTHER", "FEEDBACK"],
  );
  assert.equal(calls[2]!.turn.kernel, "codex");
  assert.equal(calls[2]!.turn.conversationId, calls[0]!.turn.conversationId);
  assert.equal(calls[2]!.turn.workspacePath, calls[0]!.turn.workspacePath);
  assert.equal(calls[2]!.turn.nativeSessionId, "native-first");
  // 按持久 sequence 验证输入顺序，不能由毫秒时间或 native ID 推断队列顺序。
  const inputs = (target: string) =>
    db
      .list<StudioMessage>("message", { scope: target, oldestFirst: true })
      .filter((message) => message.sender === "user")
      .map((message) => message.text);
  assert.deepEqual(inputs("source"), ["FIRST", "FEEDBACK"]);
  assert.deepEqual(inputs("other"), ["OTHER"]);
});
