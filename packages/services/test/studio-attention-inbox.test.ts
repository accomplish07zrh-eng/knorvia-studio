import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioInteraction } from "../src/studio-runtime/types.js";

const run = (id: string, state: StoredRun["state"] = "succeeded"): StoredRun => ({
  id,
  targetId: "source",
  kind: "chat",
  state,
  input: "Not projected into the inbox",
  createdAt: 1,
  updatedAt: 20,
  attempt: 1,
  resultKnown: true,
  checkpoint: { steps: {}, values: {}, completedRounds: 0 },
});
function service(db: StudioDatabase) {
  const denied = () => {
    throw new Error("Read/navigation must not invoke a provider, probe or workspace operation");
  };
  return new StudioRuntimeService({
    db,
    clock: { id: randomUUID, now: Date.now, delay: async () => {} },
    kernels: { adapter: denied, inspect: denied, manage: denied, dispose: async () => {} },
    workspaces: { prepare: denied, changes: denied, apply: denied },
    onDidChange: Event.None,
    notify: () => {},
  });
}

test("inbox reads background history beyond the recent window without probing or executing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-attention-history-"));
  const db = new StudioDatabase(join(root, "studio.sqlite"));
  const runtime = service(db);
  t.after(async () => {
    await runtime.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  });
  await runtime.command({
    commandId: "create",
    type: "create-conversation",
    id: "source",
    kernel: "codex",
    workspacePath: root,
  });
  db.transaction(() => {
    for (let index = 0; index < 151; index++)
      db.write(
        "run",
        `history-${index}`,
        run(`history-${index}`, index === 0 ? "failed" : "succeeded"),
        "source",
      );
    db.write("conversation", "other", {
      id: "other",
      kernel: "claude-code",
      workspacePath: root,
      title: "Other kernel",
      createdAt: 1,
      updatedAt: 1,
    });
    db.write("run", "background", { ...run("background", "waiting"), targetId: "other" }, "other");
    db.write(
      "turn",
      "pending-turn",
      {
        id: "pending-turn",
        runId: "background",
        stepId: "chat",
        attempt: 1,
        state: "waiting",
        kernel: "claude-code",
      },
      "background",
    );
    db.write<StudioInteraction>(
      "interaction",
      "pending",
      {
        id: "pending",
        runId: "background",
        turnId: "pending-turn",
        kernel: "claude-code",
        kind: "approval",
        title: "Approval required",
        status: "pending",
        choices: ["allow-once", "deny"],
      },
      "other",
    );
  });
  const before = await runtime.overview();
  assert.equal(
    before.runs.some((item) => item.id === "history-0"),
    false,
  );
  assert.equal(before.attention?.items.length, 152);
  assert.equal(
    (await runtime.timeline("source", undefined, "history-0")).runs.some(
      (item) => item.id === "history-0",
    ),
    true,
  );
  await assert.rejects(runtime.timeline("other", undefined, "history-0"), /不属于/);
  assert.deepEqual(before.attention?.counts, { pending: 1, failed: 1, completed: 150 });
  assert.equal(
    before.attention?.items.find((item) => item.id === "history-0")?.workspacePath,
    root,
  );
  const pending = before.attention!.items.find((item) => item.object === "interaction")!;
  await runtime.command({
    commandId: "read-pending",
    type: "attention-read",
    object: "interaction",
    id: pending.id,
    version: pending.version,
  });
  assert.equal(db.read<StudioInteraction>("interaction", "pending")?.status, "pending");
  assert.equal(db.read<StoredRun>("run", "background")?.state, "waiting");
  assert.equal((await runtime.overview()).attention?.counts.pending, 1);
  assert.equal(JSON.stringify(before.attention).includes("Not projected into the inbox"), false);
});

