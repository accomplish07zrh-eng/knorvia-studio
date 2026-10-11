// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：logging/*（B114–B121）。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load, loadContracts } from "./entry.mjs";

const { LogLevel } = await loadContracts();
const logging = await load("logging/index");
const entryModule = await load("logging/entry");
const fileSink = await load("logging/file-sink");
const retention = await load("logging/retention");
const serialize = await load("logging/serialize");

async function tempDir(t, prefix = "knorvia-contract-log-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

function todayFile(directory) {
  return join(directory, `knorvia-${retention.formatLocalLogDate(new Date())}.jsonl`);
}

test("B114 NodeFileLogger 的级别门控与写入路径", async (t) => {
  const logDir = await tempDir(t);
  let minimum = LogLevel.Warn;
  const lines = [];
  const logger = new logging.NodeFileLogger({
    category: "knorvia-test",
    getMinLevel: () => minimum,
    logDir,
    consoleStream: { write: (line) => lines.push(line) },
    redactor: new serialize.DefaultLogRedactor(),
  });
  logger.debug("debug message");
  logger.info("info message");
  assert.deepEqual(await readdir(logDir), []);
  assert.deepEqual(lines, []);
  logger.warn("warn message", { event: "e" });
  const written = await readFile(todayFile(logDir), "utf8");
  const record = JSON.parse(written.trim());
  assert.equal(record.level, "warn");
  assert.equal(record.event, "e");
  assert.equal(record.module, "knorvia-test");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].startsWith("warn [knorvia-test]"), true);
  lines.length = 0;
  minimum = LogLevel.Error;
  logger.warn("hidden");
  assert.equal(lines.length, 0);
  logger.error("boom", new Error("failure"), { event: "x" });
  const errorRecord = JSON.parse(
    (await readFile(todayFile(logDir), "utf8")).trim().split("\n").at(-1),
  );
  assert.equal(errorRecord.error.name, "Error");
  const childLogged = logger.child({ sessionId: "s-1" });
  minimum = LogLevel.Debug;
  childLogged.info("child message");
  const childRecord = JSON.parse(
    (await readFile(todayFile(logDir), "utf8")).trim().split("\n").at(-1),
  );
  assert.equal(childRecord.sessionId, "s-1");
});

test("B115 createNodeLoggerFactory 的默认值与调度", async (t) => {
  const logDir = await tempDir(t);
  const factory = logging.createNodeLoggerFactory({
    env: { KNORVIA_LOG_DIR: logDir, KNORVIA_LOG_CONSOLE: "1", KNORVIA_RUNTIME_ENV: "test" },
    minLevel: "debug",
  });
  assert.equal(factory.getLogDir(), logDir);
  factory.createLogger("knorvia").info("hello");
  assert.equal(JSON.parse((await readFile(todayFile(logDir), "utf8")).trim()).message, "hello");
  const defaultDirFactory = logging.createNodeLoggerFactory({
    env: { KNORVIA_HOME: await tempDir(t) },
  });
  assert.equal(defaultDirFactory.getLogDir().endsWith(join("cli", "log")), true);
  const developmentDir = await tempDir(t);
  const development = logging.createNodeLoggerFactory({
    env: { KNORVIA_LOG_DIR: developmentDir, KNORVIA_RUNTIME_ENV: "development" },
  });
  development.createLogger("knorvia").debug("dev");
  assert.equal(
    JSON.parse((await readFile(todayFile(developmentDir), "utf8")).trim()).level,
    "debug",
  );
  const productionDir = await tempDir(t);
  const production = logging.createNodeLoggerFactory({
    env: { KNORVIA_LOG_DIR: productionDir, KNORVIA_RUNTIME_ENV: "production" },
  });
  production.createLogger("knorvia").debug("prod");
  assert.deepEqual(await readdir(productionDir), []);
  const scoped = factory.withContext({ a: 1 });
  scoped.info("scoped");
  const scopedRecord = JSON.parse(
    (await readFile(todayFile(logDir), "utf8")).trim().split("\n").at(-1),
  );
  assert.deepEqual(scopedRecord.context, { a: 1 });
  factory.setLevel("error");
  factory.createLogger("knorvia").warn("hidden now");
  const afterSetLevel = (await readFile(todayFile(logDir), "utf8")).trim().split("\n").length;
  assert.equal(afterSetLevel, 3);
  let unrefed = false;
  const timer = factory.scheduleLogRetentionCleanup({
    delayMs: 1,
    setTimeout: () => ({
      unref() {
        unrefed = true;
      },
    }),
  });
  assert.equal(typeof timer, "object");
  assert.equal(unrefed, true);
  assert.equal(factory.scheduleLogRetentionCleanup({ delayMs: 1 }), undefined);
});

