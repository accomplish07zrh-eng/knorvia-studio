import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import type {
  StudioKernelAdapter,
  StudioKernelTurnResult,
} from "../src/studio-runtime/kernelTypes.js";
import type { StudioGroupDefinition } from "../src/studio-runtime/workflowTypes.js";
import type { StudioMessage } from "../src/studio-runtime/types.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { studioProjectKey } from "../src/studio-runtime/domain/projectIdentity.js";
import { workflow } from "./studio-orchestration-support.js";

const ok = (text = "done"): StudioKernelTurnResult => ({
  status: "succeeded",
  resultKnown: true,
  text,
});
async function fixture(t: TestContext, adapter: StudioKernelAdapter) {
  const path = await mkdtemp(join(tmpdir(), "knorvia-barriers-"));
  const db = new StudioDatabase(join(path, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(Math.min(ms, 5), undefined, { signal }),
    },
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
  t.after(async () => {
    await service.disposeAllAndWait();
    assert.equal(dirname(resolve(path)), resolve(tmpdir()));
    await rm(path, { recursive: true, force: true });
  });
  return { db, service, path };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function until(f: Fixture, check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 5000;
  while (true) {
    f.service.tick();
    if (await check()) return;
    if (Date.now() > end) throw new Error("Runtime barrier did not settle");
    await sleep(2);
  }
}
const state = (f: Fixture, id: string) => f.db.read<StoredRun>("run", id)!;
async function group(f: Fixture, id = "group", source = f.path) {
  const definition: StudioGroupDefinition = {
    id,
    name: id,
    goal: "Deliver the project",
    members: ["knorvia", "codex"],
    host: "knorvia",
    sharedSummary: "",
    mode: "task",
    workspaceMode: "isolated",
    workspacePath: source,
    createdAt: 1,
    updatedAt: 1,
  };
  await f.service.command({ commandId: randomUUID(), type: "save-group", group: definition });
}
async function send(
  f: Fixture,
  kind: "chat" | "group" | "workflow",
  targetId: string,
  text: string,
  taskMode = false,
) {
  return f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind,
    targetId,
    text,
    taskMode,
  });
}

test("workflow denial can be explicitly retried with a fresh approval and never reuses the old deny", async (t) => {
  let writes = 0;
  const f = await fixture(t, {
    run: async () => {
      writes++;
      return ok("written after permission");
    },
  });
  const graph = {
    ...workflow(
      ["start", "approval", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: f.path,
  };
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: graph });
  const run = await send(f, "workflow", graph.id, "write after approval");
  await until(f, async () =>
    (await f.service.timeline(graph.id)).interactions.some((item) => item.status === "pending"),
  );
  const denied = (await f.service.timeline(graph.id)).interactions.find(
    (item) => item.status === "pending",
  )!;
  await f.service.command({
    commandId: randomUUID(),
    type: "answer",
    interactionId: denied.id,
    answer: { decision: "deny" },
  });
  await until(f, () => state(f, run.id).state === "failed");
  const attempt = state(f, run.id).attempt;
  assert.equal(writes, 0);
  await f.service.command({
    commandId: randomUUID(),
    type: "resume",
    runId: run.id,
    retryUncertain: false,
  });
  await until(f, async () =>
    (await f.service.timeline(graph.id)).interactions.some((item) => item.status === "pending"),
  );
  const next = (await f.service.timeline(graph.id)).interactions.find(
    (item) => item.status === "pending",
  )!;
  assert.notEqual(next.id, denied.id);
  assert.equal(state(f, run.id).attempt, attempt + 1);
  assert.equal(writes, 0, "retry must wait for the new decision");
  await assert.rejects(
    f.service.command({
      commandId: randomUUID(),
      type: "answer",
      interactionId: denied.id,
      answer: { decision: "allow-once" },
    }),
    /已回答|失效/,
  );
  await f.service.command({
    commandId: randomUUID(),
    type: "answer",
    interactionId: next.id,
    answer: { decision: "allow-once" },
  });
  await until(f, () => state(f, run.id).state === "succeeded");
  assert.equal(writes, 1);
});

