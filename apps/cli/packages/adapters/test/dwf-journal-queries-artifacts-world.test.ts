// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { fixture, plainKeys, thrown, unsafe } from "./dwf-journal.fixture.js";
import type { RunEvent } from "./dwf-journal.target.js";

test("34 narrow run lists isolate corrupt result while details still reject it", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run("run-a", { parentSessionId: "p", status: "completed" }));
  f.db.prepare("update dwf_run set result_json=?").run("not-json");
  for (const result of [
    f.journal.listRuns({ limit: 1 })[0]!,
    f.journal.listRunsByParentSession("p", 1)[0]!,
  ])
    assert.equal(Object.hasOwn(result, "result"), false);
  assert.throws(() => f.journal.getRunRow("run-a"), SyntaxError);
  assert.equal(f.journal.getRunRow("missing"), undefined);
  f.db.prepare("update dwf_run set args_json=?").run("bad-args");
  assert.throws(() => f.journal.listRuns({ limit: 1 }), SyntaxError);
});

test("35 run filters are exact and logical status filtering happens before the page limit", (t) => {
  const f = fixture(t);
  f.journal.createRun(
    f.run("wanted", {
      cwd: "",
      name: "Exact",
      status: "errored",
      failure: { code: "Interrupted", message: "legacy" },
    }),
  );
  f.clock.value += 100;
  f.journal.createRun(f.run("newer", { cwd: "", name: "Exact", status: "completed" }));
  f.clock.value += 100;
  f.journal.createRun(f.run("other", { cwd: "/Fixture", name: "exact", status: "stopped" }));
  assert.deepEqual(
    f.journal
      .listRuns({ cwd: "", name: "Exact", statuses: ["stopped"], limit: 1 })
      .map((r) => r.runId),
    ["wanted"],
  );
  assert.deepEqual(f.journal.listRuns({ cwd: "/fixture", limit: 9 }), []);
  assert.deepEqual(f.journal.listRuns({ name: "Ex%", limit: 9 }), []);
  assert.equal(f.journal.listRuns({ limit: 9 }).length, 3);
  f.db.prepare("update dwf_run set args_json=? where id=?").run("invalid", "other");
  assert.deepEqual(
    f.journal.listRuns({ cwd: "", limit: 1 }).map((r) => r.runId),
    ["newer"],
  );
});

test("36 listRuns accepts the caller's limit+1 probe rather than imposing its own ceiling", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 52; i++) {
    f.clock.value++;
    f.journal.createRun(f.run(`r-${i}`));
  }
  const rows = f.journal.listRuns({ limit: 51 });
  assert.equal(rows.length, 51);
  assert.equal(rows[0]?.runId, "r-51");
  assert.equal(rows.at(-1)?.runId, "r-1");
});

test("37 zero-work query branches return before touching a closed native connection", (t) => {
  const f = fixture(t);
  f.close();
  assert.deepEqual(f.journal.listRuns({ statuses: [], limit: 1 }), []);
  assert.deepEqual(f.journal.listRuns({ limit: 0 }), []);
  assert.deepEqual(f.journal.listRuns({ limit: -1 }), []);
  assert.deepEqual(f.journal.listRecentLogEvents("r", 0), []);
  assert.deepEqual(f.journal.listArtifactItems("r", "a", { limit: 0 }), []);
  assert.throws(() => f.journal.listRunsByParentSession("p", 0));
  assert.throws(() => f.journal.listEvents("r", { limit: 0 }));
});

test("38 parent enumeration uses updated-time then descending id and includes failure but not result", (t) => {
  const f = fixture(t);
  for (const id of ["a", "c", "b"])
    f.journal.createRun(
      f.run(id, {
        parentSessionId: "p",
        status: "errored",
        failure: { code: "DriverError", message: "b" },
        result: 1,
      }),
    );
  f.clock.value++;
  f.journal.createRun(f.run("new", { parentSessionId: "p" }));
  f.journal.createRun(f.run("unrelated", { parentSessionId: "P" }));
  const rows = f.journal.listRunsByParentSession("p", 4);
  assert.deepEqual(
    rows.map((r) => r.runId),
    ["new", "c", "b", "a"],
  );
  assert.equal(rows[1]?.failure?.code, "DriverError");
  assert.equal(Object.hasOwn(rows[1]!, "result"), false);
  assert.deepEqual(f.journal.listRunsByParentSession("p", -1), []);
});