test("B116 日志条目字段投影", () => {
  const entry = entryModule.projectLogEntry(
    "cat",
    LogLevel.Info,
    "m",
    {
      module: "mod",
      traceId: "t",
      event: "e",
      sessionId: "s",
      durationMs: 5,
      status: "completed",
      extra: 1,
    },
    undefined,
    false,
  );
  assert.equal(entry.module, "mod");
  assert.equal(entry.traceId, "t");
  assert.equal(entry.event, "e");
  assert.equal(entry.sessionId, "s");
  assert.equal(entry.durationMs, 5);
  assert.equal(entry.status, "completed");
  assert.deepEqual(entry.context, { extra: 1 });
  assert.equal(entry.error, undefined);
  assert.equal(entry.levelName, "INFO");
  assert.equal(
    entryModule.projectLogEntry("cat", LogLevel.Info, "m", { module: 1 }, undefined, false).module,
    "cat",
  );
  assert.equal(
    entryModule.projectLogEntry("cat", LogLevel.Info, "m", { traceId: 42 }, undefined, false)
      .traceId,
    42,
  );
  assert.equal(
    entryModule.projectLogEntry("cat", LogLevel.Info, "m", { status: "bogus" }, undefined, false)
      .status,
    undefined,
  );
  assert.equal(
    entryModule.projectLogEntry("cat", LogLevel.Info, "m", { event: "" }, undefined, false).event,
    "",
  );
  const withError = entryModule.projectLogEntry(
    "cat",
    LogLevel.Error,
    "m",
    {},
    new Error("boom"),
    false,
  );
  assert.equal(withError.error.name, "Error");
  assert.equal(Object.hasOwn(withError.error, "stack"), false);
});

test("B117 日志文件追加与失败吞掉", async (t) => {
  const directory = join(await tempDir(t), "nested", "log");
  fileSink.appendLogRecord(directory, '{"a":1}');
  assert.equal(await readFile(todayFile(directory), "utf8"), '{"a":1}\n');
  fileSink.appendLogRecord(directory, '{"b":2}');
  const lines = (await readFile(todayFile(directory), "utf8")).trim().split("\n");
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  const blocker = join(await tempDir(t), "blocker");
  await writeFile(blocker, "keep");
  assert.equal(fileSink.appendLogRecord(blocker, "{}"), undefined);
  assert.equal(await readFile(blocker, "utf8"), "keep");
});

