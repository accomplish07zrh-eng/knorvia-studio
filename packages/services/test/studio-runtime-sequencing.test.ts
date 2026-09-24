import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { deferred } from "../src/studio-runtime/adapters/kernels/processTransport.js";
import type { StudioKernelAdapter, StudioKernelTurn } from "../src/studio-runtime/kernelTypes.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioGroupDefinition } from "../src/studio-runtime/workflowTypes.js";

function fixture(adapter: StudioKernelAdapter, now = Date.now) {
  const root = mkdtempSync(join(tmpdir(), "studio-sequencing-"));
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    clock: {
      now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => adapter,
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: createStudioWorkspaceManager(join(root, "storage")),
    onDidChange: () => ({ dispose() {} }),
    notify() {},
  });
  return { root, db, service };
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await sleep(5);
  }
}
async function createChat(service: StudioRuntimeService, project: string) {
  await service.command({
    commandId: randomUUID(),
    type: "create-conversation",
    id: "chat",
    kernel: "codex",
    workspacePath: project,
  });
}
const send = (service: StudioRuntimeService, text: string) =>
  service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text,
  });

test("same-millisecond queue and reverse acknowledgements retain the original run admission order", async () => {
  const calls: string[] = [];
  const instant = Date.now();
  const f = fixture(
    {
      run: async (turn) => {
        calls.push(turn.text);
        return { status: "succeeded", text: "done", resultKnown: true };
      },
    },
    () => instant,
  );
  try {
    await createChat(f.service, f.root);
    const initial = [await send(f.service, "first"), await send(f.service, "second")];
    assert.equal(
      f.db.read<StoredRun>("run", initial[0]!.id)?.createdAt,
      f.db.read<StoredRun>("run", initial[1]!.id)?.createdAt,
    );
    for (const { id } of initial) {
      f.service.tick();
      await until(() => f.db.read<StoredRun>("run", id)?.state === "succeeded");
    }
    assert.deepEqual(calls, ["first", "second"]);
    const retries = [await send(f.service, "third"), await send(f.service, "fourth")];
    f.db.transaction(() => {
      for (const { id } of retries) {
        const run = f.db.read<StoredRun>("run", id)!;
        f.db.write("run", id, { ...run, state: "interrupted", resultKnown: false }, "chat");
        f.db.remove("active", id);
      }
    });
    for (const { id } of [...retries].reverse())
      await f.service.command({
        commandId: randomUUID(),
        type: "resume",
        runId: id,
        retryUncertain: true,
      });
    for (const { id } of retries) {
      f.service.tick();
      await until(() => f.db.read<StoredRun>("run", id)?.state === "succeeded");
    }
    assert.deepEqual(calls, ["first", "second", "third", "fourth"]);
  } finally {
    await f.service.disposeAllAndWait();
  }
});

test("an accepted follow-up waits through unknown completion and only dispatches after explicit retry settles", async () => {
  const finish = deferred<void>();
  const calls: string[] = [];
  const f = fixture({
    run: async (turn) => {
      calls.push(turn.text);
      if (calls.length === 1) {
        await finish.promise;
        return { status: "interrupted", text: "", resultKnown: false };
      }
      return { status: "succeeded", text: "ok", resultKnown: true };
    },
  });
  try {
    await createChat(f.service, f.root);
    const first = await send(f.service, "first");
    f.service.tick();
    await until(() => calls.length === 1);
    const second = await send(f.service, "second");
    finish.resolve();
    await until(() => f.db.read<StoredRun>("run", first.id)?.state === "interrupted");
    f.service.tick();
    await sleep(10);
    assert.deepEqual(calls, ["first"]);
    assert.equal(f.db.read<StoredRun>("run", second.id)?.state, "queued");
    await f.service.command({
      commandId: randomUUID(),
      type: "resume",
      runId: first.id,
      retryUncertain: true,
    });
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", first.id)?.state === "succeeded");
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", second.id)?.state === "succeeded");
    assert.deepEqual(calls, ["first", "first", "second"]);
  } finally {
    finish.resolve();
    await f.service.disposeAllAndWait();
  }
});

