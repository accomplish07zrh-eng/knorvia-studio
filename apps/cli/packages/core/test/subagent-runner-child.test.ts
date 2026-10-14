// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-child 的就绪序列与失败路径。
// 注入假 runExploreAgent，只断言「就绪回调的调用次数与顺序」，不依赖子会话结果形状。
import assert from "node:assert/strict";
import { test } from "node:test";

import { runChild } from "../src/subagent/runner-child.js";
import { createExecution, createState } from "../src/subagent/runner-state.js";

const profile = {
  description: "d",
  name: "Explore",
  source: "built-in",
  systemPrompt: "",
} as never;
const request = {
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

type FakeInput = {
  agentId: string;
  description: string;
  onSessionReady?: () => Promise<void>;
  prompt: string;
  sessionId: string;
};

const harness = (runtime: (input: FakeInput) => Promise<unknown>) => {
  const state = createState({ profiles: [], runExploreAgent: runtime } as never);
  const execution = createExecution(state, request, profile);
  return { execution, state };
};

test("runChild：就绪回调只生效一次（运行时重复调用不重复触发 onReady）", async () => {
  let readyCalls = 0;
  const seen: FakeInput[] = [];
  const { execution, state } = harness(async (input) => {
    seen.push(input);
    await input.onSessionReady?.();
    await input.onSessionReady?.();
    return { status: "ok" };
  });
  await runChild(state, execution, {} as never, async () => {
    readyCalls += 1;
  }).catch(() => undefined);
  assert.equal(readyCalls, 1, "onReady 只应触发一次");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.agentId, execution.agentId);
  assert.equal(seen[0]!.sessionId, execution.childSessionId);
  assert.equal(seen[0]!.description, "d");
  assert.equal(seen[0]!.prompt, "p");
});

test("runChild：运行时未主动上报就绪时，runChild 自己补一次就绪（onReady 恰好一次）", async () => {
  let readyCalls = 0;
  const { execution, state } = harness(async () => ({ status: "ok" }));
  await runChild(state, execution, {} as never, async () => {
    readyCalls += 1;
  }).catch(() => undefined);
  assert.equal(readyCalls, 1, "实测：runChild 在运行时返回后会自行补一次就绪");
});

test("runChild：运行时拒绝时不触发 onReady（失败不得被当成就绪）", async () => {
  let readyCalls = 0;
  const { execution, state } = harness(async () => {
    throw new Error("child runtime down");
  });
  await assert.rejects(
    runChild(state, execution, {} as never, async () => {
      readyCalls += 1;
    }),
  );
  assert.equal(readyCalls, 0, "启动失败时 onReady 必须保持未触发");
});

test("runChild：没有 onReady 回调时也能跑完就绪路径（可选回调）", async () => {
  const { execution, state } = harness(async (input) => {
    await input.onSessionReady?.();
    return { status: "ok" };
  });
  await runChild(state, execution, {} as never).catch(() => undefined);
  assert.ok(true, "无 onReady 时不应抛「回调缺失」类错误");
});
