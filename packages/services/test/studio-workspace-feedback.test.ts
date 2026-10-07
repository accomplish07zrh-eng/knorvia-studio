// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { workspaceReviewFixture as fixture } from "./studio-workspace-feedback-fixture.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { Event } from "@knorvia/rpc";
import { reviewAnchorContext } from "../src/studio-runtime/domain/workspaceReviewPolicy.js";
import type { StudioWorkspaceChange } from "../src/studio-runtime/contract.js";

test("durable anchored draft and confirmed feedback reuse the original member/session/snapshot once", async (t) => {
  const f = await fixture(t);
  let draft = (await f.save()).reviewDraft!;
  assert.equal(draft.comments[0]?.context.includes("new"), true);
  assert.equal((await f.service.timeline("another-task")).reviewDrafts?.length, 0);
  draft = (
    await f.service.command({
      type: "workspace-review",
      action: "prepare",
      commandId: randomUUID(),
      runId: "original",
      stepId: "step",
      draftId: draft.id,
      baseRevision: draft.revision,
    })
  ).reviewDraft!;
  const command = {
    type: "workspace-review" as const,
    action: "send" as const,
    commandId: draft.preview!.commandId,
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
    previewId: draft.preview!.id,
  };
  const receipt = await f.service.command(command);
  for (let i = 0; i < 150 && f.calls.length === 0; i++) {
    f.service.tick();
    await sleep(10);
  }
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.kernel, "codex");
  assert.equal(f.calls[0]?.nativeSessionId, "native-original");
  assert.equal(f.calls[0]?.conversationId, "group:review:codex");
  assert.equal(f.calls[0]?.workspacePath, f.working);
  assert.equal((await f.service.command(command)).id, receipt.id);
  assert.equal(f.calls.length, 1);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "dirty source\nold\n");
});

test("changed snapshot/source and stale revisions preserve draft without relocating anchors", async (t) => {
  const f = await fixture(t);
  const draft = (await f.save()).reviewDraft!;
  await assert.rejects(f.save("other window"), /版本/);
  await fs.writeFile(join(f.working, "a.txt"), "inserted\ndirty source\nnew\n");
  await assert.rejects(
    f.service.command({
      type: "workspace-review",
      action: "prepare",
      commandId: randomUUID(),
      runId: "original",
      stepId: "step",
      baseRevision: draft.revision,
      draftId: draft.id,
    }),
    /文件.*变化/,
  );
  const saved = (await f.service.timeline("review")).reviewDrafts![0]!;
  assert.equal(saved.comments[0]?.anchor.startLine, 2);
  assert.equal(saved.comments[0]?.body, "please correct");
  assert.equal(f.calls.length, 0);
});

test("review persistence and receipts redact credentials and reject unsafe paths or missing evidence", async (t) => {
  const f = await fixture(t);
  const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
  await f.save(`apiKey=${secret}`);
  const rows = JSON.stringify([f.db.list("workspace-review-draft"), f.db.list("command")]);
  assert.equal(rows.includes(secret), false);
  for (const path of ["../a.txt", ".env", "id_rsa"]) {
    await assert.rejects(
      f.service.command({
        type: "workspace-review",
        action: "save-comment",
        commandId: randomUUID(),
        runId: "original",
        stepId: "step",
        baseRevision: 1,
        commentId: "bad",
        body: "x",
        anchor: { path, side: "old", startLine: 1, endLine: 1, version: f.changes[0]!.version! },
      }),
    );
  }
});

