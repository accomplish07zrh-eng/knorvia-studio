// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fixture, records, subject } from "./subject.mjs";

const api = await subject("index");
const LEVEL = { Debug: 0, Info: 1, Warn: 2, Error: 3 };
const identityRedactor = { redact: (value) => value };

function stream() {
  const chunks = [];
  const port = {
    write(value) {
      assert.equal(this, port);
      chunks.push(value);
      return true;
    },
  };
  return { chunks, port };
}

function logger(root, options = {}) {
  return new api.NodeFileLogger({
    category: "owned",
    getMinLevel: () => LEVEL.Debug,
    logDir: root,
    redactor: identityRedactor,
    ...options,
  });
}

test("daily UTF-8 JSONL is appended immediately and all methods retain levels", async (context) => {
  const root = await fixture(context);
  const l = logger(root);
  l.debug("你好");
  l.info("info");
  l.warn("warn");
  l.error("error");
  const names = await readdir(root);
  assert.equal(names.length, 1);
  assert.match(names[0], /^knorvia-\d{4}-\d{2}-\d{2}\.jsonl$/);
  const text = await readFile(join(root, names[0]), "utf8");
  assert.equal(text.endsWith("\n"), true);
  const rows = text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    rows.map((r) => r.level),
    ["debug", "info", "warn", "error"],
  );
  assert.equal(rows[0].message, "你好");
  assert.equal(rows[0].module, "owned");
  assert.equal(Number.isNaN(Date.parse(rows[0].timestamp)), false);
});

test("level filtering creates no directory and does not evaluate context", async (context) => {
  const root = join(await fixture(context), "absent");
  const l = logger(root, { getMinLevel: () => LEVEL.Error });
  l.info("filtered", {
    get detail() {
      throw new Error("unexpected context read");
    },
  });
  await assert.rejects(readdir(root), { code: "ENOENT" });
});

test("factory level changes reach previously created loggers and children", async (context) => {
  const root = await fixture(context);
  const f = api.createNodeLoggerFactory({ logDir: root, minLevel: LEVEL.Error });
  const l = f.createLogger("old");
  const child = l.child({ sessionId: "s" });
  l.info("filtered");
  f.setLevel(LEVEL.Debug);
  child.debug("accepted");
  f.setLevel(LEVEL.Error);
  child.warn("filtered too");
  l.error("accepted too");
  assert.deepEqual(
    (await records(root)).map((r) => r.message),
    ["accepted", "accepted too"],
  );
});

test("default, child and call context precedence preserves parent and extra fields", async (context) => {
  const root = await fixture(context);
  const defaults = { module: "base", sessionId: "base", x: 1 };
  const l = logger(root, { defaultContext: defaults });
  const child = l.child({ sessionId: "child", x: 2 });
  defaults.module = "mutated";
  child.info("child", { sessionId: "call", x: 3 });
  l.info("parent");
  const rows = await records(root);
  assert.equal(rows[0].module, "base");
  assert.equal(rows[0].sessionId, "call");
  assert.deepEqual(rows[0].context, { x: 3 });
  assert.equal(rows[1].module, "mutated");
  assert.equal(rows[1].sessionId, "base");
  assert.deepEqual(rows[1].context, { x: 1 });
});

test("reserved fields obey type filtering while trace and falsy values remain", async (context) => {
  const root = await fixture(context);
  logger(root).info("record", {
    event: "",
    module: "",
    sessionId: 1,
    turnId: "",
    spanId: false,
    parentSpanId: "p",
    toolCallId: "t",
    traceId: 42,
    durationMs: NaN,
    status: "running",
    other: null,
  });
  const [row] = await records(root);
  assert.equal(row.event, "");
  assert.equal(row.module, "");
  assert.equal(row.turnId, "");
  assert.equal(row.traceId, 42);
  assert.equal(row.durationMs, null);
  for (const field of ["sessionId", "spanId", "status"]) assert.equal(field in row, false);
  assert.deepEqual(row.context, { other: null });
});

test("error stack option, cause and default secret redaction reach persisted records", async (context) => {
  const root = await fixture(context);
  const error = new Error("password=owned-error", { cause: new Error("owned cause") });
  const l = logger(root, { includeErrorStack: true, redactor: new api.DefaultLogRedactor() });
  l.error("password=owned-message", error, { accessToken: "owned-context" });
  const [row] = await records(root);
  assert.equal(row.error.cause.message, "owned cause");
  assert.equal(typeof row.error.stack, "string");
  const text = JSON.stringify(row);
  for (const marker of ["owned-error", "owned-message", "owned-context"])
    assert.equal(text.includes(marker), false);
  l.error("without stack", error, {});
  const root2 = join(root, "second");
  logger(root2).error("without stack", error);
  assert.equal("stack" in (await records(root2))[0].error, false);
});

test("custom redactor controls JSONL but console uses standard text redaction", async (context) => {
  const root = await fixture(context);
  const { chunks, port } = stream();
  logger(root, { consoleStream: port, redactor: { redact: () => "custom" } }).info(
    "password=owned-value",
    { traceId: "abcdefghijk", event: "tick" },
  );
  const [row] = await records(root);
  assert.equal(row.message, "custom");
  assert.equal(row.context, "custom");
  assert.equal(row.error, "custom");
  assert.match(chunks[0], /^info \[owned\] trace=abcdefgh event=tick /);
  assert.equal(chunks[0].includes("owned-value"), false);
  assert.equal(chunks[0].includes("custom"), false);
});

test("directory failure is isolated and console still receives the record", async (context) => {
  const root = await fixture(context);
  const blocked = join(root, "file");
  await writeFile(blocked, "sentinel");
  const { port, chunks } = stream();
  assert.doesNotThrow(() => logger(join(blocked, "log"), { consoleStream: port }).info("accepted"));
  assert.equal(chunks.length, 1);
  assert.equal(await readFile(blocked, "utf8"), "sentinel");
});

test("append failure is isolated without replacing the existing path", async (context) => {
  const root = await fixture(context);
  const date = api.formatLocalLogDate(new Date());
  const blocked = join(root, `knorvia-${date}.jsonl`);
  await mkdir(blocked);
  const { port, chunks } = stream();
  assert.doesNotThrow(() => logger(root, { consoleStream: port }).warn("accepted"));
  assert.equal(chunks.length, 1);
  assert.deepEqual(await readdir(blocked), []);
});

test("projection/redactor/JSON failures propagate before IO or console", async (context) => {
  const root = join(await fixture(context), "absent");
  const { chunks, port } = stream();
  const failure = new Error("owned redactor");
  const l = logger(root, {
    consoleStream: port,
    redactor: {
      redact() {
        throw failure;
      },
    },
  });
  assert.throws(
    () => l.info("rejected"),
    (e) => e === failure,
  );
  assert.throws(
    () => logger(root, { consoleStream: port }).info("bigint", { value: 1n }),
    TypeError,
  );
  assert.equal(chunks.length, 0);
  await assert.rejects(readdir(root), { code: "ENOENT" });
});

test("console failure propagates after the record is already appended", async (context) => {
  const root = await fixture(context);
  const failure = new Error("owned console");
  const l = logger(root, {
    consoleStream: {
      write() {
        throw failure;
      },
    },
  });
  assert.throws(
    () => l.info("durable"),
    (e) => e === failure,
  );
  assert.equal((await records(root))[0].message, "durable");
});