test("39 nonterminal recovery rows are full, scoped to parent, and sorted by id", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run("z", { parentSessionId: "p", result: [9] }));
  f.journal.createRun(f.run("a", { parentSessionId: "p", status: "pending" }));
  f.journal.createRun(f.run("terminal", { parentSessionId: "p", status: "stopped" }));
  f.journal.createRun(f.run("foreign", { parentSessionId: "q" }));
  f.journal.createRun(f.run("unowned"));
  const rows = f.journal.listNonTerminalRuns("p");
  assert.deepEqual(
    rows.map((r) => r.runId),
    ["a", "z"],
  );
  assert.deepEqual(rows[1]?.result, [9]);
  f.db.prepare("update dwf_run set result_json=? where id=?").run("invalid", "z");
  assert.throws(() => f.journal.listNonTerminalRuns("p"), SyntaxError);
});

test("40 node status counts include every kind without decoding corrupt result JSON", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const statuses = ["running", "completed", "failed", "completed"] as const;
  for (let i = 0; i < statuses.length; i++)
    f.journal.putNode(
      f.node(String(i), { kind: i === 3 ? "artifact" : "ask", status: statuses[i] }),
    );
  f.db.prepare("update dwf_node set result_json=?").run("invalid");
  const counts = f.journal.countNodesByStatus("run-a");
  plainKeys(counts, ["running", "completed", "failed"]);
  assert.deepEqual(counts, { running: 1, completed: 2, failed: 1 });
  assert.deepEqual(f.journal.countNodesByStatus("missing"), {
    running: 0,
    completed: 0,
    failed: 0,
  });
});

test("41 recent logs filter by stored type, select newest first and return chronological payloads", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  for (let i = 0; i < 5; i++)
    f.journal.appendEvent("run-a", i === 3 ? f.report(3) : f.log(String(i)));
  f.db
    .prepare("update dwf_event set payload_json=? where sequence=2")
    .run('{"type":"report","from":"payload"}');
  const rows = f.journal.listRecentLogEvents("run-a", 2);
  assert.deepEqual(
    rows.map((r) => r.sequence),
    [2, 4],
  );
  assert.equal(rows[0]?.event.type, "report");
  f.db.exec("drop index dwf_event_artifact_idx");
  f.db.prepare("update dwf_event set payload_json=? where sequence=0").run("invalid");
  assert.equal(f.journal.listRecentLogEvents("run-a", 2).length, 2);
  assert.throws(() => f.journal.listRecentLogEvents("run-a", 9), SyntaxError);
});

test("42 artifact rows preserve failed versions, repeated labels and insertion order", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putNode(
    f.node("z", { kind: "artifact", status: "failed", artifactId: "a", result: { version: 1 } }),
  );
  f.journal.putNode(
    f.node("a", { kind: "artifact", status: "completed", artifactId: "a", result: { version: 2 } }),
  );
  f.journal.putNode(f.node("report", { kind: "report", artifactId: "a", result: "not a version" }));
  assert.deepEqual(
    f.journal.listArtifactRows("run-a").map((r) => [r.siteId, r.status, r.result]),
    [
      ["z", "failed", { version: 1 }],
      ["a", "completed", { version: 2 }],
    ],
  );
});

test("43 artifact items originate only from matching report events, not nodes or payload-type guesses", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.createRun(f.run("other"));
  f.journal.putNode(f.node("node-only", { kind: "report", artifactId: "chart", result: "node" }));
  f.journal.appendEvent("run-a", f.report({ nested: [1, null] }, "chart", "event", 4));
  f.journal.appendEvent("run-a", f.report("other-label", "else"));
  f.journal.appendEvent("other", f.report("other-run"));
  f.journal.appendEvent(
    "run-a",
    unsafe({
      type: "log",
      artifactId: "chart",
      instance: { siteId: "fake", ordinal: 0 },
      item: "not-report",
    }),
  );
  const rows = f.journal.listArtifactItems("run-a", "chart", { limit: 9 });
  assert.deepEqual(rows, [
    { sequence: 0, siteId: "event", ordinal: 4, item: { nested: [1, null] } },
  ]);
  plainKeys(rows[0]!, ["sequence", "siteId", "ordinal", "item"]);
});

test("44 artifact cursor, empty label and limit+1 retain item scalars and own undefined", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  for (let i = 0; i < 502; i++) f.journal.appendEvent("run-a", f.report(i, ""));
  assert.equal(f.journal.listArtifactItems("run-a", "", { limit: 501 }).length, 501);
  assert.deepEqual(
    f.journal
      .listArtifactItems("run-a", "", { afterSequence: 499, limit: 2 })
      .map((r) => r.sequence),
    [500, 501],
  );
  f.journal.appendEvent(
    "run-a",
    unsafe<RunEvent>({
      type: "report",
      artifactId: "missing-item",
      instance: { siteId: "s", ordinal: 0 },
    }),
  );
  const item = f.journal.listArtifactItems("run-a", "missing-item", { limit: 1 })[0]!;
  assert.ok(Object.hasOwn(item, "item"));
  assert.equal(item.item, undefined);
  assert.equal(
    thrown(() => f.journal.listArtifactItems("run-a", "", { limit: 0.5 })).code,
    "ERR_SQLITE_ERROR",
  );
});

