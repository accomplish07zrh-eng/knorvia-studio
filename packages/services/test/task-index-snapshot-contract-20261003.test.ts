import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  KnorviaSessionStateSnapshot,
  KnorviaTaskMeta,
  KnorviaMessageWithParts,
} from "@knorvia/shared";
import type { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import type {
  BroadcastTask,
  SnapshotSyncOptions,
} from "../src/agent/task-index-ingestion/snapshotProjection.js";

test("task snapshot projection preserves stored optional fields, visible search and atomic grouped order", async (t) => {
  t.mock.module("@knorvia/shared", {
    namedExports: {
      KNORVIA_AGENT_PROVIDER: "knorvia",
      generateTraceId: () => "synthetic-generated-trace",
      deriveKnorviaTaskStatusFromSessionSnapshot: () => "completed",
      resolveKnorviaVisibleSessionTitle: (input: { title?: string }) =>
        input.title ?? "synthetic-fallback",
      getKnorviaUserVisibleMessages: (messages: KnorviaMessageWithParts[]) =>
        messages.filter((m) => m.info.messageId !== "synthetic-hidden"),
      isKnorviaGoalContinuationReminderText: (text: string) => text === "synthetic-reminder",
      isKnorviaModelOnlySyntheticUserMessage: (m: KnorviaMessageWithParts) =>
        m.info.messageId === "synthetic-hidden",
    },
  });
  t.mock.module("../src/agent/configOptions.js", {
    namedExports: {
      formatTaskMetaModelSelectionFromSnapshot: () => "synthetic-history-model",
    },
  });
  const { createSnapshotProjection, projectSnapshotMeta, projectSnapshotSearchText } =
    await import("../src/agent/task-index-ingestion/snapshotProjection.js");
  const snapshot = (title = "") =>
    ({
      session: {
        sessionId: "synthetic-session",
        traceId: "synthetic-preserved-trace",
        workspace: {
          workspacePath: "synthetic/workspace",
          workspaceIdentity: "synthetic-identity",
        },
        createdAt: 1,
        updatedAt: 2,
        mode: "build",
        title,
      },
      settings: { thoughtLevel: { current: "synthetic-level" } },
      projection: {},
      messages: [],
    }) as unknown as KnorviaSessionStateSnapshot;
  const broadcasts: Parameters<BroadcastTask>[] = [];
  const writes: Array<{ mode: string; meta: KnorviaTaskMeta; searchableText: string }> = [];
  let initializedGroupedOrder = true;
  let modelError: unknown;
  const repository = {
    async syncTaskMeta(input: { meta: KnorviaTaskMeta; searchableText: string }) {
      writes.push({ mode: "plain", ...input });
      return input.meta;
    },
    async syncTaskMetaAtGroupedTop(input: { meta: KnorviaTaskMeta; searchableText: string }) {
      writes.push({ mode: "grouped", ...input });
      return { meta: input.meta, initializedGroupedOrder };
    },
    async updateTaskState(input: { patch: { model: string } }) {
      if (modelError) throw modelError;
      return { model: input.patch.model } as KnorviaTaskMeta;
    },
  } as unknown as TaskIndexRepo;
  const port = createSnapshotProjection(repository, (...event) => broadcasts.push(event), {
    warn() {},
  } as unknown as Parameters<typeof createSnapshotProjection>[2]);
  const options: SnapshotSyncOptions = {
    broadcastReason: "task_status_changed",
    moveGroupedTaskToTop: true,
  };

  await t.test(
    "missing goal keeps key absent, null clears, and error attribution keeps its reference",
    () => {
      const input = snapshot();
      assert.equal("target" in projectSnapshotMeta(input, options), false);
      input.projection.target = null;
      assert.equal(projectSnapshotMeta(input, options).target, null);
      const attribution = { source: "synthetic-attribution" };
      input.projection.lastError = {
        type: "synthetic-code",
        message: "synthetic-error",
        attribution,
      } as unknown as NonNullable<KnorviaSessionStateSnapshot["projection"]["lastError"]>;
      const meta = projectSnapshotMeta(input, {
        modelOverride: " new-model ",
        thoughtLevelOverride: " high ",
      });
      assert.equal(meta.model, "new-model");
      assert.equal(meta.thoughtLevel, "high");
      assert.equal(meta.traceId, "synthetic-preserved-trace");
      assert.equal(meta.lastError?.attribution, attribution);
      assert.equal(meta.lastError?.code, "synthetic-code");
      assert.equal("detail" in (meta.lastError ?? {}), false);
    },
  );

  await t.test(
    "blank snapshot writes one grouped transaction and broadcasts structure without placeholder metadata",
    async () => {
      await port.sync(snapshot(), options);
      assert.equal(writes.length, 1);
      assert.equal(writes[0]?.mode, "grouped");
      assert.equal(broadcasts.length, 1);
      assert.equal(broadcasts[0]?.[1], undefined);
      assert.equal(broadcasts[0]?.[2], "task_created");
      initializedGroupedOrder = false;
      await port.sync(snapshot(), options);
      assert.equal(broadcasts.length, 1);
      await port.sync(snapshot("Visible title"), {
        ...options,
        unreadSignal: "background_terminal",
      });
      assert.equal(broadcasts.at(-1)?.[2], "task_status_changed");
      assert.deepEqual(broadcasts.at(-1)?.[3], { unreadSignal: "background_terminal" });
    },
  );

  await t.test("subagent details cannot add a primary task or emit a workspace row", async () => {
    const child = snapshot("Child detail");
    child.session.sessionKind = "subagent_child";
    const beforeWrites = writes.length;
    const beforeEvents = broadcasts.length;
    assert.equal((await port.sync(child, options)).taskId, "synthetic-session");
    assert.equal(writes.length, beforeWrites);
    assert.equal(broadcasts.length, beforeEvents);
  });

  await t.test(
    "search indexes user text and the latest assistant text, excluding hidden input and tools",
    () => {
      const input = snapshot();
      input.messages = [
        {
          info: { role: "user", messageId: "user" },
          parts: [{ type: "text", text: "  user query  " }],
        },
        {
          info: { role: "user", messageId: "synthetic-hidden" },
          parts: [{ type: "text", text: "hidden continuation" }],
        },
        {
          info: { role: "assistant", messageId: "answer" },
          parts: [
            { type: "text", text: "earlier answer" },
            { type: "thinking", text: "private thought" },
            { type: "tool", text: "tool detail" },
            { type: "text", text: " latest answer " },
          ],
        },
      ] as unknown as KnorviaMessageWithParts[];
      assert.equal(projectSnapshotSearchText(input), "user query\nlatest answer");
      input.messages = [
        {
          info: { role: "user", messageId: "long" },
          parts: [{ type: "text", text: "x".repeat(200_001) }],
        },
      ] as unknown as KnorviaMessageWithParts[];
      assert.equal(projectSnapshotSearchText(input).length, 200_000);
    },
  );

  await t.test(
    "model-only write skips blank values and retains the null-on-repository-failure result",
    async () => {
      const target = { workspacePath: "synthetic/workspace", sessionId: "synthetic-session" };
      assert.equal(await port.model(target, " \n "), null);
      assert.equal((await port.model(target, " selected "))?.model, "selected");
      modelError = new Error("synthetic model failure");
      assert.equal(await port.model(target, "selected"), null);
    },
  );
});
