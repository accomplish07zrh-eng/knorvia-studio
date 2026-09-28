// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { fixture, plainKeys, thrown, unsafe } from "./dwf-journal.fixture.js";
import { codecs, type RunSettlementRecord } from "./dwf-journal.target.js";

test("01 public facade caches a synchronous journal on its native connection", (t) => {
  const f = fixture(t);
  assert.equal(f.journal, f.store.workflowJournalStore());
  assert.equal(f.journal.createRun(f.run()), undefined);
  assert.equal(f.journal.updateRunUsage("run-a", 7), undefined);
  assert.equal(f.journal.updateRunStatus("run-a", "completed"), undefined);
  assert.equal(f.journal.getRun("run-a")?.spentTokens, 7);
  assert.equal(f.row("dwf_run").status, "completed");
  assert.equal(f.db.isTransaction, false);
});

test("02 creation retains metadata, null result, JSON internals and ordered plain fields", (t) => {
  const f = fixture(t);
  const record = f.run("full", {
    parentSessionId: "",
    cwd: "",
    name: "",
    toolCallId: "",
    scriptText: "return null",
    scriptHash: "h",
    resumedFrom: "unknown-parent",
    args: { unknown: [1, null] },
    status: "stopped",
    stopReason: "superseded",
    supersededBy: "next",
    failure: { code: "DriverError", message: "test" },
    result: null,
  });
  f.journal.createRun({
    ...record,
    caps: unsafe({ maxConcurrency: 3, ignored: true }),
    ...unsafe<{ unknown: boolean }>({ unknown: true }),
  });
  const actual = f.journal.getRun("full")!;
  assert.deepEqual(actual, { ...record, caps: { maxConcurrency: 3 } });
  plainKeys(actual, [
    "runId",
    "caps",
    "spentTokens",
    "status",
    "stopReason",
    "supersededBy",
    "parentSessionId",
    "cwd",
    "name",
    "toolCallId",
    "scriptText",
    "scriptHash",
    "resumedFrom",
    "args",
    "failure",
    "result",
  ]);
  assert.equal(f.row("dwf_run").time_created, f.row("dwf_run").time_updated);
  assert.equal(f.clock.calls, 1);
});

test("03 logical statuses and all stop reasons persist through the physical vocabulary", (t) => {
  const f = fixture(t);
  for (const status of ["pending", "running", "completed", "errored"] as const) {
    f.journal.createRun(f.run(status, { status }));
    assert.equal(f.journal.getRun(status)?.status, status);
    assert.equal(
      f.row("dwf_run", "id = ?", status).status,
      status === "errored" ? "failed" : status,
    );
  }
  for (const reason of ["user", "model", "provider", "interrupted", "superseded"] as const) {
    f.journal.createRun(f.run(reason, { status: "stopped", stopReason: reason }));
    assert.equal(f.journal.getRun(reason)?.stopReason, reason);
    assert.equal(f.row("dwf_run", "id = ?", reason).status, "cancelled");
  }
});

test("04 terminal writes replace failure but retain omitted results and honor explicit null", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run("run-a", { result: { saved: 1 } }));
  f.journal.updateRunStatus("run-a", "errored", { failure: { code: "DriverError", message: "a" } });
  f.journal.updateRunStatus("run-a", "completed", {
    result: () => undefined,
    failure: { code: "ContextLimit", message: "b" },
  });
  assert.deepEqual(f.journal.getRun("run-a")?.result, { saved: 1 });
  assert.equal(f.journal.getRun("run-a")?.failure?.code, "ContextLimit");
  f.journal.updateRunStatus("run-a", "stopped", { result: null });
  assert.equal(f.journal.getRun("run-a")?.result, null);
  assert.ok(Object.hasOwn(f.journal.getRun("run-a")!, "result"));
  f.journal.updateRunStatus("run-a", "completed");
  assert.equal(f.journal.getRun("run-a")?.result, null);
  assert.equal(Object.hasOwn(f.journal.getRun("run-a")!, "failure"), false);
});

test("05 resuming clears settlement while ignoring even unserializable settlement bags", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run("run-a", { status: "stopped", result: 42 }));
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const status of ["running", "pending"] as const) {
    f.journal.updateRunStatus(
      "run-a",
      status,
      unsafe<RunSettlementRecord>({ failure: cycle, result: 1n }),
    );
    assert.deepEqual(f.journal.getRun("run-a"), f.run("run-a", { status }));
  }
});

test("06 usage is absolute and changes only usage and the update clock", (t) => {
  const f = fixture(t);
  f.journal.createRun(
    f.run("run-a", {
      parentSessionId: "p",
      args: { a: 1 },
      status: "completed",
      result: "saved",
      failure: { code: "WorldReadCapExceeded", message: "yes" },
    }),
  );
  const before = f.row("dwf_run");
  f.clock.value += 60;
  f.journal.updateRunUsage("run-a", 15);
  f.journal.updateRunUsage("run-a", 3);
  assert.deepEqual(f.row("dwf_run"), { ...before, spent_tokens: 3, time_updated: f.clock.value });
  assert.equal(f.clock.calls, 3);
});