test("deleted original session cannot silently create a new session; draft survives Host reopening", async (t) => {
  const f = await fixture(t);
  const draft = (await f.save()).reviewDraft!;
  f.db.transaction(() => f.db.remove("session", `group:review:codex:${f.working}`));
  await assert.rejects(
    f.service.command({
      type: "workspace-review",
      action: "prepare",
      commandId: randomUUID(),
      runId: "original",
      stepId: "step",
      draftId: draft.id,
      baseRevision: draft.revision,
    }),
    /原会话/,
  );
  assert.equal((await f.service.timeline("review")).reviewDrafts![0]!.id, draft.id);
  const edited = await f.service.command({
    commandId: randomUUID(),
    type: "workspace-review",
    action: "save-comment",
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
    commentId: "comment",
    body: "retain editable notes while original session is unavailable",
  });
  assert.equal(
    edited.reviewDraft?.comments[0]?.body,
    "retain editable notes while original session is unavailable",
  );
  assert.equal(f.calls.length, 0);
});

test("old/new, multiline, added/deleted and binary or missing versions have honest anchors", () => {
  const version = {
    beforeHash: "a".repeat(64),
    afterHash: "b".repeat(64),
    sourceHash: "a".repeat(64),
  };
  const change: StudioWorkspaceChange = {
    path: "a.txt",
    kind: "modified",
    before: "old\nsecond\n",
    after: "new\nsecond\n",
    version,
  };
  for (const side of ["old", "new"] as const) {
    const context = reviewAnchorContext(
      { path: "a.txt", side, startLine: 1, endLine: 2, version },
      [change],
    );
    assert.match(context, side === "old" ? /old/ : /new/);
    assert.match(context, /second/);
  }
  for (const [kind, side] of [
    ["added", "new"],
    ["deleted", "old"],
  ] as const) {
    const item = {
      ...change,
      kind,
      before: kind === "added" ? null : change.before,
      after: kind === "deleted" ? null : change.after,
      version: {
        ...version,
        beforeHash: kind === "added" ? null : version.beforeHash,
        afterHash: kind === "deleted" ? null : version.afterHash,
      },
    };
    assert.ok(
      reviewAnchorContext(
        { path: "a.txt", side, startLine: 1, endLine: 1, version: item.version },
        [item],
      ),
    );
    assert.throws(
      () =>
        reviewAnchorContext(
          {
            path: "a.txt",
            side: side === "old" ? "new" : "old",
            startLine: 1,
            endLine: 1,
            version: item.version,
          },
          [item],
        ),
      /没有文件/,
    );
  }
  for (const item of [
    { ...change, binary: true },
    { ...change, version: undefined },
  ])
    assert.throws(() =>
      reviewAnchorContext({ path: "a.txt", side: "new", startLine: 1, endLine: 1, version }, [
        item,
      ]),
    );
});

async function prepared(f: Awaited<ReturnType<typeof fixture>>) {
  const saved = (await f.save()).reviewDraft!;
  return (
    await f.service.command({
      commandId: randomUUID(),
      type: "workspace-review",
      action: "prepare",
      runId: "original",
      stepId: "step",
      draftId: saved.id,
      baseRevision: saved.revision,
    })
  ).reviewDraft!;
}
test("source changes, original identity changes and unknown draft formats fail without overwrite", async (t) => {
  const f = await fixture(t);
  const draft = await prepared(f);
  const send = {
    commandId: draft.preview!.commandId,
    type: "workspace-review" as const,
    action: "send" as const,
    previewId: draft.preview!.id,
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
  };
  await fs.writeFile(join(f.source, "a.txt"), "later user data");
  await assert.rejects(f.service.command(send), /文件已变化/);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "later user data");
  await fs.writeFile(join(f.source, "a.txt"), "dirty source\nold\n");
  f.db.transaction(() =>
    f.db.write("session", `group:review:codex:${f.working}`, {
      id: `group:review:codex:${f.working}`,
      nativeSessionId: "new-session",
      workspacePath: f.working,
    }),
  );
  await assert.rejects(f.service.command(send), /原会话/);
  assert.equal(f.calls.length, 0);
  const unknown = { schema: 7, id: "future", precious: "preserve" };
  f.db.transaction(() =>
    f.db.write("workspace-review-draft", JSON.stringify(["original", "step"]), unknown, "review"),
  );
  await assert.rejects(f.save(), /未知评审/);
  assert.deepEqual(
    f.db.read("workspace-review-draft", JSON.stringify(["original", "step"])),
    unknown,
  );
});