test("B118 脱敏器与保留键剥离", () => {
  const redactor = new serialize.DefaultLogRedactor();
  assert.deepEqual(redactor.redact({ apiKey: "x", nested: { token: "y" }, keep: "z" }), {
    apiKey: "[Redacted]",
    nested: { token: "[Redacted]" },
    keep: "z",
  });
  assert.equal(redactor.redact({ authorization: "Bearer abc" }).authorization, "[Redacted]");
  const sparse = redactor.redact({ a: [1, , 3] });
  assert.equal(sparse.a.length, 3);
  assert.equal(1 in sparse.a, false);
  let deep = { value: 1 };
  for (let index = 0; index < 12; index += 1) deep = { next: deep };
  const redactedDeep = redactor.redact(deep);
  let cursor = redactedDeep;
  let sawLimit = false;
  for (let index = 0; index < 12; index += 1) {
    cursor = cursor.next;
    if (cursor === "[Redacted:DepthLimit]") {
      sawLimit = true;
      break;
    }
  }
  assert.equal(sawLimit, true);
  const circular = {};
  circular.self = circular;
  assert.equal(redactor.redact(circular).self, "[Redacted:Circular]");
  assert.equal(redactor.redact("Authorization: Bearer abc").includes("Bearer abc"), false);
  assert.deepEqual(serialize.stripReservedContext({ traceId: "t", extra: 1 }), { extra: 1 });
  assert.equal(serialize.stripReservedContext({ traceId: "t" }), undefined);
  assert.equal(serialize.isLogStatus("waiting"), true);
  assert.equal(serialize.isLogStatus("running"), false);
});

test("B119 序列化、console 行与错误链", () => {
  const redactor = new serialize.DefaultLogRedactor();
  const serialized = serialize.toSerializableEntry(
    {
      timestamp: new Date("2026-01-02T03:04:05.678Z"),
      level: LogLevel.Warn,
      levelName: "WARN",
      message: "m",
      module: "mod",
      traceId: "abcdefghijk",
      context: { a: 1 },
      error: { name: "E", message: "x" },
    },
    redactor,
  );
  assert.deepEqual(Object.keys(serialized), [
    "timestamp",
    "level",
    "module",
    "message",
    "traceId",
    "context",
    "error",
  ]);
  assert.equal(serialized.timestamp, "2026-01-02T03:04:05.678Z");
  assert.equal(serialized.level, "warn");
  assert.equal(
    serialize.formatConsoleLine({
      levelName: "INFO",
      module: "m",
      traceId: "1234567890",
      event: "e",
      message: "hi",
    }),
    "info [m] trace=12345678 event=e hi",
  );
  assert.equal(serialize.formatConsoleLine({ levelName: "INFO", message: "hi" }), "info [log] hi");
  const plain = serialize.serializeLogError(new Error("boom"), false);
  assert.deepEqual(plain, { name: "Error", message: "boom" });
  assert.equal(typeof serialize.serializeLogError(new Error("boom"), true).stack, "string");
  const circular = new Error("a");
  circular.cause = circular;
  assert.equal(
    serialize.serializeLogError(circular, false).cause.name,
    "ErrorCauseCircularReference",
  );
  const coded = Object.assign(new Error("x"), { code: "E1", type: "T1" });
  const codedSerialized = serialize.serializeLogError(coded, false);
  assert.equal(codedSerialized.code, "E1");
  assert.equal(codedSerialized.type, "T1");
  const emptyCode = Object.assign(new Error("x"), { code: "" });
  assert.equal(Object.hasOwn(serialize.serializeLogError(emptyCode, false), "code"), false);
  assert.equal(serialize.serializeLogError("nope", false).name, "UnknownError");
});

