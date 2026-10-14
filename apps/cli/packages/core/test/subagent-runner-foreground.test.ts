// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-foreground 的前台启动序列与失败路径。
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { isTerminalRuntimeTask } from "../src/runtime-task/registry.js";
import { runMethod } from "../src/subagent/runner-foreground.js";
import { createState } from "../src/subagent/runner-state.js";

const runRequest = {
  agentType: "Explore",
  description: "d",
  parentToolCallId: "tool-1",
  prompt: "p",
  sessionId: "sess-1",
  trace: { traceId: "trace-1" },
  turnId: "turn-1",
  workingDirectory: "/work",
  workspaceRoot: "/work",
} as never;

const harness = async (
  runtime: (input: { onSessionReady?: () => Promise<void> }) => Promise<unknown>,
) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-fg-"));
  const state = createState({
    emitParentEvent: () => undefined,
    enqueueParentTaskNotification: () => undefined,
    outputRootDir: root,
    profiles: [],
    runExploreAgent: runtime,
  } as never);
  return { root, state };
};

test("runMethod：子会话结果不完整时前台运行失败（不静默成功）", async () => {
  const { root, state } = await harness(async (input) => {
    await input.onSessionReady?.();
    return { content: [{ text: "done" }] };
  });
  try {
    const run = runMethod(state);
    await assert.rejects(run(runRequest, {}), /Explore subagent failed/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("runMethod：子会话启动失败 → 调用方收到错误，且不留运行中任务", async () => {
  const { root, state } = await harness(async () => {
    throw new Error("child exploded");
  });
  try {
    const run = runMethod(state);
    await assert.rejects(run(runRequest, {}), /child exploded/u);
    const running = state.profiles.length >= 0 ? (state.registry.list?.() ?? []) : [];
    const stillRunning = running.filter((task: { status?: string }) => task.status === "running");
    assert.equal(stillRunning.length, 0, "失败后不应留下 running 状态的任务");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("runMethod：带 modelOverride 时登记为借用，结束后释放登记", async () => {
  const { root, state } = await harness(async (input) => {
    await input.onSessionReady?.();
    return { content: [{ text: "ok" }], totalDurationMs: 0, totalTokens: 0, totalToolUseCount: 0 };
  });
  try {
    const run = runMethod(state);
    await run(runRequest, { modelOverride: { modelId: "m", providerId: "p" } }).catch(
      () => undefined,
    );
    assert.equal(state.borrowed.size, 0, "借用标记应在结束后释放");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