test("queued cancellation, known adapter failure and restart keep drafts and existing run ownership", async (t) => {
  const f = await fixture(t, {
    result: { status: "failed", text: "", error: "fixture failure", resultKnown: true },
  });
  const draft = await prepared(f);
  const receipt = await f.service.command({
    commandId: draft.preview!.commandId,
    type: "workspace-review",
    action: "send",
    previewId: draft.preview!.id,
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
  });
  for (let i = 0; i < 100; i++) {
    f.service.tick();
    if (
      (await f.service.timeline("review")).runs.find((run) => run.id === receipt.id)?.state ===
      "failed"
    )
      break;
    await sleep(5);
  }
  assert.equal(f.calls.length, 1);
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts![0]!.lastDelivery?.state,
    "failed",
  );
  await f.service.disposeAllAndWait();
  const db = new StudioDatabase(join(f.root, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    workspaces: f.workspaces,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async () => {
          throw new Error("must not dispatch after restart");
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(() => service.disposeAllAndWait());
  assert.equal(
    (await service.timeline("review")).reviewDrafts![0]!.comments[0]!.body,
    "please correct",
  );
  const run = db.read<Record<string, unknown>>("run", receipt.id)!;
  db.transaction(() => {
    db.write(
      "run",
      receipt.id,
      { ...run, state: "running", owner: "dead-owner", resultKnown: false },
      "review",
    );
    db.write("active", receipt.id, { id: receipt.id, targetId: "review" });
    const turn = db.list<Record<string, unknown>>("turn", { scope: receipt.id, limit: 1 })[0]!;
    db.write("turn", String(turn.id), { ...turn, state: "running" }, receipt.id);
  });
  service.tick();
  assert.equal(
    (await service.timeline("review")).reviewDrafts![0]!.lastDelivery?.state,
    "interrupted",
  );
  await assert.rejects(
    service.command({
      commandId: randomUUID(),
      type: "resume",
      runId: receipt.id,
      retryUncertain: false,
    }),
    /不确定/,
  );
  await service.disposeAllAndWait();
});

test("cancelling a queued feedback does not call the Agent or discard comments", async (t) => {
  const f = await fixture(t);
  const draft = await prepared(f);
  const sent = await f.service.command({
    commandId: draft.preview!.commandId,
    type: "workspace-review",
    action: "send",
    previewId: draft.preview!.id,
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
  });
  await f.service.command({ commandId: randomUUID(), type: "cancel", runId: sent.id });
  f.service.tick();
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts![0]!.lastDelivery?.state,
    "cancelled",
  );
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts![0]!.comments[0]?.body,
    "please correct",
  );
});

test("concurrent identical save admission returns one draft and one command receipt", async (t) => {
  const f = await fixture(t);
  const command = {
    commandId: randomUUID(),
    type: "workspace-review" as const,
    action: "save-comment" as const,
    runId: "original",
    stepId: "step",
    baseRevision: 0,
    commentId: "same",
    body: "one comment",
    anchor: {
      path: "a.txt",
      side: "new" as const,
      startLine: 2,
      endLine: 2,
      version: f.changes[0]!.version!,
    },
  };
  const [one, two] = await Promise.all([f.service.command(command), f.service.command(command)]);
  assert.equal(one.id, two.id);
  assert.equal(one.reviewDraft?.comments.length, 1);
  assert.equal(two.reviewDraft?.revision, 1);
  assert.equal(f.db.list("command").length, 1);
});

