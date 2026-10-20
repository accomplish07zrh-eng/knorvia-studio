// SPDX-License-Identifier: Apache-2.0
// A67–A68：model-io 轨迹的尾读、段名归一、JSONL 还原、delta 拼接与 callSource 分类。
// 数据根通过公开的 setDataBaseDir 切换，夹具全部写在临时目录里。
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { importDeep } from "./entry.mjs";
import { makeTempRoot } from "./helpers.mjs";

const { readModelTrajectory } = await importDeep("agent/modelTrajectory.ts");
const { readTrajectoryFileTail, resolveModelIODirs, sanitizeSessionSegment } = await importDeep(
  "agent/modelTrajectoryFileTail.ts",
);

/** 数据根下的 model-io 目录（`<root>/.knorvia-studio/cli/{debug,rollout}`）。 */
async function modelIoDirs(t) {
  const root = await makeTempRoot(t);
  const dirs = resolveModelIODirs();
  assert.equal(dirs.length, 2);
  return { root, dirs };
}

const record = (fields) => JSON.stringify({ type: "model_io", ...fields });

async function writeJsonl(path, lines) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

describe("A67 轨迹尾读与段名归一", () => {
  it("sanitizeSessionSegment 只留安全字符、剥首尾横线、截到 80 字符", () => {
    assert.equal(sanitizeSessionSegment("abc-123_XY"), "abc-123_XY");
    assert.equal(sanitizeSessionSegment("a/b c!d"), "a-b-c-d");
    assert.equal(sanitizeSessionSegment("--trim--"), "trim");
    assert.equal(sanitizeSessionSegment("中文"), "");
    assert.equal(sanitizeSessionSegment(""), "");
    assert.equal(sanitizeSessionSegment("x".repeat(200)).length, 80);
    // 连续非法字符压成一个横线，不会膨胀。
    assert.equal(sanitizeSessionSegment("a///b"), "a-b");
  });

  it("readTrajectoryFileTail 全文读取时不截断，缺文件时抛 ENOENT", async (t) => {
    const { dirs } = await modelIoDirs(t);
    const path = join(dirs[0], "small.jsonl");
    await writeJsonl(path, ["line-1", "line-2"]);
    const tail = await readTrajectoryFileTail(path);
    assert.equal(tail.text, "line-1\nline-2\n");
    assert.equal(tail.bytesRead, Buffer.byteLength("line-1\nline-2\n"));
    assert.equal(tail.truncated, false);

    await assert.rejects(
      () => readTrajectoryFileTail(join(dirs[0], "missing.jsonl")),
      (error) => error.code === "ENOENT",
    );
  });

  it("超 32 MiB 只读尾部并丢掉第一条不完整行，truncated 为 true", async (t) => {
    const { dirs } = await modelIoDirs(t);
    const path = join(dirs[0], "huge.jsonl");
    // 32 MiB + 一行，保证从中间切入。
    const filler = "x".repeat(1024 * 1024);
    const lines = Array.from({ length: 33 }, () => filler);
    await writeJsonl(path, lines);
    const tail = await readTrajectoryFileTail(path);
    assert.equal(tail.truncated, true);
    assert.ok(tail.bytesRead <= 32 * 1024 * 1024);
    assert.equal(tail.text.startsWith("x"), true, "首行被切掉的残片已丢弃");
    assert.equal(tail.text.includes("\n\n"), false);
  });
});

