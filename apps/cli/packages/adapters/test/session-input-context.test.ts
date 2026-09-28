// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inputFixture,
  message,
  now,
  otherSession,
  part,
  session,
} from "./session-input-fixture.js";

type Fixture = Awaited<ReturnType<typeof inputFixture>>;
function references(...ids: string[]): Record<string, unknown> {
  return {
    inputIntent: {
      sharedContextRefs: ids.map((context_id) => ({ kind: "shared_context_import", context_id })),
    },
  };
}
async function entry(f: Fixture, id: string, contextId: string, status: unknown, created = 5) {
  await f.store.saveSessionEntry({
    id,
    sessionID: session,
    type: "v4/shared_context_import",
    time: { created, updated: created },
    data: { contextId, status, custom: { kept: true } },
  });
}
function storedEntry(f: Fixture, id: string) {
  const row = f.rows("session_entry").find((item) => item.id === id)!;
  return { row, data: JSON.parse(String(row.data)) as Record<string, unknown> };
}

// All cases below describe preserved behavior, including duplicate-reference rejection.
// The intentional automatic-rollback and transaction-yield repairs are tested separately.
test("pending and reserved contexts attach atomically while preserving entry and message metadata", async (t) => {
  const f = await inputFixture(t);
  for (const status of ["pending", "reserved"]) {
    const inputId = `input-${status}`;
    const contextId = `context-${status}`;
    await f.add({ id: inputId });
    await entry(f, `entry-${status}`, contextId, status);
    await f.store.saveMessage(
      message(`context-message-${status}`, {
        contextId,
        sharedContextStatus: status,
        extra: { retained: true },
      }),
    );
    await f.promote(inputId, message(`prompt-${status}`, references(contextId)), [
      part(`part-${status}`, `prompt-${status}`),
    ]);
    const saved = storedEntry(f, `entry-${status}`);
    assert.equal(saved.row.time_created, 5);
    assert.equal(saved.row.time_updated, now);
    assert.deepEqual(saved.data, {
      contextId,
      status: "attached",
      custom: { kept: true },
      attachedMessageId: `prompt-${status}`,
    });
    const context = (await f.store.messages({ sessionID: session })).find(
      (item) => item.info.id === `context-message-${status}`,
    )!;
    assert.deepEqual(context.info.metadata, {
      contextId,
      sharedContextStatus: "attached",
      extra: { retained: true },
    });
    assert.equal((await f.store.getSessionInputById(inputId))!.status, "promoted");
  }
  assert.equal(f.rows("session").find((row) => row.id === session)!.time_updated, now);
  assert.equal(f.db.isTransaction, false);
});

test("a context entry may attach without an existing context message", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "entry", "context", "pending");
  await f.promote("input", message("input-message", references("context")));
  assert.equal(storedEntry(f, "entry").data.status, "attached");
  assert.deepEqual(
    f.rows("message").map((row) => row.id),
    ["input-message"],
  );
  assert.equal((await f.store.getSessionInputById("input"))!.status, "promoted");
});

test("only valid reference objects under metadata.inputIntent.sharedContextRefs are considered", async (t) => {
  const f = await inputFixture(t);
  const ref = { kind: "shared_context_import", context_id: "missing" };
  await f.add({
    payload: { text: "first", conversationInputIntent: { sharedContextRefs: [ref] } },
  });
  await f.promote(
    "input",
    message("input-message", {
      sharedContextRefs: [ref],
      conversationInputIntent: { sharedContextRefs: [ref] },
      inputIntent: {
        sharedContextRefs: [
          null,
          42,
          "context",
          [],
          {},
          { ...ref, kind: "other" },
          { ...ref, context_id: 3 },
        ],
      },
    }),
  );
  assert.equal((await f.store.getSessionInputById("input"))!.status, "promoted");
  assert.equal(f.rows("session_entry").length, 0);
});

test("non-array shared-context references are ignored", async (t) => {
  const f = await inputFixture(t);
  for (const [index, value] of [
    null,
    "context",
    { kind: "shared_context_import", context_id: "missing" },
  ].entries()) {
    await f.add({ id: `input-${index}` });
    await f.promote(
      `input-${index}`,
      message(`message-${index}`, {
        inputIntent: { sharedContextRefs: value },
      }),
      [],
    );
    assert.equal((await f.store.getSessionInputById(`input-${index}`))!.status, "promoted");
  }
  assert.equal(f.rows("session_entry").length, 0);
});

test("a missing context entry rejects even when a context message exists", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.store.saveMessage(
    message("context-message", { contextId: "missing", sharedContextStatus: "pending" }),
  );
  const before = f.snapshot();
  await assert.rejects(f.promote("input", message("input-message", references("missing"))), {
    message: "shared context import is missing",
  });
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("non-attachable shared-context statuses reject without modifying any row", async (t) => {
  const f = await inputFixture(t);
  for (const [index, status] of ["attached", "expired", null].entries()) {
    const id = `context-${index}`;
    await f.add({ id: `input-${index}` });
    await entry(f, `entry-${index}`, id, status);
    const before = f.snapshot();
    await assert.rejects(
      f.promote(`input-${index}`, message(`message-${index}`, references(id)), []),
      {
        message: "shared context import is no longer attachable",
      },
    );
    assert.deepEqual(f.snapshot(), before);
  }
  assert.equal(f.db.isTransaction, false);
});

test("stored context status retains its existing string-conversion acceptance", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "legacy-entry", "legacy", ["pending"]);
  await f.promote("input", message("input-message", references("legacy")));
  assert.equal(storedEntry(f, "legacy-entry").data.status, "attached");
});

