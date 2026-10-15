// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：标识、错误与日志工具（B1–B5）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { barrel } from "./entry.mjs";

const {
  uuidv7,
  createUuid,
  stringifyUnknownValue,
  normalizeUnknownError,
  isKnorviaFileLockTimeoutError,
  KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE,
  formatTimestamp,
  formatLogPrefix,
  compareSemverVersions,
  resolveForceUpdateRequirement,
  ApiError,
} = barrel;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

test("B1 uuidv7：48 位时间戳前缀、版本位 7、变体位 10", () => {
  const now = 1_760_000_000_123;
  const id = uuidv7(now);
  assert.match(id, UUID_SHAPE);
  const hex = id.replaceAll("-", "");
  const timestamp = Number(BigInt(`0x${hex.slice(0, 12)}`));
  assert.equal(timestamp, now, "前 48 位应为 now 的大端毫秒时间戳");
  assert.equal(hex[12], "7", "版本位应为 7");
  assert.ok(["8", "9", "a", "b"].includes(hex[16]), "变体位应为 10xxxx");
  assert.notEqual(uuidv7(now), uuidv7(now), "同时间戳两次调用因随机位应不同");
});

test("B2 createUuid：8-4-4-4-12 且版本位 4、变体位 10", () => {
  const id = createUuid();
  assert.match(id, UUID_SHAPE);
  const hex = id.replaceAll("-", "");
  assert.equal(hex[12], "4");
  assert.ok(["8", "9", "a", "b"].includes(hex[16]));
  const second = createUuid();
  assert.notEqual(id, second);
});

test("B3 stringifyUnknownValue：字符串原样、null/undefined 字面量、对象 JSON、循环引用退 String", () => {
  assert.equal(stringifyUnknownValue("abc"), "abc");
  assert.equal(stringifyUnknownValue(null), "null");
  assert.equal(stringifyUnknownValue(undefined), "undefined");
  assert.equal(stringifyUnknownValue(42), "42");
  assert.equal(stringifyUnknownValue(false), "false");
  assert.equal(stringifyUnknownValue({ a: 1 }), '{"a":1}');
  const circular = { self: null };
  circular.self = circular;
  assert.equal(typeof stringifyUnknownValue(circular), "string");
  assert.ok(stringifyUnknownValue(circular).length > 0);
  assert.equal(
    stringifyUnknownValue(() => 1),
    String(() => 1),
  );
});

test("B3 normalizeUnknownError：Error 空消息退 name、code 归一、嵌套 error 解包", () => {
  const plain = normalizeUnknownError(new Error("boom"));
  assert.deepEqual(plain, { message: "boom", code: undefined });
  const empty = normalizeUnknownError(new TypeError(""));
  assert.equal(empty.message, "TypeError");
  const withCode = Object.assign(new Error("io"), { code: 42 });
  assert.equal(normalizeUnknownError(withCode).code, "42");
  const nested = normalizeUnknownError({ error: { message: "inner", code: "E1" } });
  assert.deepEqual(nested, { message: "inner", code: "E1" });
  const record = normalizeUnknownError({ message: { detail: 1 }, code: "C" });
  assert.equal(record.message, '{"detail":1}');
  assert.equal(record.code, "C");
  assert.equal(normalizeUnknownError(7).message, "7");
});

test("B3 isKnorviaFileLockTimeoutError 与错误码常量", () => {
  assert.equal(KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE, "KNORVIA_FILE_LOCK_TIMEOUT");
  assert.equal(isKnorviaFileLockTimeoutError({ code: "KNORVIA_FILE_LOCK_TIMEOUT" }), true);
  assert.equal(isKnorviaFileLockTimeoutError(new Error("x")), false);
});

test("B4 formatTimestamp / formatLogPrefix：固定格式与 pid 段", () => {
  const stamp = formatTimestamp(new Date(2026, 0, 2, 3, 4, 5, 6));
  assert.equal(stamp, "2026-01-02 03:04:05.006");
  const withPid = formatLogPrefix("main", 12345);
  assert.match(withPid, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[pid:12345\] \[main\]$/u);
  const noPid = formatLogPrefix("host");
  assert.match(noPid, /^\[[^\]]+\] \[host\]$/u);
  assert.ok(!noPid.includes("[pid:"), "无 pid 时不得出现 pid 段");
});

test("B5 compareSemverVersions：简写补零、v 前缀、build 忽略、prerelease 逐段", () => {
  assert.equal(compareSemverVersions(" v4.5 ", "4.5.0+fixture"), 0);
  assert.equal(compareSemverVersions("4.5.0-beta.2", "4.5.0-beta.11"), -1);
  assert.equal(compareSemverVersions("4.5.0-1", "4.5.0-a"), -1);
  assert.equal(compareSemverVersions("4.5.0", "4.5.0-alpha"), 1);
  assert.equal(compareSemverVersions("4.5-beta", "4.5.0"), null);
  assert.equal(compareSemverVersions("invalid", "4"), null);
  assert.equal(compareSemverVersions("1.2.3", "1.2.4"), -1);
  assert.equal(compareSemverVersions("2", "1.9.9"), 1);
});

test("B5 resolveForceUpdateRequirement：缺省/达标/不达标/非法", () => {
  assert.equal(resolveForceUpdateRequirement({ currentVersion: "1.0.0" }), null);
  assert.equal(
    resolveForceUpdateRequirement({
      currentVersion: "1.0.0",
      forceUpdate: { minimalVersion: "  " },
    }),
    null,
  );
  assert.equal(
    resolveForceUpdateRequirement({
      currentVersion: "2.0.0",
      forceUpdate: { minimalVersion: "1.0.0" },
    }),
    null,
  );
  assert.equal(
    resolveForceUpdateRequirement({
      currentVersion: "1.0.0",
      forceUpdate: { minimalVersion: "invalid" },
    }),
    null,
  );
  assert.deepEqual(
    resolveForceUpdateRequirement({
      currentVersion: "1.0.0",
      forceUpdate: { minimalVersion: " 1.5 " },
    }),
    { currentVersion: "1.0.0", minimalVersion: "1.5" },
  );
});

test("B12 ApiError：name、method 缺省 GET 且大写、字段透传", () => {
  const error = new ApiError({ message: "fail", url: "https://example.com/x", status: 404 });
  assert.equal(error.name, "ApiError");
  assert.equal(error.method, "GET");
  assert.equal(error.status, 404);
  assert.equal(error.url, "https://example.com/x");
  const post = new ApiError({
    message: "m",
    url: "u",
    method: "post",
    responseHeaders: { a: "b" },
  });
  assert.equal(post.method, "POST");
  assert.deepEqual(post.responseHeaders, { a: "b" });
  const caused = new ApiError({ message: "m", url: "u", cause: new Error("root") });
  assert.equal(caused.cause.message, "root");
});
