import assert from "node:assert/strict";
import { test } from "node:test";
import type { IStudioRuntimeService, StudioAttentionItem } from "@knorvia/services";
import { StudioAttentionActions } from "../src/studio/attention/attentionActions.js";
import {
  resolveStudioAttentionTarget,
  studioAttentionRoute,
  studioAttentionProjectToActivate,
} from "../src/studio/attention/attentionNavigation.js";
import { studioAttentionRows } from "../src/studio/attention/attentionRows.js";

const item: StudioAttentionItem = {
  id: "old-run",
  object: "run",
  version: "1",
  category: "failed",
  unread: true,
  runId: "old-run",
  attempt: 2,
  targetId: "original-conversation",
  targetKind: "chat",
  title: "Synthetic",
  workspacePath: "/original/project",
  kernels: ["codex"],
  state: "failed",
  updatedAt: 10,
  targetDeleted: false,
  kernelUnavailable: false,
  resultUnknown: false,
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("navigation verifies the exact historical target and retains its project, kernel, session and run", async () => {
  const calls: unknown[] = [];
  const service = {
    overview: async () => ({ attention: { items: [item] } }),
    timeline: async (...args: unknown[]) => {
      calls.push(args);
      return { runs: [{ id: item.runId, targetId: item.targetId }] };
    },
  } as unknown as IStudioRuntimeService;
  const current = await resolveStudioAttentionTarget(service, item);
  assert.deepEqual(calls, [[item.targetId, undefined, item.runId]]);
  assert.equal(current.workspacePath, "/original/project");
  assert.equal(studioAttentionProjectToActivate(current), "/original/project");
  assert.equal(
    studioAttentionProjectToActivate({ ...item, kernels: ["ssh:original:codex"] }),
    undefined,
  );
  assert.equal(
    studioAttentionProjectToActivate({
      ...item,
      targetKind: "group",
      kernels: ["ssh:original:codex"],
    }),
    "/original/project",
  );
  assert.deepEqual(studioAttentionRoute(current), {
    focusTargetId: item.targetId,
    focusRunId: item.runId,
    view: "external-chat",
    chatMode: "single",
    kernelId: "codex",
    externalSessionId: item.targetId,
  });
  assert.equal(
    studioAttentionRoute({ ...item, kernels: ["ssh:original:codex"] }).kernelId,
    "ssh:original:codex",
  );
  assert.equal(studioAttentionRoute({ ...item, targetKind: "group" }).groupId, item.targetId);
  assert.equal(studioAttentionRoute({ ...item, targetKind: "workflow" }).workflowId, item.targetId);
  await assert.rejects(
    resolveStudioAttentionTarget(service, { ...item, version: "stale" }),
    /changed/,
  );
  await assert.rejects(
    resolveStudioAttentionTarget(
      {
        ...service,
        overview: async () => ({ attention: { items: [{ ...item, targetDeleted: true }] } }),
      } as unknown as IStudioRuntimeService,
      item,
    ),
    /missing/,
  );
});

test("late A navigation, errors and disposed connections cannot overwrite B", async () => {
  const owner = new StudioAttentionActions();
  const unsubscribe = owner.subscribe(() => {});
  const a = deferred();
  const b = deferred();
  const opened: string[] = [];
  const first = owner.perform("open:a", true, async (current) => {
    await a.promise;
    if (current()) opened.push("a");
    throw new Error("old A");
  });
  const second = owner.perform("open:b", true, async (current) => {
    await b.promise;
    if (current()) opened.push("b");
  });
  b.resolve();
  await second;
  a.resolve();
  await first;
  assert.deepEqual(opened, ["b"]);
  assert.equal(owner.getSnapshot().error, "");
  const oldConnection = deferred();
  const pending = owner.perform("open:old", true, async (current) => {
    await oldConnection.promise;
    if (current()) opened.push("old");
  });
  unsubscribe();
  const reconnect = owner.subscribe(() => {});
  oldConnection.resolve();
  await pending;
  assert.deepEqual(opened, ["b"]);
  assert.equal(owner.getSnapshot().busy.size, 0);
  reconnect();
});

test("same-path remote sources remain distinct and duplicate native events coalesce", () => {
  const native = {
    taskId: "same",
    title: "Synthetic",
    workspacePath: "/same/path",
    createdAt: 1,
    updatedAt: 2,
    status: "completed" as const,
    unreadAt: 10,
    sourceAvailability: "online" as const,
  };
  const a = { ...native, workspaceIdentity: "remote:a", remoteSessionId: "connection:a" };
  const b = { ...native, workspaceIdentity: "remote:b", remoteSessionId: "connection:b" };
  const rows = studioAttentionRows(
    1,
    [item],
    [a, a, b, { ...native, taskId: "offline", sourceAvailability: "offline" }],
  );
  assert.equal(rows.length, 4);
  assert.notEqual(rows[1]?.key, rows[2]?.key);
  assert.equal(
    rows.find((row) => row.source === "native" && row.item.taskId === "offline")?.unavailable,
    true,
  );
});

test("native read responses lose write permission after source replacement, including late failure", async () => {
  const { readStudioAttentionRow } = await import("../src/studio/attention/attentionRead.js");
  const { useTaskQueryCacheStore } = await import("../src/store/taskQueryCacheStore.js");
  const { buildTaskEntityKey } = await import("../src/lib/taskQueryCache.js");
  const meta = {
    taskId: "source-change",
    traceId: "source-change",
    title: "Synthetic",
    workspacePath: "/same/path",
    workspaceIdentity: "remote:a",
    remoteSessionId: "old-connection",
    mode: "build" as const,
    status: "completed" as const,
    createdAt: 1,
    updatedAt: 2,
    unreadAt: 100,
    sourceAvailability: "online" as const,
  };
  const row = studioAttentionRows(1, [], [meta])[0]!;
  const store = useTaskQueryCacheStore.getState();
  const key = buildTaskEntityKey(meta);
  try {
    for (const failure of [false, true]) {
      store.clearAll();
      store.upsertTaskMeta(meta);
      const response = deferred();
      let current = true;
      const pending = readStudioAttentionRow(
        row,
        async () => {
          throw new Error("No Studio command is allowed for a native read");
        },
        {
          mutateTask: async ({ address, mutation }) => {
            assert.equal(address.remoteSessionId, "old-connection");
            assert.equal(mutation.kind === "mark-read" && mutation.expectedUnreadAt, 100);
            await response.promise;
            if (failure) throw new Error("late old Host failure");
            return { ...meta, unreadAt: undefined };
          },
        },
        () => current,
      );
      current = false;
      store.clearAll();
      store.upsertTaskMeta({ ...meta, remoteSessionId: "new-connection", unreadAt: 102 });
      response.resolve();
      await pending;
      assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 102);
      assert.equal(
        useTaskQueryCacheStore.getState().taskUnreadMutationsByEntityKey[key],
        undefined,
      );
    }
  } finally {
    store.clearAll();
  }
});
