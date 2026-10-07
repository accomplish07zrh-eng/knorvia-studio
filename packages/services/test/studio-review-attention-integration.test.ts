// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { workspaceReviewFixture } from "./studio-workspace-feedback-fixture.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { confirmPreparedWorkspaceReview } from "../src/studio-runtime/contract.example.js";
import type {
  StudioCommand,
  StudioKernelAdapter,
  StudioReviewDraft,
} from "../src/studio-runtime/contract.js";

async function prepare(f: Awaited<ReturnType<typeof workspaceReviewFixture>>) {
  const saved = (await f.save("Correct the selected line, retaining the original context"))
    .reviewDraft!;
  return (
    await f.service.command({
      commandId: randomUUID(),
      type: "workspace-review",
      action: "prepare",
      runId: saved.runId,
      stepId: saved.stepId,
      draftId: saved.id,
      baseRevision: saved.revision,
    })
  ).reviewDraft!;
}

async function until(runtime: StudioRuntimeService, predicate: () => Promise<boolean>) {
  for (let index = 0; index < 200; index++) {
    runtime.tick();
    if (await predicate()) return;
    await sleep(10);
  }
  assert.fail("controlled runtime did not reach the expected state");
}

function reopen(
  f: Awaited<ReturnType<typeof workspaceReviewFixture>>,
  adapter?: StudioKernelAdapter,
) {
  const db = new StudioDatabase(join(f.root, "runtime.sqlite"));
  const deny = () => {
    throw new Error("read/replay cannot probe, manage or dispatch a provider");
  };
  const runtime = new StudioRuntimeService({
    db,
    workspaces: f.workspaces,
    clock: {
      id: randomUUID,
      now: Date.now,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels: {
      adapter: adapter ? () => adapter : deny,
      inspect: deny,
      manage: deny,
      dispose: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  return { db, runtime };
}

test("confirmed feedback yields one original-Agent delivery and a durable focused read receipt", async (t) => {
  const f = await workspaceReviewFixture(t);
  const draft = await prepare(f);
  const command = confirmPreparedWorkspaceReview(draft);
  const [one, two] = await Promise.all([f.service.command(command), f.service.command(command)]);
  assert.deepEqual(one, two);
  await until(f.service, async () =>
    (await f.service.overview()).attention!.items.some(
      (item) => item.object === "run" && item.id === one.id && item.state === "succeeded",
    ),
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.kernel, "codex");
  assert.equal(f.calls[0]!.nativeSessionId, "native-original");
  assert.equal(f.calls[0]!.conversationId, "group:review:codex");
  assert.equal(f.calls[0]!.workspacePath, f.working);
  assert.equal(f.calls[0]!.permission, "ask");
  assert.match(f.calls[0]!.text, /Correct the selected line/);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "dirty source\nold\n");

  const completion = (await f.service.overview()).attention!.items.find(
    (item) => item.id === one.id,
  )!;
  assert.equal(completion.targetId, "review");
  assert.equal(completion.targetKind, "group");
  assert.equal(completion.unread, true);
  assert.ok(completion.kernels.includes("codex"));
  const before = await f.service.timeline("review");
  assert.equal(before.reviewDrafts![0]!.lastDelivery?.runId, one.id);
  assert.equal(JSON.stringify(before).includes("workspaceFeedback"), false);
  const delivered = f.db.read<Record<string, unknown>>("run", one.id)!;
  // 增加较新历史以实际越过最近窗口；聚焦读取必须仍定位同一反馈与草稿。
  f.db.transaction(() => {
    for (let index = 0; index < 125; index++)
      f.db.write(
        "run",
        `later-${index}`,
        {
          ...delivered,
          id: `later-${index}`,
          updatedAt: Date.now() + index,
        },
        "review",
      );
  });
  assert.equal(
    (await f.service.timeline("review")).runs.some((run) => run.id === one.id),
    false,
  );
  const focused = await f.service.timeline("review", undefined, one.id);
  assert.equal(
    focused.runs.some((run) => run.id === one.id),
    true,
  );
  assert.equal(focused.reviewDrafts![0]!.id, draft.id);
  assert.equal(JSON.stringify(focused).includes("workspaceFeedback"), false);
  const read: StudioCommand = {
    commandId: randomUUID(),
    type: "attention-read",
    object: "run",
    id: one.id,
    version: completion.version,
  };
  const [readOne, readTwo] = await Promise.all([f.service.command(read), f.service.command(read)]);
  assert.deepEqual(readOne, readTwo);
  assert.equal(
    (await f.service.overview()).attention!.items.find((item) => item.id === one.id)!.unread,
    false,
  );
  assert.equal((await f.service.command(command)).id, one.id);
  assert.equal(f.calls.length, 1);

  await f.service.disposeAllAndWait();
  const reopened = reopen(f);
  try {
    assert.deepEqual(await reopened.runtime.command(read), readOne);
    assert.equal((await reopened.runtime.command(command)).id, one.id);
    assert.equal(
      (await reopened.runtime.overview()).attention!.items.find((item) => item.id === one.id)!
        .unread,
      false,
    );
    const restored = (await reopened.runtime.timeline("review", undefined, one.id))
      .reviewDrafts![0]!;
    assert.equal(restored.id, draft.id);
    assert.equal(restored.comments[0]!.body, draft.comments[0]!.body);
    assert.equal(restored.lastDelivery?.state, "succeeded");
    assert.equal(f.calls.length, 1);
  } finally {
    await reopened.runtime.disposeAllAndWait();
  }
});

test("reading a real feedback approval cannot answer or wake its original Agent", async (t) => {
  const f = await workspaceReviewFixture(t);
  const draft: StudioReviewDraft = await prepare(f);
  await f.service.disposeAllAndWait();
  let dispatches = 0;
  let approvalSettled = false;
  const controlled = reopen(f, {
    run: async (turn, sink) => {
      dispatches++;
      assert.equal(turn.kernel, "codex");
      assert.equal(turn.nativeSessionId, "native-original");
      const answer = await sink.ask({
        id: "feedback-approval",
        kind: "approval",
        title: "Review this file operation",
        choices: ["allow-once", "deny"],
      });
      approvalSettled = true;
      assert.equal(answer.decision, "allow-once");
      return {
        status: "succeeded",
        text: "approved fixture delivery",
        resultKnown: true,
        nativeSessionId: "native-original",
      };
    },
  });
  try {
    const sent = await controlled.runtime.command(confirmPreparedWorkspaceReview(draft));
    await until(controlled.runtime, async () =>
      (await controlled.runtime.overview()).attention!.items.some(
        (item) => item.runId === sent.id && item.object === "interaction",
      ),
    );
    const pending = (await controlled.runtime.overview()).attention!.items.find(
      (item) => item.runId === sent.id && item.object === "interaction",
    )!;
    assert.equal(pending.category, "pending");
    assert.equal(pending.interactionKind, "approval");
    const read: StudioCommand = {
      commandId: randomUUID(),
      type: "attention-read",
      object: "interaction",
      id: pending.id,
      version: pending.version,
    };
    await controlled.runtime.command(read);
    await controlled.runtime.command(read);
    const waiting = await controlled.runtime.timeline("review", undefined, sent.id);
    assert.equal(waiting.runs.find((run) => run.id === sent.id)!.state, "waiting");
    assert.equal(waiting.interactions.find((item) => item.id === pending.id)!.status, "pending");
    assert.equal(approvalSettled, false);
    assert.equal(dispatches, 1);
    assert.equal((await controlled.runtime.overview()).attention!.counts.pending, 1);
    assert.equal(waiting.reviewDrafts![0]!.lastDelivery?.runId, sent.id);
    await controlled.runtime.command({
      commandId: randomUUID(),
      type: "answer",
      interactionId: pending.id,
      answer: { decision: "allow-once" },
    });
    await until(controlled.runtime, async () =>
      (await controlled.runtime.overview()).attention!.items.some(
        (item) => item.id === sent.id && item.category === "completed",
      ),
    );
    assert.equal(approvalSettled, true);
    assert.equal(dispatches, 1);
    assert.equal((await controlled.runtime.overview()).attention!.counts.pending, 0);
    assert.equal(
      (await controlled.runtime.overview()).attention!.items.find((item) => item.id === sent.id)!
        .unread,
      true,
    );
    assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "dirty source\nold\n");
  } finally {
    await controlled.runtime.disposeAllAndWait();
  }
});

test("failed original-Agent feedback stays editable and a late read cannot acknowledge a later event", async (t) => {
  const f = await workspaceReviewFixture(t, {
    result: { status: "failed", text: "", error: "controlled rejection", resultKnown: true },
  });
  const draft = await prepare(f);
  const sent = await f.service.command(confirmPreparedWorkspaceReview(draft));
  await until(f.service, async () =>
    (await f.service.overview()).attention!.items.some(
      (item) => item.id === sent.id && item.category === "failed",
    ),
  );
  const failure = (await f.service.overview()).attention!.items.find(
    (item) => item.id === sent.id,
  )!;
  assert.equal(f.calls.length, 1);
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts![0]!.lastDelivery?.state,
    "failed",
  );
  const row = f.db.read<Record<string, unknown>>("run", sent.id)!;
  f.db.transaction(() =>
    f.db.write("run", sent.id, { ...row, updatedAt: Number(row.updatedAt) + 1 }, "review"),
  );
  await f.service.command({
    commandId: randomUUID(),
    type: "attention-read",
    object: "run",
    id: sent.id,
    version: failure.version,
  });
  assert.equal(
    (await f.service.overview()).attention!.items.find((item) => item.id === sent.id)!.unread,
    true,
  );
  const current = (await f.service.timeline("review")).reviewDrafts![0]!;
  const edited = await f.service.command({
    commandId: randomUUID(),
    type: "workspace-review",
    action: "save-comment",
    runId: current.runId,
    stepId: current.stepId,
    draftId: current.id,
    baseRevision: current.revision,
    commentId: current.comments[0]!.id,
    body: "Revise the draft after the failed delivery",
  });
  assert.equal(edited.reviewDraft!.comments[0]!.body, "Revise the draft after the failed delivery");
  assert.equal(f.calls.length, 1);
});