describe("A68 model-io 记录还原与 callSource 分类", () => {
  it("只收同 sessionId 的 model_io 行，按 startedAt/requestId 排序并截断到最近 limit 条", async (t) => {
    const { dirs } = await modelIoDirs(t);
    const path = join(dirs[0], `model-io-${sanitizeSessionSegment("task-1")}.jsonl`);
    await writeJsonl(path, [
      record({ sessionId: "task-1", requestId: "r2", startedAt: "2026-01-01T00:00:02.000Z" }),
      record({ sessionId: "other", requestId: "rx", startedAt: "2026-01-01T00:00:09.000Z" }),
      "not json",
      record({ sessionId: "task-1", requestId: "r1", startedAt: "2026-01-01T00:00:01.000Z" }),
      JSON.stringify({ type: "other", sessionId: "task-1", requestId: "ry" }),
      record({ sessionId: "task-1", requestId: "r3", startedAt: "2026-01-01T00:00:03.000Z" }),
    ]);
    const all = await readModelTrajectory("task-1", 10);
    assert.deepEqual(
      all.records.map((entry) => entry.requestId),
      ["r1", "r2", "r3"],
      "按 startedAt 升序，其他 sessionId / 非 model_io / 坏行都跳过",
    );
    assert.equal(all.truncated, false);
    assert.equal(all.available, true);
    assert.deepEqual(all.sourceFiles, [path]);

    // limit 截断保留最近 N 条，并把 truncated 置 true。
    const trimmed = await readModelTrajectory("task-1", 2);
    assert.deepEqual(
      trimmed.records.map((entry) => entry.requestId),
      ["r2", "r3"],
      "超限时保留最近的记录",
    );
    assert.equal(trimmed.truncated, true);

    // 非法 limit 回落 200。
    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await readModelTrajectory("task-1", limit);
      assert.equal(result.records.length, 3, `limit=${limit} 回落默认值`);
      assert.equal(result.truncated, false);
    }
  });

  it("无匹配文件时返回空记录集而非抛错", async (t) => {
    await modelIoDirs(t);
    const result = await readModelTrajectory("nobody", 5);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.sourceFiles, []);
    assert.equal(result.truncated, false);
    assert.equal(result.available, true);
    assert.equal(result.taskId, "nobody");
  });

  it("delta 消息按 messageOffset 与前一条记录拼接还原", async (t) => {
    const { dirs } = await modelIoDirs(t);
    const path = join(dirs[0], "model-io-delta-task.jsonl");
    await writeJsonl(path, [
      record({
        sessionId: "delta-task",
        requestId: "r1",
        startedAt: "2026-01-01T00:00:01.000Z",
        request: { messages: [{ role: "user", content: "first" }] },
      }),
      record({
        sessionId: "delta-task",
        requestId: "r2",
        startedAt: "2026-01-01T00:00:02.000Z",
        request: {
          messagesKind: "delta",
          messageOffset: 1,
          messages: [{ role: "user", content: "second" }],
        },
      }),
    ]);
    const result = await readModelTrajectory("delta-task", 10);
    assert.deepEqual(
      result.records[1].request.messages.map((message) => message.parts[0].text),
      ["first", "second"],
      "delta 段拼在 offset 之前的前缀之后",
    );
    // kind 为 "tail" 时不拼接，原样保留。
    await writeJsonl(path, [
      record({
        sessionId: "delta-task",
        requestId: "r1",
        startedAt: "2026-01-01T00:00:01.000Z",
        request: { messages: [{ role: "user", content: "first" }] },
      }),
      record({
        sessionId: "delta-task",
        requestId: "r2",
        startedAt: "2026-01-01T00:00:02.000Z",
        request: {
          messagesKind: "tail",
          messageOffset: 1,
          messages: [{ role: "user", content: "second" }],
        },
      }),
    ]);
    const tailKind = await readModelTrajectory("delta-task", 10);
    assert.deepEqual(
      tailKind.records[1].request.messages.map((message) => message.parts[0].text),
      ["second"],
      "tail 不拼接",
    );
  });

  it("callSource 分类：main_turn/subagent/compact/sidecar 与 role 兜底", async (t) => {
    const { dirs } = await modelIoDirs(t);
    const path = join(dirs[0], "model-io-classify.jsonl");
    const cases = [
      ["main_turn", undefined, { kind: "main", querySource: "main_turn" }],
      ["subagent", undefined, { kind: "subagent", querySource: "subagent" }],
      ["compact", undefined, { kind: "compact", querySource: "compact" }],
      [undefined, "compact", { kind: "compact", querySource: undefined }],
      ["hook", undefined, { kind: "sidecar", querySource: "hook" }],
      [undefined, "subagent", { kind: "subagent" }],
      [undefined, undefined, { kind: "main" }],
    ];
    await writeJsonl(
      path,
      cases.map(([querySource, role], index) =>
        record({
          sessionId: "classify",
          requestId: `r${index}`,
          startedAt: `2026-01-01T00:00:0${index}.000Z`,
          ...(querySource ? { querySource } : {}),
          ...(role ? { model: { role } } : {}),
        }),
      ),
    );
    const result = await readModelTrajectory("classify", 20);
    assert.deepEqual(
      result.records.map((entry) => entry.callSource),
      cases.map(([, , expected]) => expected),
    );
    // 无 querySource 但系统提示是标题生成：推断成 session_title → sidecar。
    await writeJsonl(path, [
      record({
        sessionId: "classify",
        requestId: "title",
        startedAt: "2026-01-01T00:00:00.000Z",
        request: {
          messages: [
            { role: "system", content: "Generate a concise title for this coding session." },
            { role: "user", content: "hi" },
          ],
        },
      }),
    ]);
    const title = await readModelTrajectory("classify", 5);
    assert.deepEqual(title.records[0].callSource, {
      kind: "sidecar",
      querySource: "session_title",
    });
  });

  it("响应与错误映射：toolCalls/usage/finishReason 与 error 三键", async (t) => {
    const { dirs } = await modelIoDirs(t);
    const path = join(dirs[0], "model-io-map.jsonl");
    await writeJsonl(path, [
      record({
        sessionId: "map",
        requestId: "ok",
        startedAt: "2026-01-01T00:00:00.000Z",
        model: { modelId: "m1", providerId: "p1", source: "s" },
        request: {
          messages: [{ role: "user", content: "hi" }],
          toolNames: ["read", 7, "write"],
        },
        response: {
          finishReason: "tool-calls",
          text: "t",
          reasoningText: "rt",
          responseId: "resp-1",
          modelId: "m1",
          toolCalls: [{ id: "c1", name: "read", input: { path: "a" } }],
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, cacheReadTokens: 4 },
        },
      }),
      record({
        sessionId: "map",
        requestId: "err",
        startedAt: "2026-01-01T00:00:01.000Z",
        error: { name: "Boom", message: "bad", stack: "at x" },
      }),
      record({
        sessionId: "map",
        requestId: "empty-error",
        startedAt: "2026-01-01T00:00:02.000Z",
        error: {},
      }),
    ]);
    const result = await readModelTrajectory("map", 10);
    const [ok, err, emptyError] = result.records;
    assert.deepEqual(ok.model, { modelId: "m1", providerId: "p1", role: undefined, source: "s" });
    assert.deepEqual(ok.request.toolNames, ["read", "write"], "非字符串 toolName 被过滤");
    assert.equal(ok.response.finishReason, "tool-calls");
    assert.equal(ok.response.responseId, "resp-1");
    assert.deepEqual(ok.response.toolCalls, [
      { kind: "tool-call", toolCallId: "c1", toolName: "read", input: { path: "a" } },
    ]);
    assert.deepEqual(ok.response.usage, {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      cacheReadTokens: 4,
      reasoningTokens: undefined,
    });
    assert.deepEqual(err.error, { name: "Boom", message: "bad", stack: "at x" });
    assert.equal("error" in emptyError, false, "空 error 对象不产生 error 字段");
    assert.equal("response" in emptyError, false, "无 response 时该键缺席");
    assert.equal(emptyError.attempt, 1, "attempt 缺省为 1");
    assert.equal(emptyError.requestId, "empty-error");
  });
});