test("07 missing runs return undefined but both mutations synchronously reject", (t) => {
  const f = fixture(t);
  assert.equal(f.journal.getRun("none"), undefined);
  for (const operation of [
    () => f.journal.updateRunUsage("none", 2),
    () => f.journal.updateRunStatus("none", "completed"),
  ]) {
    assert.equal(thrown(operation).message, "dwf journal: unknown run: none");
  }
  assert.equal(f.count("dwf_run"), 0);
});

test("08 duplicate diagnostics preserve cause and original row, including JSON failures", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const before = f.row("dwf_run");
  const native = thrown(() => f.journal.createRun(f.run("run-a", { spentTokens: 99 })));
  assert.equal(native.message, "dwf journal: run already exists: run-a");
  assert.ok(native.cause instanceof Error);
  assert.equal(unsafe<{ code: string }>(native.cause).code, "ERR_SQLITE_ERROR");
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.ok(
    thrown(() => f.journal.createRun(f.run("run-a", { args: cycle }))).cause instanceof TypeError,
  );
  assert.deepEqual(f.row("dwf_run"), before);
});

test("09 caller transaction covers all four tables and owns rollback after a failure", (t) => {
  const f = fixture(t);
  f.db.exec("begin immediate");
  f.journal.createRun(f.run());
  f.journal.putActor(f.actor());
  f.journal.putNode(f.node());
  f.journal.appendEvent("run-a", f.log("one"));
  assert.equal(f.db.isTransaction, true);
  assert.throws(() => f.journal.createRun(f.run()));
  assert.equal(f.db.isTransaction, true);
  f.db.exec("rollback");
  for (const table of ["dwf_run", "dwf_actor", "dwf_node", "dwf_event"] as const)
    assert.equal(f.count(table), 0);
});

test("10 missing-table errors retain preparation/encoding/clock priority", (t) => {
  const f = fixture(t);
  f.db.exec("drop table dwf_run");
  assert.equal(
    thrown(() => f.journal.createRun(f.run("a", { result: 1n }))).code,
    "ERR_SQLITE_ERROR",
  );
  assert.equal(f.clock.calls, 1);
  assert.ok(
    thrown(() =>
      f.journal.createRun(f.run("b", { status: "errored", failure: unsafe(1n) })),
    ) instanceof TypeError,
  );
  assert.equal(f.clock.calls, 2);
  assert.equal(
    thrown(() => f.journal.updateRunStatus("x", "completed", { result: 1n })).code,
    "ERR_SQLITE_ERROR",
  );
  assert.equal(f.clock.calls, 3);
  assert.ok(
    thrown(() => f.journal.updateRunStatus("x", "completed", { failure: unsafe(1n) })) instanceof
      TypeError,
  );
  assert.equal(f.clock.calls, 4);
  assert.equal(thrown(() => f.journal.updateRunUsage("x", 0)).code, "ERR_SQLITE_ERROR");
  assert.equal(f.clock.calls, 4);
});

test("11 legacy physical statuses decode logically without rewriting stored bytes", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const cases = [
    ["failed", '{"code":"Interrupted","message":"old"}', "stopped", "interrupted"],
    ["failed", '{"code":"interrupted"}', "errored", undefined],
    ["cancelled", null, "stopped", "user"],
    [
      "cancelled",
      '{"stopReason":"bogus","supersededBy":"ignored-next","error":{"code":"ignored"}}',
      "stopped",
      "user",
    ],
    ["cancelled", '{"supersededBy":"ignored-next","error":{"code":"ignored"}}', "stopped", "user"],
    ["cancelled", '{"stopReason":3,"error":{"code":"ignored"}}', "stopped", "user"],
    ["cancelled", '{"stopReason":"model","supersededBy":"","error":null}', "stopped", "model"],
  ] as const;
  for (const [physical, json, status, reason] of cases) {
    f.db.prepare("update dwf_run set status=?, failure_json=?").run(physical, json);
    const value = f.journal.getRun("run-a")!;
    assert.equal(value.status, status);
    assert.equal(value.stopReason, reason);
    assert.equal(Object.hasOwn(value, "supersededBy"), false);
    if (json?.includes('"code":"ignored"')) assert.equal(Object.hasOwn(value, "failure"), false);
    if (json?.includes('"error":null')) assert.equal(value.failure, null);
    assert.equal(f.row("dwf_run").failure_json, json);
  }
});

test("12 full run decoding fails in failure then args then result order", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const base = unsafe<Parameters<typeof codecs.decodeRun>[0]>(f.row("dwf_run"));
  const parseError = (json: string) => thrown(() => JSON.parse(json)).message;
  assert.equal(
    thrown(() =>
      codecs.decodeRun({
        ...base,
        failure_json: "failure-bad",
        args_json: "args-bad",
        result_json: "result-bad",
      }),
    ).message,
    parseError("failure-bad"),
  );
  assert.equal(
    thrown(() => codecs.decodeRun({ ...base, args_json: "args-bad", result_json: "result-bad" }))
      .message,
    parseError("args-bad"),
  );
  assert.equal(
    thrown(() => codecs.decodeRun({ ...base, args_json: "{}", result_json: "result-bad" })).message,
    parseError("result-bad"),
  );
  assert.throws(() => codecs.decodeRun({ ...base, args_json: "" }), SyntaxError);
});