test("crash recovery fences preaccepted follow-ups and old uncertainty survives history paging and another resume", async () => {
  let calls = 0;
  const f = fixture({
    run: async () => {
      calls++;
      return { status: "succeeded", text: "ok", resultKnown: true };
    },
  });
  try {
    await createChat(f.service, f.root);
    const first = await send(f.service, "unknown");
    const queued = await send(f.service, "queued-before-crash");
    f.db.transaction(() => {
      const run = f.db.read<StoredRun>("run", first.id)!;
      f.db.write("run", run.id, { ...run, state: "running", owner: "dead-owner" }, "chat");
      f.db.write("turn", "old-running-turn", { state: "running", attempt: 1 }, run.id);
    });
    f.service.tick();
    await sleep(10);
    assert.equal(f.db.read<StoredRun>("run", first.id)?.state, "interrupted");
    assert.equal(f.db.read<StoredRun>("run", queued.id)?.state, "queued");
    assert.equal(calls, 0);
    f.db.transaction(() => {
      const run = f.db.read<StoredRun>("run", first.id)!;
      for (let i = 0; i < 1100; i++) {
        const id = `historical-${i}`;
        f.db.write("run", id, { ...run, id, state: "failed", resultKnown: true }, "chat");
      }
    });
    assert.ok(
      !f.db
        .list<StoredRun>("run", { scope: "chat", limit: 1000 })
        .some((run) => run.id === first.id),
    );
    await assert.rejects(send(f.service, "new"), /不确定/);
    await assert.rejects(
      f.service.command({
        commandId: randomUUID(),
        type: "resume",
        runId: "historical-1099",
        retryUncertain: true,
      }),
      /不确定/,
    );
    f.service.tick();
    await sleep(10);
    assert.equal(calls, 0);
    const timeline = await f.service.timeline("chat");
    const overview = await f.service.overview();
    for (const runs of [timeline.runs, overview.runs]) {
      assert.equal(runs.length, 101);
      assert.equal(runs.at(-1)?.id, first.id);
      assert.equal(new Set(runs.map((run) => run.id)).size, runs.length);
      assert.equal(runs[0]?.id, "historical-1099");
    }
  } finally {
    await f.service.disposeAllAndWait();
  }
});

test("multiple legacy unknown runs can each be acknowledged without dispatching an unacknowledged sibling", async () => {
  const calls: string[] = [];
  const f = fixture({
    run: async (turn) => {
      calls.push(turn.text);
      return { status: "succeeded", text: "done", resultKnown: true };
    },
  });
  try {
    await createChat(f.service, f.root);
    const first = await send(f.service, "first");
    const second = await send(f.service, "second");
    f.db.transaction(() => {
      for (const { id } of [first, second]) {
        const run = f.db.read<StoredRun>("run", id)!;
        f.db.write("run", id, { ...run, state: "interrupted", resultKnown: false }, "chat");
        f.db.remove("active", id);
      }
    });
    await f.service.command({
      commandId: randomUUID(),
      type: "resume",
      runId: first.id,
      retryUncertain: true,
    });
    f.service.tick();
    await sleep(10);
    assert.deepEqual(calls, []);
    assert.equal(f.db.read<StoredRun>("run", second.id)?.state, "interrupted");
    await assert.rejects(
      f.service.command({
        commandId: randomUUID(),
        type: "resume",
        runId: second.id,
        retryUncertain: false,
      }),
      /不确定/,
    );
    await f.service.command({
      commandId: randomUUID(),
      type: "resume",
      runId: second.id,
      retryUncertain: true,
    });
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", first.id)?.state === "succeeded");
    f.service.tick();
    await until(() => f.db.read<StoredRun>("run", second.id)?.state === "succeeded");
    assert.deepEqual(calls, ["first", "second"]);
  } finally {
    await f.service.disposeAllAndWait();
  }
});