test("steering admitted at final completion commits once and continues before publishing the final answer", async (t) => {
  let corrected = 0;
  const f = await fixture(t, {
    run: async (turn) => {
      if (turn.text.startsWith("Coordinate this group task"))
        return ok(
          JSON.stringify({
            tasks: [{ id: "original", member: "codex", instruction: "Original delivery" }],
          }),
        );
      if (turn.text.startsWith("The user has corrected")) {
        assert.match(turn.text, /Also deliver a schema/);
        return ok(
          JSON.stringify({
            tasks: [{ id: "schema", member: "codex", instruction: "Deliver corrected schema" }],
            steeringSummary: "Also deliver a schema",
          }),
        );
      }
      if (turn.text.startsWith("Review the actual group results"))
        return ok(
          JSON.stringify({
            status: "complete",
            summary: corrected
              ? "Updated delivery including schema verified."
              : "Original delivery verified.",
          }),
        );
      if (turn.text.includes("Deliver corrected schema")) corrected++;
      return ok("actual file evidence");
    },
  });
  await group(f);
  const run = await send(f, "group", "group", "Deliver original project", true);
  const owns = f.db.owns.bind(f.db);
  let inserted = false;
  let admission: ReturnType<StudioRuntimeService["command"]> | undefined;
  // 在执行器已经生成完整结果、提交 run 终态前模拟另一个窗口收到插话。
  f.db.owns = (owner, now) => {
    const result = owns(owner, now);
    if (
      !inserted &&
      (state(f, run.id).checkpoint.plan as { phase?: string } | undefined)?.phase === "complete"
    ) {
      inserted = true;
      admission = f.service.command({
        commandId: "final-correction",
        type: "steer",
        runId: run.id,
        text: "Also deliver a schema",
      });
    }
    return result;
  };
  await until(f, () => state(f, run.id).state === "succeeded");
  assert.ok(admission);
  await admission;
  f.db.owns = owns;
  assert.equal(corrected, 1);
  const timeline = await f.service.timeline("group");
  assert.deepEqual(
    timeline.messages
      .filter((item) => item.sender === "knorvia" && item.kind === "text")
      .map((item) => item.text),
    ["Updated delivery including schema verified."],
  );
  assert.equal(timeline.messages.filter((item) => item.text === "Also deliver a schema").length, 1);
  assert.equal(
    f.db
      .list<{ state: string }>("steering", { scope: run.id })
      .every((item) => item.state === "consumed"),
    true,
  );
});

test("an unfinished source-project application blocks resume and queued dispatch across path spellings", async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    run: async () =>
      ++calls === 1
        ? { status: "failed", resultKnown: true, text: "", error: "known failure" }
        : ok(),
  });
  await group(f, "retry");
  // Windows 路径不区分大小写；POSIX 区分大小写，同一项目的不同写法只剩结尾分隔符。
  const sameProject =
    process.platform === "win32" ? f.path.toUpperCase().replaceAll("\\", "/") + "/" : `${f.path}/`;
  await group(f, "queued", sameProject);
  const failed = await send(f, "group", "retry", "@codex fail once");
  await until(f, () => state(f, failed.id).state === "failed");
  const queued = await send(f, "group", "queued", "@codex remain queued");
  // 上次进程留下的应用日志尚未恢复，现进程必须遵守这个持久化项目锁。
  const key = studioProjectKey(f.path);
  f.db.transaction(() => f.db.write("apply-lock", key, { token: "unfinished-apply", pid: 99999 }));
  const attempt = state(f, failed.id).attempt;
  await assert.rejects(
    f.service.command({
      commandId: randomUUID(),
      type: "resume",
      runId: failed.id,
      retryUncertain: false,
    }),
    /修改正在应用|恢复/,
  );
  for (let i = 0; i < 3; i++) {
    f.service.tick();
    await sleep(2);
  }
  assert.equal(calls, 1);
  assert.equal(state(f, queued.id).state, "queued");
  assert.equal(state(f, failed.id).attempt, attempt);
  f.db.transaction(() => f.db.remove("apply-lock", key));
  await f.service.command({
    commandId: randomUUID(),
    type: "resume",
    runId: failed.id,
    retryUncertain: false,
  });
  await until(f, () => [failed.id, queued.id].every((id) => state(f, id).state === "succeeded"));
  assert.equal(calls, 3);
});

