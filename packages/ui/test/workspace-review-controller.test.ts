// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { IStudioRuntimeService, StudioCommand } from "@knorvia/services";
import { WorkspaceReviewController } from "../src/studio/runtime/workspaceReviewController.js";
import {
  readReviewEdits,
  writeReviewEdits,
} from "../src/studio/runtime/workspaceReviewEditCache.js";
import { workspaceReviewFixture } from "../../services/test/studio-workspace-feedback-fixture.js";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
async function settled(controller: WorkspaceReviewController) {
  for (let i = 0; i < 200 && controller.getSnapshot().busy; i++) await sleep(5);
  assert.equal(controller.getSnapshot().busy, false);
}
test("unaccepted edits reload independently of Host draft and confirmed request, without automatic sending", async (t) => {
  const f = await workspaceReviewFixture(t);
  const draft = (await f.save()).reviewDraft!;
  const local = storage();
  const one = new WorkspaceReviewController(f.service, "review", "original", "step", local);
  one.activate();
  await settled(one);
  one.edit("comment", "retained unsaved edit");
  one.deactivate();
  const two = new WorkspaceReviewController(f.service, "review", "original", "step", local);
  two.activate();
  await settled(two);
  assert.equal(two.getSnapshot().edits.comment?.body, "retained unsaved edit");
  assert.equal(two.getSnapshot().draft?.comments[0]?.body, draft.comments[0]?.body);
  assert.equal(f.calls.length, 0);
  two.save();
  await settled(two);
  assert.equal(two.getSnapshot().draft?.comments[0]?.body, "retained unsaved edit");
  assert.deepEqual(two.getSnapshot().edits, {});
});

test("lost edit ACK retries its stable request and does not delete newer typing", async (t) => {
  const f = await workspaceReviewFixture(t);
  await f.save();
  const local = storage();
  let drop = true;
  const requests: StudioCommand[] = [];
  const transport = {
    timeline: f.service.timeline.bind(f.service),
    command: async (command: StudioCommand) => {
      requests.push(command);
      const result = await f.service.command(command);
      if (drop) {
        drop = false;
        throw new Error("lost ACK");
      }
      return result;
    },
  } as IStudioRuntimeService;
  const controller = new WorkspaceReviewController(transport, "review", "original", "step", local);
  controller.activate();
  await settled(controller);
  controller.edit("comment", "first edit");
  controller.save();
  await settled(controller);
  controller.edit("comment", "newer edit");
  controller.save();
  await settled(controller);
  assert.equal(requests[0]?.commandId, requests[1]?.commandId);
  assert.equal(controller.getSnapshot().edits.comment?.body, "newer edit");
  controller.save();
  await settled(controller);
  assert.equal(controller.getSnapshot().draft?.comments[0]?.body, "newer edit");
  assert.deepEqual(controller.getSnapshot().edits, {});
});

test("unknown storage format and another Host scope are preserved; write failure retains text", async (t) => {
  const f = await workspaceReviewFixture(t);
  const draft = (await f.save()).reviewDraft!;
  const local = storage();
  const key = `knorvia-workspace-review-edit:${draft.id}`;
  const unknown = JSON.stringify({ version: 9, valuable: "preserve" });
  local.values.set(key, unknown);
  assert.ok(readReviewEdits(local, draft).error);
  assert.ok(writeReviewEdits(local, draft, { comment: { body: "replace" } }));
  assert.equal(local.values.get(key), unknown);
  local.values.delete(key);
  writeReviewEdits(local, draft, { comment: { body: "draft" } });
  const other = { ...draft, id: "another-host-draft" };
  assert.deepEqual(readReviewEdits(local, other).edits, {});
  assert.ok(readReviewEdits(local, { ...draft, targetId: "other" }).error);
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  const controller = new WorkspaceReviewController(f.service, "review", "original", "step", broken);
  controller.activate();
  await settled(controller);
  controller.edit("comment", "still in memory");
  assert.equal(controller.getSnapshot().edits.comment?.body, "still in memory");
  assert.ok(controller.getSnapshot().cacheError);
  controller.save();
  await settled(controller);
  assert.equal(controller.getSnapshot().draft?.comments[0]?.body, "still in memory");
  assert.deepEqual(controller.getSnapshot().edits, {});
});

