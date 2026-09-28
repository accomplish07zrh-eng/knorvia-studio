// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  bundle,
  child,
  command,
  enriched,
  factId,
  fixture,
  metadata,
  mid,
  other,
  parent,
  pid,
  session,
  sid,
  textPart,
  user,
  type Bundle,
} from "./session-store-facade.fixture.js";

test("metadata fork writes one parent fact with original metadata and replays its persisted child", async (t) => {
  const f = await fixture(t);
  const input = metadata();
  const created = await f.store.createForkedSessionWithMetadata(session(child, parent), input);
  assert.equal(created.id, child);
  const entries = await f.store.sessionEntries({ sessionID: parent, type: "v4/command_fact" });
  assert.equal(entries.length, 1);
  const entry = entries[0]!;
  assert.deepEqual(Object.keys(entry), ["id", "sessionID", "type", "time", "data"]);
  assert.equal(entry.id, factId());
  assert.equal(entry.time.created, entry.time.updated);
  assert.deepEqual(entry.data, {
    source: "child",
    ack: {
      commandId: command,
      status: "accepted",
      revisionAtDecision: 0,
      result: { type: "forkAssistant", sessionId: child },
    },
    metadata: input,
  });
  const before = f.snapshot();
  assert.equal(
    (await f.store.createForkedSessionWithMetadata(session(sid("ignored-child"), parent), input))
      .id,
    child,
  );
  assert.deepEqual(f.snapshot(), before);
});

test("metadata parent, command and stable boundary checks precede transaction acquisition", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  const invalid = [
    {
      input: session(child, other),
      meta: metadata(),
      message: "Fork child metadata parent does not match session parentID",
    },
    {
      input: session(child, parent),
      meta: metadata(parent, "   "),
      message: "Fork child metadata is invalid",
    },
    {
      input: session(child, parent),
      meta: { ...metadata(), forkTarget: { ...metadata().forkTarget, boundaryMessageId: " " } },
      message: "Fork child metadata is invalid",
    },
    {
      input: session(child, parent),
      meta: {
        ...metadata(),
        forkTarget: { ...metadata().forkTarget, orderedMessageIds: ["wrong"] },
      },
      message: "Fork child metadata is invalid",
    },
  ];
  for (const item of invalid) {
    await assert.rejects(f.store.createForkedSessionWithMetadata(item.input, item.meta), {
      message: item.message,
    });
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  }
  const valid = {
    ...metadata(),
    forkTarget: { ...metadata().forkTarget, orderedMessageIds: ["prefix", "boundary"] },
  };
  await f.store.createForkedSessionWithMetadata(session(child, parent), valid);
});

test("metadata command namespace preserves spaces and separates equal commands across parents", async (t) => {
  const f = await fixture(t);
  const key = " command ";
  await f.store.createForkedSessionWithMetadata(session(child, parent), metadata(parent, key));
  const second = sid("second-child");
  await f.store.createForkedSessionWithMetadata(session(second, other), metadata(other, key));
  assert.equal((await f.store.getSession(child))?.parentID, parent);
  assert.equal((await f.store.getSession(second))?.parentID, other);
  for (const owner of [parent, other])
    assert.ok(f.db.prepare("SELECT 1 FROM session_entry WHERE id=?").get(factId(owner, key)));
});

for (const operation of ["metadata", "bundle"] as const) {
  test(`${operation} replay validates object layers and does not trim persisted child IDs`, async (t) => {
    const f = await fixture(t);
    for (const data of [
      null,
      [],
      { ack: [] },
      { ack: { result: [] } },
      { ack: { result: { sessionId: "" } } },
      { ack: { result: { sessionId: 7 } } },
    ]) {
      await f.store.saveSessionEntry({
        id: factId(),
        sessionID: parent,
        type: "v4/command_fact",
        time: { created: 1, updated: 1 },
        data: {},
      });
      // Persist legacy JSON directly in this synthetic database; the normal writer rejects null.
      f.db
        .prepare("UPDATE session_entry SET data=? WHERE id=?")
        .run(JSON.stringify(data), factId());
      const before = f.snapshot();
      const run =
        operation === "metadata"
          ? f.store.createForkedSessionWithMetadata(session(child, parent), metadata())
          : f.store.commitForkBundle(bundle());
      await assert.rejects(run, {
        message: `${operation === "metadata" ? "Fork child" : "Fork bundle"} command fact is corrupt: ${factId()}`,
      });
      assert.deepEqual(f.snapshot(), before);
    }
    await f.store.saveSessionEntry({
      id: factId(),
      sessionID: parent,
      type: "v4/command_fact",
      time: { created: 1, updated: 1 },
      data: { ack: { result: { sessionId: ` ${child} ` } } },
    });
    const run =
      operation === "metadata"
        ? f.store.createForkedSessionWithMetadata(session(child, parent), metadata())
        : f.store.commitForkBundle(bundle());
    await assert.rejects(run, {
      message:
        operation === "metadata"
          ? `Fork child session is missing:  ${child} `
          : `Fork bundle command fact is corrupt: ${factId()}`,
    });
  });
}