test("group stop revokes queued work and accepts late transport frames without reviving the run", async (t) => {
  let activeId = "";
  let tailSettled = false;
  const called: string[] = [];
  const f = await fixture(t, {
    run: async (turn, sink, signal) => {
      called.push(turn.runId);
      if (turn.text.startsWith("Coordinate this group task"))
        return ok(
          JSON.stringify({
            tasks: [{ id: "writer", member: "codex", instruction: "Write after approval" }],
          }),
        );
      if (turn.runId !== activeId) return ok("independent group completed");
      try {
        await sink.ask({ id: "write-approval", kind: "approval", title: "Write project?" });
      } catch {
        assert.equal(signal.aborted, true);
      }
      await sink.emit({ type: "text", text: "obsolete late output" });
      await sink.emit({ type: "tool", id: "late-tool", name: "obsolete-tool", state: "succeeded" });
      tailSettled = true;
      return { status: "cancelled", resultKnown: true, text: "" };
    },
  });
  await group(f);
  await group(f, "other");
  const active = await send(f, "group", "group", "Write deliverable", true);
  activeId = active.id;
  await until(f, async () =>
    (await f.service.timeline("group")).interactions.some((item) => item.status === "pending"),
  );
  const queued = await send(f, "group", "group", "@codex stale queued followup");
  const other = await send(f, "group", "other", "@codex independent");
  await f.service.command({
    commandId: randomUUID(),
    type: "steer",
    runId: active.id,
    text: "Make a follow-up change",
  });
  await f.service.command({ commandId: randomUUID(), type: "cancel", runId: active.id });
  await until(
    f,
    () => state(f, active.id).state === "cancelled" && state(f, other.id).state === "succeeded",
  );
  assert.equal(tailSettled, true);
  assert.equal(
    state(f, active.id).resultKnown,
    true,
    "discarding a tail frame is not transport failure",
  );
  assert.equal(state(f, queued.id).state, "cancelled");
  assert.equal(called.includes(queued.id), false);
  const timeline = await f.service.timeline("group");
  assert.equal(
    timeline.messages.some(
      (item) => item.text === "obsolete late output" || item.name === "obsolete-tool",
    ),
    false,
  );
  assert.equal(
    timeline.interactions.every((item) => item.status === "expired"),
    true,
  );
  const count = called.length;
  for (let i = 0; i < 3; i++) {
    f.service.tick();
    await sleep(2);
  }
  assert.equal(called.length, count, "neither queued messages nor steering wake a cancelled run");
});

test("timeline pages preserve over 500 accepted messages with concurrent new arrivals and isolate targets", async (t) => {
  const f = await fixture(t, { run: async (turn) => ok(`reply-${turn.text}`) });
  for (const id of ["history", "other"])
    await f.service.command({
      commandId: randomUUID(),
      type: "create-conversation",
      id,
      kernel: "codex",
      workspacePath: f.path,
    });
  const expected: string[] = [];
  for (let i = 0; i < 258; i++) {
    const run = await send(f, "chat", "history", `message-${i}`);
    await until(f, () => state(f, run.id).state === "succeeded");
    expected.push(`message-${i}`, `reply-message-${i}`);
  }
  await send(f, "chat", "history", "message-258");
  expected.push("message-258");
  await send(f, "chat", "other", "never cross targets");
  const recent = await f.service.timeline("history");
  assert.equal(recent.messages.length, 500);
  assert.ok(recent.nextBefore !== undefined);
  await send(f, "chat", "history", "new arrival");
  const older = await f.service.timeline("history", recent.nextBefore);
  const combined: StudioMessage[] = [...older.messages, ...recent.messages];
  assert.equal(older.nextBefore, undefined);
  assert.equal(combined.length, 517);
  assert.equal(new Set(combined.map((item) => item.id)).size, 517);
  assert.deepEqual(
    combined.map((item) => item.text),
    expected,
  );
  assert.ok(combined.every((item, i) => i === 0 || item.sequence! > combined[i - 1]!.sequence!));
  assert.equal((await f.service.timeline("history")).messages.at(-1)!.text, "new arrival");
});