test("group workspace generations survive reopen and rotate on project or mode round trips without losing historical changes", async () => {
  const turns: StudioKernelTurn[] = [];
  const f = fixture({
    run: async (turn) => {
      turns.push(turn);
      writeFileSync(join(turn.workspacePath, "result.txt"), `result-${turns.length}`);
      return {
        status: "succeeded",
        text: "done",
        resultKnown: true,
        nativeSessionId: `session-${turns.length}`,
      };
    },
  });
  const a = join(f.root, "project-a");
  const b = join(f.root, "project-b");
  mkdirSync(a);
  mkdirSync(b);
  writeFileSync(join(a, "source.txt"), "A");
  writeFileSync(join(b, "source.txt"), "B");
  let group: StudioGroupDefinition = {
    id: "group",
    name: "Team",
    goal: "",
    members: ["codex"],
    host: "codex",
    sharedSummary: "",
    mode: "manual",
    workspaceMode: "isolated",
    workspacePath: a,
    createdAt: 1,
    updatedAt: 1,
  };
  const run = async (update: Partial<StudioGroupDefinition> = {}) => {
    group = { ...group, ...update, updatedAt: group.updatedAt + 1 };
    await f.service.command({ commandId: randomUUID(), type: "save-group", group });
    const accepted = await f.service.command({
      commandId: randomUUID(),
      type: "send",
      kind: "group",
      targetId: group.id,
      text: "@Codex work",
    });
    f.service.tick();
    await until(
      () =>
        !["queued", "running", "waiting"].includes(f.db.read<StoredRun>("run", accepted.id)!.state),
    );
    const saved = f.db.read<StoredRun>("run", accepted.id)!;
    assert.equal(saved.state, "succeeded", saved.error);
    return saved;
  };
  try {
    const first = await run();
    assert.equal(turns[0]!.nativeSessionId, undefined);
    await run({ name: "Renamed" });
    assert.equal(turns[1]!.workspacePath, turns[0]!.workspacePath);
    assert.equal(turns[1]!.nativeSessionId, "session-1");
    const moved = await run({ workspacePath: b });
    assert.notEqual(moved.workspaceGeneration, first.workspaceGeneration);
    assert.equal(turns[2]!.nativeSessionId, undefined);
    assert.equal(readFileSync(join(turns[2]!.workspacePath, "source.txt"), "utf8"), "B");
    await run({ workspacePath: a });
    assert.notEqual(turns[3]!.workspacePath, turns[0]!.workspacePath);
    assert.equal(turns[3]!.nativeSessionId, undefined);
    await run({ workspaceMode: "shared" });
    assert.equal(turns[4]!.workspacePath, a);
    assert.equal(turns[4]!.nativeSessionId, undefined);
    await run({ workspaceMode: "isolated" });
    assert.notEqual(turns[5]!.workspacePath, turns[3]!.workspacePath);
    assert.equal(turns[5]!.nativeSessionId, undefined);
    await run({ workspaceMode: "shared" });
    assert.equal(turns[6]!.workspacePath, a);
    assert.equal(turns[6]!.nativeSessionId, undefined);
    assert.notEqual(turns[6]!.conversationId, turns[4]!.conversationId);
    const historical = await f.service.workspaceChanges({
      runId: first.id,
      stepId: "group:manual:codex",
    });
    assert.equal(historical.find((change) => change.path === "result.txt")?.after, "result-2");
    const reopened = new StudioDatabase(join(f.root, "runtime.sqlite"));
    try {
      assert.deepEqual(
        reopened.read("group-workspace", group.id),
        f.db.read("group-workspace", group.id),
      );
    } finally {
      reopened.close();
    }
  } finally {
    await f.service.disposeAllAndWait();
  }
});