test("durable read receipts dedupe, reject foreign payloads and preserve a newer attempt after restart", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-attention-replay-"));
  const path = join(root, "studio.sqlite");
  const db = new StudioDatabase(path);
  const runtime = service(db);
  t.after(async () => {
    await runtime.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  });
  await runtime.command({
    commandId: "create",
    type: "create-conversation",
    id: "source",
    kernel: "codex",
    workspacePath: root,
  });
  db.transaction(() => db.write("run", "failed", run("failed", "failed"), "source"));
  const original = (await runtime.overview()).attention!.items[0]!;
  const command = {
    commandId: "read-original",
    type: "attention-read",
    object: "run",
    id: original.id,
    version: original.version,
  } as const;
  const [first, duplicate] = await Promise.all([
    runtime.command(command),
    runtime.command(command),
  ]);
  assert.deepEqual(first, duplicate);
  assert.equal((await runtime.overview()).attention?.items[0]?.unread, false);
  db.transaction(() => db.write("run", "failed", run("failed", "failed"), "source"));
  assert.equal((await runtime.overview()).attention?.items.length, 1);
  assert.equal((await runtime.overview()).attention?.items[0]?.unread, false);
  db.transaction(() =>
    db.write("run", "failed", { ...run("failed", "failed"), attempt: 2 }, "source"),
  );
  const newer = (await runtime.overview()).attention!.items[0]!;
  assert.notEqual(newer.version, original.version);
  assert.equal(newer.unread, true);
  assert.deepEqual(await runtime.command(command), first);
  await runtime.command({ ...command, commandId: "late-old-read" });
  assert.equal((await runtime.overview()).attention?.items[0]?.unread, true);
  await assert.rejects(runtime.command({ ...command, version: newer.version }), /同一请求编号/);
  await assert.rejects(
    runtime.command({ ...command, commandId: "foreign", id: "foreign-task" }),
    /不存在/,
  );
  await runtime.disposeAllAndWait();
  const reopened = service(new StudioDatabase(path));
  try {
    assert.equal((await reopened.overview()).attention?.items[0]?.unread, true);
    await reopened.command({ ...command, commandId: "read-new", version: newer.version });
    assert.equal((await reopened.overview()).attention?.counts.failed, 0);
  } finally {
    await reopened.disposeAllAndWait();
  }
});

test("retired/deleted targets remain historical and stale attempt approvals are excluded", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-attention-retired-"));
  const db = new StudioDatabase(join(root, "studio.sqlite"));
  const runtime = service(db);
  t.after(async () => {
    await runtime.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  });
  db.transaction(() => {
    db.write("run", "old", run("old", "interrupted"), "source");
    db.write(
      "turn",
      "old-turn",
      {
        id: "old-turn",
        runId: "old",
        stepId: "chat",
        attempt: 1,
        state: "failed",
        kernel: "gemini-cli",
      },
      "old",
    );
    db.write("run", "active", { ...run("active", "waiting"), attempt: 2 }, "source");
    db.write(
      "turn",
      "stale-turn",
      {
        id: "stale-turn",
        runId: "active",
        stepId: "chat",
        attempt: 1,
        state: "waiting",
        kernel: "codex",
      },
      "active",
    );
    db.write<StudioInteraction>(
      "interaction",
      "stale",
      {
        id: "stale",
        runId: "active",
        turnId: "stale-turn",
        kind: "approval",
        title: "Stale approval",
        status: "pending",
      },
      "source",
    );
  });
  const items = (await runtime.overview()).attention!.items;
  assert.equal(items.length, 1);
  assert.equal(items[0]?.targetDeleted, true);
  assert.equal(items[0]?.kernelUnavailable, true);
  assert.deepEqual(items[0]?.kernels, ["gemini-cli"]);
  assert.equal(db.read<StudioInteraction>("interaction", "stale")?.status, "pending");
});

test("group and workflow history keep frozen source kernels and projects after definition changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-attention-definitions-"));
  const db = new StudioDatabase(join(root, "studio.sqlite"));
  const runtime = service(db);
  t.after(async () => {
    await runtime.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  });
  const group = {
    id: "group",
    name: "Synthetic group",
    goal: "",
    members: ["codex", "claude-code"] as const,
    host: "codex",
    sharedSummary: "",
    mode: "task",
    workspaceMode: "isolated",
    workspacePath: "/original/group",
    createdAt: 1,
    updatedAt: 1,
  };
  const workflow = {
    id: "workflow",
    name: "Synthetic workflow",
    workspacePath: "/original/workflow",
    nodes: [{ id: "agent", data: { kind: "agent", kernel: "acp:removed" } }],
    edges: [],
    updatedAt: 1,
  };
  db.transaction(() => {
    db.write("group", group.id, {
      ...group,
      workspacePath: "/changed/group",
      members: ["knorvia"],
    });
    db.write("workflow", workflow.id, {
      ...workflow,
      workspacePath: "/changed/workflow",
      nodes: [],
    });
    db.write(
      "run",
      "group-run",
      { ...run("group-run"), targetId: group.id, kind: "group", definition: group },
      group.id,
    );
    db.write(
      "run",
      "workflow-run",
      {
        ...run("workflow-run", "failed"),
        targetId: workflow.id,
        kind: "workflow",
        definition: workflow,
      },
      workflow.id,
    );
  });
  const items = (await runtime.overview()).attention!.items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.find((item) => item.id === "group-run")?.kernels, [
    "codex",
    "claude-code",
  ]);
  assert.equal(items.find((item) => item.id === "group-run")?.workspacePath, "/original/group");
  assert.deepEqual(items.find((item) => item.id === "workflow-run")?.kernels, ["acp:removed"]);
  assert.equal(
    items.find((item) => item.id === "workflow-run")?.workspacePath,
    "/original/workflow",
  );
  assert.equal(items.find((item) => item.id === "workflow-run")?.kernelUnavailable, true);
});