test("13 result codec preserves null and delegates native unsupported-value errors", () => {
  for (const value of [undefined, () => 1, Symbol("omitted")])
    assert.equal(codecs.encodeResultJson(value), null);
  assert.equal(codecs.encodeResultJson(null), "null");
  assert.equal(codecs.encodeResultJson({ future: [null, "中"] }), '{"future":[null,"中"]}');
  assert.throws(() => codecs.encodeResultJson(1n), TypeError);
  const cycle: unknown[] = [];
  cycle.push(cycle);
  assert.throws(() => codecs.encodeResultJson(cycle), TypeError);
});

test("14 settlement codec keeps envelope ordering and ignores nonterminal bags", () => {
  const encoded = codecs.encodeRunSettlement("stopped", {
    supersededBy: "next",
    failure: { code: "DriverError", message: "b" },
  });
  assert.equal(encoded.status, "cancelled");
  assert.equal(
    encoded.failureJson,
    '{"stopReason":"user","supersededBy":"next","error":{"code":"DriverError","message":"b"}}',
  );
  for (const status of ["pending", "running"] as const)
    assert.deepEqual(codecs.encodeRunSettlement(status, unsafe({ failure: 1n })), {
      status,
      failureJson: null,
    });
  assert.equal(
    codecs.encodeRunSettlement("completed", {
      failure: { code: "WorldReadCapExceeded", message: "yes" },
    }).failureJson,
    '{"code":"WorldReadCapExceeded","message":"yes"}',
  );
});

test("15 status predicate executes with ordered duplicate bindings and legacy grouping", (t) => {
  const f = fixture(t);
  for (const status of ["pending", "running", "completed", "stopped", "errored"] as const)
    f.journal.createRun(f.run(status, { status }));
  f.journal.createRun(
    f.run("legacy", { status: "errored", failure: { code: "Interrupted", message: "old" } }),
  );
  const predicate = codecs.encodeRunStatusPredicate(["running", "stopped", "errored", "running"]);
  assert.deepEqual(predicate.params, ["running", "Interrupted", "Interrupted", "running"]);
  const rows = f.db
    .prepare(`select id from dwf_run where ${predicate.sql} order by id`)
    .all(...predicate.params);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["errored", "legacy", "running", "stopped"],
  );
  const empty = codecs.encodeRunStatusPredicate([]);
  assert.deepEqual(
    f.db.prepare(`select id from dwf_run where ${empty.sql}`).all(...empty.params),
    [],
  );
});

test("16 all run projections preserve their distinct own-key order", (t) => {
  const f = fixture(t);
  f.journal.createRun(
    f.run("run-a", {
      parentSessionId: "p",
      status: "completed",
      failure: { code: "DriverError", message: "b" },
      result: null,
    }),
  );
  const prefix = ["runId", "caps", "spentTokens", "status", "parentSessionId"];
  plainKeys(f.journal.getRun("run-a")!, [...prefix, "failure", "result"]);
  plainKeys(f.journal.listRuns({ limit: 1 })[0]!, [...prefix, "timeCreated", "timeUpdated"]);
  plainKeys(f.journal.getRunRow("run-a")!, [
    ...prefix,
    "failure",
    "result",
    "timeCreated",
    "timeUpdated",
  ]);
  plainKeys(f.journal.listRunsByParentSession("p", 1)[0]!, [
    ...prefix,
    "timeCreated",
    "timeUpdated",
    "failure",
  ]);
});

test("17 retained O1 boundary: synthetic AFTER INSERT FAIL can leave a row and duplicate wrapper", (t) => {
  const f = fixture(t);
  f.db.exec(
    "create trigger fixture_fail after insert on dwf_run begin select raise(fail, 'fixture first failure'); end",
  );
  const error = thrown(() => f.journal.createRun(f.run("fresh")));
  assert.equal(error.message, "dwf journal: run already exists: fresh");
  assert.ok(error.cause instanceof Error);
  assert.match(error.cause.message, /fixture first failure/);
  assert.equal(f.count("dwf_run"), 1);
  assert.equal(f.db.isTransaction, false);
});

test("18 retained O2 boundary: legacy cancelled JSON null throws rather than falling back", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run("run-a", { status: "stopped" }));
  f.db.prepare("update dwf_run set failure_json=?").run("null");
  assert.throws(() => f.journal.getRun("run-a"), TypeError);
  assert.throws(() => f.journal.listRuns({ limit: 1 }), TypeError);
  assert.deepEqual(f.journal.listRuns({ limit: 0 }), []);
});