test("45 malformed artifact instance affects only selected pages and native JSON-index checks remain", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.appendEvent("run-a", f.report(null));
  f.journal.appendEvent("run-a", unsafe({ type: "report", artifactId: "chart", item: false }));
  assert.equal(f.journal.listArtifactItems("run-a", "chart", { limit: 1 })[0]?.item, null);
  assert.throws(() => f.journal.listArtifactItems("run-a", "chart", { limit: 2 }), TypeError);
  assert.equal(
    thrown(() =>
      f.db.prepare("update dwf_event set payload_json=? where sequence=0").run("bad-json"),
    ).code,
    "ERR_SQLITE_ERROR",
  );
});

test("46 world summaries measure stored UTF-8 and keep metadata without materializing result", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const result = { exitCode: 0, stdout: "中😀\n", stderr: "é" };
  const node = f.node("z", {
    kind: "world-run",
    status: "completed",
    result,
    input: unsafe({ op: "run", args: { command: "fixture" }, future: true }),
  });
  f.journal.putNode(node);
  f.journal.putNode(f.node("a", { kind: "world-read", result: ["中", "😀"] }));
  f.journal.putNode(f.node("ignore", { kind: "ask", result: { huge: "x" } }));
  const rows = f.journal.listWorldNodes("run-a");
  assert.deepEqual(
    rows.map((r) => r.siteId),
    ["z", "a"],
  );
  const summary = rows[0]!;
  assert.equal(Object.hasOwn(summary, "result"), false);
  assert.equal(summary.resultBytes, Buffer.byteLength(JSON.stringify(result)));
  assert.equal(summary.stdoutBytes, Buffer.byteLength(result.stdout));
  assert.equal(summary.stderrBytes, 2);
  assert.equal(summary.exitCode, 0);
  assert.deepEqual(summary.input, node.input);
  assert.equal(rows[1]?.resultCount, 2);
  plainKeys(summary, [
    "runId",
    "siteId",
    "ordinal",
    "kind",
    "inputHash",
    "status",
    "input",
    "timeCreated",
    "timeUpdated",
    "resultBytes",
    "exitCode",
    "stdoutBytes",
    "stderrBytes",
  ]);
});

test("47 world SQLite scalar extraction preserves bool-to-number, number bytes and JSON null distinctions", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  const results = [
    { exitCode: true, stdout: 123, stderr: null },
    { exitCode: "7", stdout: false, stderr: "" },
    null,
    "中",
    undefined,
  ];
  for (let i = 0; i < results.length; i++)
    f.journal.putNode(
      f.node(String(i), { kind: "world-run", status: "failed", result: results[i] }),
    );
  const rows = f.journal.listWorldNodes("run-a");
  assert.equal(rows[0]?.exitCode, 1);
  assert.equal(rows[0]?.stdoutBytes, 3);
  assert.equal(Object.hasOwn(rows[0]!, "stderrBytes"), false);
  assert.equal(Object.hasOwn(rows[1]!, "exitCode"), false);
  assert.equal(rows[1]?.stdoutBytes, 1);
  assert.equal(rows[1]?.stderrBytes, 0);
  assert.equal(rows[2]?.resultBytes, 4);
  assert.equal(rows[3]?.resultBytes, Buffer.byteLength('"中"'));
  assert.equal(Object.hasOwn(rows[4]!, "resultBytes"), false);
  for (const row of rows) {
    assert.equal(row.status, "failed");
    assert.equal(Object.hasOwn(row, "resultCount"), false);
  }
});

test("48 world selected malformed JSON still fails while unrelated kinds stay outside the read", (t) => {
  const f = fixture(t);
  f.journal.createRun(f.run());
  f.journal.putNode(f.node("world", { kind: "world-read", result: [] }));
  f.journal.putNode(f.node("ask"));
  f.db.prepare("update dwf_node set result_json=? where site_id=?").run("bad-json", "ask");
  assert.equal(f.journal.listWorldNodes("run-a").length, 1);
  f.db.prepare("update dwf_node set result_json=? where site_id=?").run("bad-json", "world");
  assert.equal(thrown(() => f.journal.listWorldNodes("run-a")).code, "ERR_SQLITE_ERROR");
  f.db
    .prepare("update dwf_node set result_json='[]', input_json=? where site_id=?")
    .run("bad-input", "world");
  assert.throws(() => f.journal.listWorldNodes("run-a"), SyntaxError);
});
