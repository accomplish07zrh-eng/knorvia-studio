// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { fixture, plainKeys, thrown, unsafe } from "./dwf-journal.fixture.js";
import type { RunEvent } from "./dwf-journal.target.js";

test("19 actor full upsert clears omitted fields but preserves row id and creation time", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putActor(
    f.actor("z", {
      name: "Z",
      persona: unsafe({ name: "P", future: [1, 2] }),
      sessionId: "orphan-session",
      resolvedModel: "p/m",
    }),
  );
  const before = f.row("dwf_actor");
  f.clock.value += 20;
  f.journal.putActor(f.actor("a"));
  f.journal.putActor(f.actor("z"));
  assert.deepEqual(f.journal.getActor("run-a", "z", 0), f.actor("z"));
  const after = f.row("dwf_actor", "site_id=?", "z");
  assert.equal(after.id, before.id);
  assert.equal(after.time_created, before.time_created);
  assert.equal(after.time_updated, f.clock.value);
  for (const key of ["name", "persona_json", "session_id", "resolved_model"])
    assert.equal(after[key], null);
  assert.deepEqual(
    f.journal.listActors("run-a").map((a) => a.siteId),
    ["z", "a"],
  );
});

test("20 actor nullable JSON differs from scalar empties and retains legacy JSON null", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putActor(
    f.actor("", {
      name: "",
      persona: unsafe({ future: "kept" }),
      sessionId: "",
      resolvedModel: "",
    }),
  );
  const actual = f.journal.getActor("run-a", "", 0)!;
  plainKeys(actual, [
    "runId",
    "siteId",
    "ordinal",
    "name",
    "persona",
    "sessionId",
    "resolvedModel",
  ]);
  assert.deepEqual(actual.persona, { future: "kept" });
  for (const json of [null, "", "null", "false"]) {
    f.db.prepare("update dwf_actor set persona_json=?").run(json);
    const value = f.journal.getActor("run-a", "", 0)!;
    assert.equal(Object.hasOwn(value, "persona"), json === "null" || json === "false");
    if (json) assert.equal(value.persona, JSON.parse(json));
  }
});

test("21 actors have exact coordinates and selected corrupt JSON fails synchronously", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.createRun(f.run("other"));
  f.journal.putActor(f.actor("s", { ordinal: 1 }));
  f.journal.putActor(f.actor("s", { runId: "other", ordinal: 1 }));
  f.db.prepare("update dwf_actor set persona_json=? where run_id=?").run("bad-json", "other");
  assert.equal(f.journal.getActor("run-a", "s", 0), undefined);
  assert.equal(f.journal.getActor("run-a", "S", 1), undefined);
  assert.equal(f.journal.listActors("run-a").length, 1);
  assert.deepEqual(f.journal.listActors("missing"), []);
  assert.throws(() => f.journal.getActor("other", "s", 1), SyntaxError);
  assert.throws(() => f.journal.listActors("other"), SyntaxError);
});

test("22 node full upsert replaces kind and clears all omitted optional fields", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putNode(
    f.node("site", {
      actorSiteId: "actor",
      actorOrdinal: 2,
      actorSeq: 4,
      result: [1],
      error: { code: "DriverError", message: "b" },
      stats: { tokens: 5, turns: 1, toolCalls: 0 },
      messageBoundary: 9,
      artifactId: "chart",
      input: unsafe({ op: "read", args: { path: "fixture.txt" } }),
    }),
  );
  const before = f.row("dwf_node");
  f.clock.value += 30;
  const next = f.node("site", { kind: "report", status: "completed", inputHash: "new" });
  f.journal.putNode(next);
  assert.deepEqual(f.journal.getNode("run-a", "site", 0), next);
  const after = f.row("dwf_node");
  assert.equal(after.id, before.id);
  assert.equal(after.time_created, before.time_created);
  assert.equal(after.time_updated, f.clock.value);
  for (const key of [
    "actor_site_id",
    "actor_ordinal",
    "actor_seq",
    "result_json",
    "error_json",
    "stats_json",
    "message_boundary",
    "artifact_id",
    "input_json",
  ])
    assert.equal(after[key], null);
});

