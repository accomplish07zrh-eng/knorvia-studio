// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-artifacts 的产物落盘顺序与状态字段。
// 覆盖：建目录写文本 → running 元数据 → completed/failed/stopped 三种终态的产物对与元数据。
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  writeCompleted,
  writeFailed,
  writeMetadata,
  writeStopped,
  writeText,
} from "../src/subagent/runner-artifacts.js";

const executionIn = (root: string) =>
  ({
    agentId: "agent-1",
    childSessionId: "child-1",
    metadataFile: join(root, "nested", "metadata.json"),
    outputFile: join(root, "out", "output.txt"),
    profile: { description: "d", name: "Explore", source: "built-in", systemPrompt: "" },
    request: {
      agentType: "Explore",
      description: "desc",
      parentToolCallId: "tool-1",
      prompt: "do it",
      sessionId: "sess-1",
      trace: { traceId: "trace-1" },
      turnId: "turn-1",
      workingDirectory: "/work",
      workspaceRoot: "/work",
    },
    startedMs: 1_700_000_000_000,
    taskOutputFile: join(root, "out", "task.output"),
  }) as never;

const readIfPresent = async (path: string) => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
};

test("writeText：自动建目录并原样写入 utf8 文本", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-artifacts-"));
  try {
    const target = join(root, "deep", "nested", "note.txt");
    await writeText(target, "hello\nworld");
    assert.equal(await readFile(target, "utf8"), "hello\nworld");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("writeMetadata：写 running 元数据，键序固定且 extra 并入末尾", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-artifacts-"));
  try {
    const execution = executionIn(root);
    await writeMetadata(execution as never, "running", { custom: 1 });
    const raw = await readFile((execution as { metadataFile: string }).metadataFile, "utf8");
    assert.ok(raw.endsWith("\n"), "元数据文件以换行收尾");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).slice(0, 4), [
      "agentId",
      "childSessionId",
      "createdAt",
      "cwd",
    ]);
    assert.equal(parsed.status, "running");
    assert.equal(parsed.custom, 1);
    assert.equal(parsed.profileId, "Explore");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("writeCompleted：两份输出内容一致，元数据记 completed 与用量", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-artifacts-"));
  try {
    const execution = executionIn(root);
    await writeCompleted(
      execution as never,
      {
        content: [{ text: "part one" }, { text: "part two" }],
        totalDurationMs: 1234,
        totalTokens: 567,
        totalToolUseCount: 8,
        usage: { input: 1, output: 2 },
      } as never,
    );
    const outputFile = (execution as { outputFile: string }).outputFile;
    const taskOutputFile = (execution as { taskOutputFile: string }).taskOutputFile;
    const expected = "part one\n\npart two";
    assert.equal(await readFile(outputFile, "utf8"), expected);
    assert.equal(await readFile(taskOutputFile, "utf8"), expected);
    const parsed = JSON.parse(
      await readFile((execution as { metadataFile: string }).metadataFile, "utf8"),
    ) as Record<string, unknown>;
    assert.equal(parsed.status, "completed");
    assert.equal(parsed.totalTokens, 567);
    assert.equal(parsed.totalToolUseCount, 8);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("writeFailed：错误文本写入两份输出，元数据记 failed 与 error", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-artifacts-"));
  try {
    const execution = executionIn(root);
    await writeFailed(execution as never, "boom");
    assert.equal(await readFile((execution as { outputFile: string }).outputFile, "utf8"), "boom");
    assert.equal(
      await readFile((execution as { taskOutputFile: string }).taskOutputFile, "utf8"),
      "boom",
    );
    const parsed = JSON.parse(
      await readFile((execution as { metadataFile: string }).metadataFile, "utf8"),
    ) as Record<string, unknown>;
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.error, "boom");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("writeStopped：写 task.output 与 stopped 元数据；无 outputFile 时不动任何文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-artifacts-"));
  try {
    const outputFile = join(root, "task", "output.txt");
    await writeStopped(
      {
        agentId: "agent-1",
        agentType: "Explore",
        childSessionId: "child-1",
        description: "desc",
        outputFile,
        parentSessionId: "sess-1",
        parentToolCallId: "tool-1",
        prompt: "do it",
      } as never,
      "stopped by user",
    );
    assert.equal(await readFile(outputFile, "utf8"), "stopped by user\n");
    assert.equal(await readFile(join(root, "task", "task.output"), "utf8"), "stopped by user\n");
    const parsed = JSON.parse(
      await readFile(join(root, "task", "metadata.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(parsed.status, "stopped");
    assert.equal(parsed.agentId, "agent-1");

    await writeStopped({ agentId: "agent-2" } as never, "ignored");
    assert.equal(await readIfPresent(join(root, "agent-2", "output.txt")), undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