test("selected code credentials never enter persisted review or receipts; hidden messages are not attached", async (t) => {
  const f = await fixture(t);
  const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
  const privateBody = "FIXTURE_PRIVATE_KEY_BODY_NEVER_PERSIST";
  await fs.writeFile(
    join(f.working, "a.txt"),
    `apiKey=${secret}\n-----BEGIN OPENSSH PRIVATE KEY-----\n${privateBody}\n-----END OPENSSH PRIVATE KEY-----\n`,
  );
  const changes = await f.service.workspaceChanges({ runId: "original", stepId: "step" });
  f.db.transaction(() => {
    for (const kind of ["reasoning", "tool"]) {
      f.db.write(
        "message",
        kind,
        {
          id: kind,
          targetId: "review",
          runId: "original",
          sender: "codex",
          kind,
          text: `fixture-hidden-${kind}`,
          createdAt: 1,
          updatedAt: 1,
        },
        "review",
      );
    }
  });
  let draft = (
    await f.service.command({
      commandId: randomUUID(),
      type: "workspace-review",
      action: "save-comment",
      runId: "original",
      stepId: "step",
      baseRevision: 0,
      commentId: "code",
      body: `token=${secret}`,
      anchor: {
        path: "a.txt",
        side: "new",
        startLine: 1,
        endLine: 4,
        version: changes[0]!.version!,
      },
      reasoning: "fixture-unrequested-hidden-payload",
    })
  ).reviewDraft!;
  draft = (
    await f.service.command({
      commandId: randomUUID(),
      type: "workspace-review",
      action: "prepare",
      runId: "original",
      stepId: "step",
      draftId: draft.id,
      baseRevision: draft.revision,
    })
  ).reviewDraft!;
  const records = JSON.stringify([f.db.list("workspace-review-draft"), f.db.list("command")]);
  for (const marker of [
    secret,
    privateBody,
    "fixture-hidden-reasoning",
    "fixture-hidden-tool",
    "fixture-unrequested-hidden-payload",
  ]) {
    assert.equal(records.includes(marker), false);
    assert.equal(draft.preview!.summary.includes(marker), false);
  }
  await f.service.disposeAllAndWait();
  for (const name of await fs.readdir(f.root)) {
    if (!name.startsWith("runtime.sqlite")) continue;
    const bytes = await fs.readFile(join(f.root, name));
    assert.equal(bytes.includes(secret), false);
    assert.equal(bytes.includes(privateBody), false);
  }
});

test("independent Hosts with the same business IDs keep distinct project-bound draft identities", async (t) => {
  const a = await fixture(t);
  const b = await fixture(t);
  const [one, two] = await Promise.all([a.save("first project"), b.save("second project")]);
  assert.notEqual(one.reviewDraft?.id, two.reviewDraft?.id);
  assert.notEqual(one.reviewDraft?.projectKey, two.reviewDraft?.projectKey);
  assert.equal(
    (await a.service.timeline("review")).reviewDrafts![0]?.comments[0]?.body,
    "first project",
  );
  assert.equal(
    (await b.service.timeline("review")).reviewDrafts![0]?.comments[0]?.body,
    "second project",
  );
});

test("legacy turn fallback requires an actual nonempty native session ID", async (t) => {
  for (const nativeSessionId of [undefined, ""]) {
    const f = await fixture(t);
    f.db.transaction(() => {
      const turn = f.db.read<Record<string, unknown>>("turn", "turn")!;
      delete turn.nativeSessionId;
      f.db.write("turn", "turn", turn, "original");
      f.db.write("session", `group:review:codex:${f.working}`, {
        id: `group:review:codex:${f.working}`,
        workspacePath: f.working,
        nativeSessionId,
      });
    });
    await assert.rejects(f.save(), /原会话/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.db.list("workspace-review-draft").length, 0);
    f.db.transaction(() =>
      f.db.write("session", `group:review:codex:${f.working}`, {
        id: `group:review:codex:${f.working}`,
        workspacePath: f.working,
        nativeSessionId: "native-original",
      }),
    );
    assert.equal((await f.save()).reviewDraft?.kernel, "codex");
  }
});