test("23 node zeros, empty strings, null result and ordered nullable fields survive", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const value = f.node("", {
    actorSiteId: "",
    actorOrdinal: 0,
    actorSeq: 0,
    result: null,
    error: unsafe(null),
    stats: unsafe(null),
    messageBoundary: 0,
    artifactId: "",
    input: unsafe(null),
  });
  f.journal.putNode(value);
  const actual = f.journal.getNode("run-a", "", 0)!;
  plainKeys(actual, [
    "runId",
    "siteId",
    "ordinal",
    "kind",
    "inputHash",
    "status",
    "actorSiteId",
    "actorOrdinal",
    "actorSeq",
    "result",
    "messageBoundary",
    "artifactId",
  ]);
  assert.equal(actual.result, null);
  assert.equal(actual.actorSeq, 0);
  assert.equal(actual.messageBoundary, 0);
  f.db.prepare("update dwf_node set error_json='null', stats_json='null', input_json='null'").run();
  const legacy = f.journal.getNode("run-a", "", 0)!;
  plainKeys(legacy, [
    "runId",
    "siteId",
    "ordinal",
    "kind",
    "inputHash",
    "status",
    "actorSiteId",
    "actorOrdinal",
    "actorSeq",
    "result",
    "error",
    "stats",
    "messageBoundary",
    "artifactId",
    "input",
  ]);
  assert.equal(legacy.error, null);
  assert.equal(legacy.stats, null);
  assert.equal(legacy.input, null);
});

test("24 node ordering is insertion order and reads return independent parsed objects", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const input = f.node("z", { result: { nested: [1] } });
  f.journal.putNode(input);
  f.journal.putNode(f.node("a"));
  f.journal.putNode({ ...input, result: { nested: [2] } });
  const all = f.journal.listNodes("run-a");
  assert.deepEqual(
    all.map((n) => n.siteId),
    ["z", "a"],
  );
  assert.notEqual(all[0], input);
  assert.notEqual(all[0]?.result, input.result);
  unsafe<{ nested: number[] }>(all[0]?.result).nested.push(99);
  assert.deepEqual(f.journal.getNode("run-a", "z", 0)?.result, { nested: [2] });
  assert.equal(f.journal.getNode("run-a", "z", 1), undefined);
  assert.deepEqual(f.journal.listNodes("none"), []);
});

test("25 node constraints and JSON failures use native errors without corrupting a prior row", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putNode(f.node());
  const before = f.row("dwf_node");
  assert.throws(() => f.journal.putNode(f.node("site-a", { result: 1n })), TypeError);
  assert.deepEqual(f.row("dwf_node"), before);
  assert.equal(
    thrown(() => f.journal.putNode(f.node("bad", { runId: "missing" }))).code,
    "ERR_SQLITE_ERROR",
  );
  assert.equal(
    thrown(() => f.journal.putActor(f.actor("bad", { runId: "missing" }))).code,
    "ERR_SQLITE_ERROR",
  );
  f.db.prepare("update dwf_node set result_json=?").run("invalid");
  assert.throws(() => f.journal.getNode("run-a", "site-a", 0), SyntaxError);
  assert.throws(() => f.journal.listNodes("run-a"), SyntaxError);
});

test("26 actor/node/event clock precedes prepare while JSON encoding follows it", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.db.exec("drop table dwf_actor; drop table dwf_node; drop table dwf_event");
  const initial = f.clock.calls;
  assert.equal(
    thrown(() => f.journal.putActor(f.actor("a", { persona: unsafe(1n) }))).code,
    "ERR_SQLITE_ERROR",
  );
  assert.equal(
    thrown(() => f.journal.putNode(f.node("n", { result: 1n }))).code,
    "ERR_SQLITE_ERROR",
  );
  assert.equal(
    thrown(() => f.journal.appendEvent("run-a", unsafe({ type: "log", value: 1n }))).code,
    "ERR_SQLITE_ERROR",
  );
  assert.equal(f.clock.calls, initial + 3);
});

test("27 append returns the exact event reference while storage preserves its timestamped snapshot", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const event = unsafe<RunEvent & { detail: { value: number } }>({
    type: "log",
    detail: { value: 1 },
  });
  const stored = f.journal.appendEvent("run-a", event);
  plainKeys(stored, ["sequence", "event", "timeCreated"]);
  assert.equal(stored.event, event);
  event.detail.value = 2;
  f.clock.value += 500;
  const calls = f.clock.calls;
  const reread = f.journal.listEvents("run-a")[0]!;
  assert.notEqual(reread.event, event);
  assert.deepEqual(reread.event, { type: "log", detail: { value: 1 } });
  assert.equal(reread.timeCreated, stored.timeCreated);
  assert.equal(f.clock.calls, calls);
});