for (const stage of [
  "afterChild",
  "afterMessages",
  "afterGoal",
  "afterEntries",
  "afterInput",
  "afterCommandFact",
  "beforeCommit",
] as const) {
  test(`full bundle ${stage} fault rolls back child, copied content, target, verifier, input and fact`, async (t) => {
    const f = await fixture(t, { forkCommitFaultAt: stage });
    const input = await enriched(f);
    const before = f.snapshot();
    await assert.rejects(f.store.commitForkBundle(input), {
      message: `injected fork commit fault: ${stage}`,
    });
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(await f.store.getSession(child), null);
    assert.equal(await f.store.getSessionInputById("fork-input"), null);
  });
}

test("full bundle commits target/verifier/initial input and replays before new locality validation", async (t) => {
  const f = await fixture(t);
  const input = await enriched(f);
  await f.store.commitForkBundle(input);
  assert.equal((await f.store.readTarget({ sessionID: child }))?.status, "active");
  assert.equal((await f.store.getSessionInputById("fork-input"))?.payload.text, "next");
  assert.equal((await f.store.sessionEntries({ sessionID: child })).length, 1);
  const before = f.snapshot();
  const replay = bundle(sid("new-child"));
  replay.messages[0]!.info.sessionID = other;
  replay.commandFact.ack.result = {
    type: "invalid",
  } as unknown as Bundle["commandFact"]["ack"]["result"];
  assert.equal((await f.store.commitForkBundle(replay)).id, child);
  assert.deepEqual(f.snapshot(), before);
  replay.initialInput = {
    id: "invalid",
    sessionID: other,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "x" },
  };
  await assert.rejects(f.store.commitForkBundle(replay), {
    message: "Fork commit bundle identity is invalid",
  });
  assert.deepEqual(f.snapshot(), before);
});

test("full bundle identity rejects mismatched parent, command and initial-input owner before replay", async (t) => {
  const f = await fixture(t);
  const cases: Bundle[] = [bundle(), bundle(), bundle()];
  cases[0]!.commandFact.parentSessionId = other;
  cases[1]!.commandFact.ack.commandId = "other-command";
  cases[2]!.initialInput = {
    id: "input",
    sessionID: other,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "x" },
  };
  const before = f.snapshot();
  for (const input of cases)
    await assert.rejects(f.store.commitForkBundle(input), {
      message: "Fork commit bundle identity is invalid",
    });
  assert.deepEqual(f.snapshot(), before);
});

test("full bundle does not import metadata command trimming and keeps parent-scoped replay", async (t) => {
  const f = await fixture(t);
  for (const [owner, target] of [
    [parent, child],
    [other, sid("second-child")],
  ] as const) {
    const input = bundle(target);
    input.messages = [];
    input.child.parentID = owner;
    input.commandFact.parentSessionId = owner;
    input.commandFact.sourceCommandId = " ";
    input.commandFact.ack.commandId = " ";
    await f.store.commitForkBundle(input);
    assert.ok(f.db.prepare("SELECT 1 FROM session_entry WHERE id=?").get(factId(owner, " ")));
  }
  assert.ok(await f.store.getSession(child));
  assert.ok(await f.store.getSession(sid("second-child")));
});

test("fork copySources forwards parent message and part raw snapshots without copying unknown metadata", async (t) => {
  const f = await fixture(t);
  const sourceMessage = "source-message" as typeof mid;
  const sourcePart = "source-part" as typeof pid;
  await f.store.saveMessage(user(sourceMessage, parent));
  await f.store.savePart(textPart(sourcePart, sourceMessage, parent));
  f.db
    .prepare(
      "UPDATE message SET data=json_set(data,'$.model',json(?),'$.providerID',json('false'),'$.metadata',json(?)) WHERE id=?",
    )
    .run('{"legacy":true}', '{"notCopied":true}', sourceMessage);
  f.db
    .prepare(
      "UPDATE part SET data=json_set(data,'$.fromModel',json('false'),'$.toModel',json(?)) WHERE id=?",
    )
    .run('["legacy"]', sourcePart);
  const input = bundle();
  input.copySources = { messages: { [mid]: sourceMessage }, parts: { [pid]: sourcePart } };
  await f.store.commitForkBundle(input);
  assert.deepEqual(f.data("message", mid).model, { legacy: true });
  assert.equal(f.data("message", mid).providerID, false);
  assert.notDeepEqual(f.data("message", mid).metadata, { notCopied: true });
  assert.equal(f.data("part", pid).fromModel, false);
  assert.deepEqual(f.data("part", pid).toModel, ["legacy"]);
});

test("missing parent copy source rejects and rolls back the entire bundle", async (t) => {
  const f = await fixture(t);
  const input = bundle();
  input.copySources = { messages: { [mid]: "missing-parent-message" }, parts: {} };
  const before = f.snapshot();
  await assert.rejects(f.store.commitForkBundle(input), /Storage copy source missing/);
  assert.deepEqual(f.snapshot(), before);
});

test("empty copySources hints are ignored and replay does not reread the fact clock", async (t) => {
  const f = await fixture(t);
  const input = bundle();
  input.copySources = { messages: { [mid]: "" }, parts: { [pid]: "" } };
  t.mock.method(Date, "now", () => 123456789);
  await f.store.commitForkBundle(input);
  const fact = (await f.store.sessionEntries({ sessionID: parent }))[0]!;
  assert.deepEqual(fact.time, { created: 123456789, updated: 123456789 });
  const before = f.snapshot();
  t.mock.method(Date, "now", () => {
    throw new Error("replay must not read the fact clock");
  });
  assert.equal((await f.store.commitForkBundle(input)).id, child);
  assert.deepEqual(f.snapshot(), before);
});