test("late old-target acknowledgement cannot update another controller or erase its drafts", async (t) => {
  const f = await workspaceReviewFixture(t);
  await f.save();
  const local = storage();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = {
    timeline: f.service.timeline.bind(f.service),
    command: async (command: StudioCommand) => {
      await wait;
      return f.service.command(command);
    },
  } as IStudioRuntimeService;
  const old = new WorkspaceReviewController(transport, "review", "original", "step", local);
  old.activate();
  await settled(old);
  old.edit("comment", "old draft");
  old.save();
  old.deactivate();
  const other = new WorkspaceReviewController(f.service, "other", "original-other", "step", local);
  other.activate();
  await settled(other);
  release();
  await sleep(30);
  assert.equal(other.getSnapshot().draft, undefined);
  assert.deepEqual(other.getSnapshot().edits, {});
  assert.equal(f.calls.length, 0);
});

test("two window caches cannot overwrite each other's unaccepted text", async (t) => {
  const f = await workspaceReviewFixture(t);
  const draft = (await f.save()).reviewDraft!;
  const local = storage();
  assert.equal(writeReviewEdits(local, draft, { comment: { body: "first window" } }, 0), undefined);
  const before = local.values.get(`knorvia-workspace-review-edit:${draft.id}`);
  assert.ok(writeReviewEdits(local, draft, { comment: { body: "second window" } }, 0));
  assert.equal(local.values.get(`knorvia-workspace-review-edit:${draft.id}`), before);
  assert.equal(readReviewEdits(local, draft).edits.comment?.body, "first window");
});

test("lost ACK followed by another window's save requires reload before newer text can replace it", async (t) => {
  const f = await workspaceReviewFixture(t);
  await f.save();
  const local = storage();
  let drop = true;
  const transport = {
    timeline: f.service.timeline.bind(f.service),
    command: async (command: StudioCommand) => {
      const result = await f.service.command(command);
      if (drop) {
        drop = false;
        throw new Error("lost ACK");
      }
      return result;
    },
  } as IStudioRuntimeService;
  const controller = new WorkspaceReviewController(transport, "review", "original", "step", local);
  controller.activate();
  await settled(controller);
  controller.edit("comment", "first edit");
  controller.save();
  await settled(controller);
  const draft = (await f.service.timeline("review")).reviewDrafts![0]!;
  await f.service.command({
    type: "workspace-review",
    action: "save-comment",
    commandId: crypto.randomUUID(),
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
    commentId: "comment",
    body: "other window's saved text",
  });
  controller.edit("comment", "newer local text");
  controller.save();
  await settled(controller);
  controller.save();
  await settled(controller);
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts![0]?.comments[0]?.body,
    "other window's saved text",
  );
  assert.equal(controller.getSnapshot().edits.comment?.body, "newer local text");
  assert.match(controller.getSnapshot().error ?? "", /重新读取/);
  controller.reload();
  await settled(controller);
  controller.save();
  await settled(controller);
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts![0]?.comments[0]?.body,
    "newer local text",
  );
});

test("another window's deleted comment retains local text until explicit local discard", async (t) => {
  const f = await workspaceReviewFixture(t);
  const draft = (await f.save()).reviewDraft!;
  const local = storage();
  const controller = new WorkspaceReviewController(f.service, "review", "original", "step", local);
  controller.activate();
  await settled(controller);
  controller.edit("comment", "keep this deleted-comment draft");
  await f.service.command({
    type: "workspace-review",
    action: "delete-comment",
    commandId: crypto.randomUUID(),
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
    commentId: "comment",
  });
  controller.reload();
  await settled(controller);
  assert.equal(controller.getSnapshot().draft?.comments.length, 0);
  assert.equal(controller.getSnapshot().edits.comment?.body, "keep this deleted-comment draft");
  controller.discard("comment");
  await settled(controller);
  assert.deepEqual(controller.getSnapshot().edits, {});
  assert.equal((await f.service.timeline("review")).reviewDrafts![0]?.comments.length, 0);
  assert.deepEqual(readReviewEdits(local, controller.getSnapshot().draft!).edits, {});
});