test("28 event allocation is per-run and follows native max sequence after deletion", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.createRun(f.run("other"));
  assert.equal(f.journal.appendEvent("run-a", f.log("a")).sequence, 0);
  assert.equal(f.journal.appendEvent("other", f.log("b")).sequence, 0);
  assert.equal(f.journal.appendEvent("run-a", f.log("c")).sequence, 1);
  f.db.prepare("delete from dwf_event where run_id=? and sequence=?").run("run-a", 1);
  assert.equal(f.journal.appendEvent("run-a", f.log("d")).sequence, 1);
  assert.equal(f.journal.listEvents("other").length, 1);
});

test("29 native ignored insert reports a missing sequence without inventing an event", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.db.exec(
    "create trigger ignore_event before insert on dwf_event begin select raise(ignore); end",
  );
  assert.equal(
    thrown(() => f.journal.appendEvent("run-a", f.log("ignored"))).message,
    "dwf journal: event insert returned no sequence for run: run-a",
  );
  assert.equal(f.count("dwf_event"), 0);
});

test("30 event pagination has a strict cursor, explicit zero floor and native fractional errors", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  for (let i = 0; i < 5; i++) f.journal.appendEvent("run-a", f.log(String(i)));
  assert.deepEqual(
    f.journal.listEvents("run-a", { afterSequence: 1, limit: 2 }).map((e) => e.sequence),
    [2, 3],
  );
  assert.equal(f.journal.listEvents("run-a").length, 5);
  for (const limit of [-1, 0]) assert.deepEqual(f.journal.listEvents("run-a", { limit }), []);
  for (const limit of [0.5, Infinity])
    assert.equal(thrown(() => f.journal.listEvents("run-a", { limit })).code, "ERR_SQLITE_ERROR");
  assert.deepEqual(f.journal.listEvents("missing"), []);
  assert.deepEqual(f.journal.listEvents("run-a", { afterSequence: 99 }), []);
});

test("31 event native FK and JSON failures leave allocation available for the next valid event", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  assert.equal(
    thrown(() => f.journal.appendEvent("missing", f.log("bad"))).code,
    "ERR_SQLITE_ERROR",
  );
  assert.throws(
    () => f.journal.appendEvent("run-a", unsafe({ type: "log", invalid: 1n })),
    TypeError,
  );
  assert.equal(f.journal.appendEvent("run-a", f.log("valid")).sequence, 0);
});

test("32 event cursor and limit exclude corrupt unselected rows before decoding", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.createRun(f.run("other"));
  for (let i = 0; i < 3; i++) f.journal.appendEvent("run-a", f.log(String(i)));
  f.journal.appendEvent("other", f.log("other"));
  // A legacy-corruption fixture must remove this JSON index; otherwise SQLite rejects the bad write itself.
  f.db.exec("drop index dwf_event_artifact_idx");
  f.db
    .prepare("update dwf_event set payload_json=? where sequence=0 or run_id=?")
    .run("invalid", "other");
  assert.deepEqual(
    f.journal.listEvents("run-a", { afterSequence: 0, limit: 1 }).map((e) => e.sequence),
    [1],
  );
  assert.throws(() => f.journal.listEvents("run-a"), SyntaxError);
  assert.deepEqual(f.journal.listEvents("run-a", { limit: 0 }), []);
});

test("33 SQLite cascade owns child deletion and duplicate actor coordinates do not create extra rows", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putActor(f.actor());
  f.journal.putActor(f.actor());
  // The actor scheduling uniqueness mentioned in a type comment is not an additional database constraint.
  f.journal.putNode(f.node("one", { actorSiteId: "same", actorOrdinal: 0, actorSeq: 0 }));
  f.journal.putNode(f.node("two", { actorSiteId: "same", actorOrdinal: 0, actorSeq: 0 }));
  f.journal.appendEvent("run-a", f.log("one"));
  assert.equal(f.count("dwf_actor"), 1);
  assert.equal(f.count("dwf_node"), 2);
  f.db.prepare("delete from dwf_run where id=?").run("run-a");
  for (const table of ["dwf_actor", "dwf_node", "dwf_event"] as const)
    assert.equal(f.count(table), 0);
});