test("a matching context belonging only to another session cannot attach", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.store.saveSessionEntry({
    id: "other-entry",
    sessionID: otherSession,
    type: "v4/shared_context_import",
    time: { created: 5, updated: 5 },
    data: { contextId: "context", status: "pending" },
  });
  await f.store.saveMessage(
    message("other-context-message", { contextId: "context" }, otherSession),
  );
  const before = f.snapshot();
  await assert.rejects(f.promote("input", message("input-message", references("context"))), {
    message: "shared context import is missing",
  });
  assert.deepEqual(f.snapshot(), before);
});

test("a non-attachable first match is not bypassed in favor of a later pending entry", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "closed-first", "context", "attached", 2);
  await entry(f, "pending-later", "context", "pending", 3);
  const before = f.snapshot();
  await assert.rejects(f.promote("input", message("input-message", references("context"))), {
    message: "shared context import is no longer attachable",
  });
  assert.deepEqual(f.snapshot(), before);
});

test("duplicate shared refs reject the second attachment and roll the first one back", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "entry", "context", "pending");
  await f.store.saveMessage(
    message("context-message", { contextId: "context", sharedContextStatus: "pending" }),
  );
  const before = f.snapshot();
  await assert.rejects(
    f.promote("input", message("input-message", references("context", "context"))),
    {
      message: "shared context import is no longer attachable",
    },
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("a later missing context rolls back an earlier successful attachment", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "entry", "present", "reserved");
  const before = f.snapshot();
  await assert.rejects(
    f.promote("input", message("input-message", references("present", "missing"))),
    {
      message: "shared context import is missing",
    },
  );
  assert.deepEqual(f.snapshot(), before);
});

test("first matching context entry and message follow their existing storage order", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "later-created", "context", "pending", 9);
  await entry(f, "first-match", "context", "pending", 2);
  await entry(f, "tied-match", "context", "reserved", 2);
  await f.store.saveMessage({
    ...message("first-context-message", { contextId: "context", marker: 1 }),
    time: { created: 50 },
  });
  await f.store.saveMessage({
    ...message("second-context-message", { contextId: "context", marker: 2 }),
    time: { created: 10 },
  });
  await f.promote("input", message("input-message", references("context")));
  assert.equal(storedEntry(f, "later-created").data.status, "pending");
  assert.equal(storedEntry(f, "first-match").data.status, "attached");
  assert.equal(storedEntry(f, "tied-match").data.status, "reserved");
  const transcript = await f.store.messages({ sessionID: session });
  assert.deepEqual(
    transcript.find((item) => item.info.id === "first-context-message")!.info.metadata,
    {
      contextId: "context",
      marker: 1,
      sharedContextStatus: "attached",
    },
  );
  assert.deepEqual(
    transcript.find((item) => item.info.id === "second-context-message")!.info.metadata,
    {
      contextId: "context",
      marker: 2,
    },
  );
});

test("entry write failure restores the transcript, parts, ledger and activity time", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "entry", "context", "pending");
  const before = f.snapshot();
  f.db.exec(`CREATE TRIGGER reject_context_entry BEFORE UPDATE ON session_entry
    WHEN NEW.id = 'entry' BEGIN SELECT RAISE(ABORT, 'entry fault'); END`);
  await assert.rejects(
    f.promote("input", message("input-message", references("context"))),
    /entry fault/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("context-message write failure also rolls back its already attached entry", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await entry(f, "entry", "context", "pending");
  await f.store.saveMessage(
    message("context-message", { contextId: "context", sharedContextStatus: "pending" }),
  );
  const before = f.snapshot();
  f.db.exec(`CREATE TRIGGER reject_context_message BEFORE UPDATE ON message
    WHEN NEW.id = 'context-message' BEGIN SELECT RAISE(ABORT, 'context message fault'); END`);
  await assert.rejects(
    f.promote("input", message("input-message", references("context"))),
    /context message fault/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

for (const neighbor of ["entry", "message", "part"] as const) {
  test(`shared-context lookup preserves malformed neighboring ${neighbor} JSON failures`, async (t) => {
    const f = await inputFixture(t);
    await f.add();
    await entry(f, "entry", "context", "pending");
    if (neighbor === "entry") {
      await entry(f, "broken-entry", "unrelated-context", "pending");
      f.db.exec("UPDATE session_entry SET data='{' WHERE id='broken-entry'");
    } else {
      await f.store.saveMessage(message("neighbor-message", { contextId: "unrelated-context" }));
      if (neighbor === "message") {
        f.db.exec("UPDATE message SET data='{' WHERE id='neighbor-message'");
      } else {
        await f.store.savePart(part("neighbor-part", "neighbor-message"));
        f.db.exec("UPDATE part SET data='{' WHERE id='neighbor-part'");
      }
    }
    const before = f.snapshot();
    await assert.rejects(
      f.promote("input", message("input-message", references("context"))),
      SyntaxError,
    );
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });
}