test("B120 日志保留清理与调度", async (t) => {
  const logDir = await tempDir(t);
  await writeFile(join(logDir, "knorvia-2026-01-01.jsonl"), "{}\n");
  await writeFile(join(logDir, "knorvia-2026-01-05.jsonl"), "{}\n");
  await writeFile(join(logDir, "other.jsonl"), "{}\n");
  await writeFile(join(logDir, "knorvia-bad.jsonl"), "{}\n");
  await mkdir(join(logDir, "knorvia-2026-01-02.jsonl"), { recursive: true });
  const warnings = [];
  const debugs = [];
  const logger = {
    debug: (...args) => debugs.push(args),
    info: () => {},
    warn: (...args) => warnings.push(args),
  };
  const first = await retention.cleanupLogRetention({ logDir, logger, now: new Date(2026, 0, 6) });
  assert.equal(first.cutoffDate, "2025-12-31");
  assert.equal(first.scannedFiles, 2);
  assert.deepEqual(first.deletedFiles, []);
  assert.equal(first.status, "completed");
  assert.equal(warnings.length, 0);
  const second = await retention.cleanupLogRetention({ logDir, logger, now: new Date(2026, 0, 9) });
  assert.equal(second.cutoffDate, "2026-01-03");
  assert.deepEqual(second.deletedFiles, ["knorvia-2026-01-01.jsonl"]);
  assert.equal(second.status, "completed");
  assert.equal(debugs.at(-1)[0], "Log retention cleanup completed");
  assert.deepEqual((await readdir(logDir)).sort(), [
    "knorvia-2026-01-02.jsonl",
    "knorvia-2026-01-05.jsonl",
    "knorvia-bad.jsonl",
    "other.jsonl",
  ]);
  const missing = await retention.cleanupLogRetention({ logDir: join(logDir, "nope"), logger });
  assert.equal(missing.status, "completed");
  assert.equal(missing.scannedFiles, 0);
  for (const [input, expected] of [
    [undefined, 7],
    [Number.NaN, 7],
    [0, 1],
    [-3, 1],
    [3, 3],
  ]) {
    const result = await retention.cleanupLogRetention({ logDir, retentionDays: input, logger });
    assert.equal(result.retentionDays, expected);
  }
  assert.equal(retention.LOG_RETENTION_DAYS, 7);
  assert.equal(retention.LOG_CLEANUP_STARTUP_DELAY_MS, 60000);
  assert.equal(retention.formatLocalLogDate(new Date(2026, 0, 2)), "2026-01-02");
  let captured;
  let unrefed = false;
  const infos = [];
  const scheduled = retention.scheduleLogRetentionCleanup({
    logDir,
    logger: { ...logger, info: (...args) => infos.push(args) },
    delayMs: 5,
    now: () => new Date(2026, 0, 9),
    setTimeout: (callback) => {
      captured = callback;
      return {
        unref() {
          unrefed = true;
        },
      };
    },
  });
  assert.equal(unrefed, true);
  assert.equal(typeof scheduled, "object");
  assert.equal(infos[0][1].status, "waiting");
  captured();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(debugs.at(-1)[1].status, "completed");
});

test("B121 logging 导出面", async () => {
  assert.deepEqual(Object.keys(logging).sort(), [
    "DefaultLogRedactor",
    "LOG_CLEANUP_STARTUP_DELAY_MS",
    "LOG_RETENTION_DAYS",
    "NodeFileLogger",
    "cleanupLogRetention",
    "createNodeLoggerFactory",
    "formatLocalLogDate",
    "getDefaultLogDir",
    "scheduleLogRetentionCleanup",
  ]);
  assert.equal(logging.initialLevel, undefined);
  assert.equal(typeof logging.getDefaultLogDir(), "string");
  assert.deepEqual(Object.keys(entryModule), ["projectLogEntry"]);
  assert.deepEqual(Object.keys(fileSink), ["appendLogRecord"]);
  assert.deepEqual(Object.keys(retention).sort(), [
    "LOG_CLEANUP_STARTUP_DELAY_MS",
    "LOG_RETENTION_DAYS",
    "cleanupLogRetention",
    "formatLocalLogDate",
    "scheduleLogRetentionCleanup",
  ]);
  assert.deepEqual(Object.keys(serialize).sort(), [
    "DefaultLogRedactor",
    "formatConsoleLine",
    "isLogStatus",
    "serializeLogError",
    "stripReservedContext",
    "toSerializableEntry",
  ]);
  assert.equal(logging.DefaultLogRedactor, serialize.DefaultLogRedactor);
  assert.equal(retention.daysToKeep, undefined);
  assert.equal(serialize.errorNode, undefined);
  assert.equal(retention.formatLocalLogDate(new Date(2026, 0, 2)), "2026-01-02");
  assert.equal(serialize.stripReservedContext({ traceId: "t" }), undefined);
});
