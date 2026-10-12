// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 区公开面（A9）。入口用本区公开桶 `src/agent/index.ts`
// （包根在 tsx 下不可加载，见 known-differences.md §2）。
// 区域桶的运行时导出集合是兼容面的一部分：多一个少一个都算违约（内部模块不经桶导出）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const agent = await loadFile("agent/index");

test("A9 agent 区公开面（区域桶的 10 个运行时导出）", () => {
  assert.deepEqual(
    Object.keys(agent).sort(),
    [
      "MessageHistoryImpl",
      "TurnMachineImpl",
      "TurnPhase",
      "activeSessionMessages",
      "canTransitionTo",
      "createMessageHistory",
      "createTurnState",
      "hydrateMessageHistoryFromSession",
      "isTerminalPhase",
      "isWaitingPhase",
    ],
    "区域桶运行时导出集合是兼容面的一部分",
  );

  for (const name of [
    "MessageHistoryImpl",
    "TurnMachineImpl",
    "createMessageHistory",
    "createTurnState",
    "activeSessionMessages",
    "hydrateMessageHistoryFromSession",
    "canTransitionTo",
    "isTerminalPhase",
    "isWaitingPhase",
  ])
    assert.equal(typeof agent[name], "function", `${name} 必须是函数`);
  assert.equal(typeof agent.TurnPhase, "object");
  assert.equal(agent.TurnPhase.Idle, "idle");

  // 内部可达的模块不经区域桶导出（各自的行为见 behavior.md A2/A3/A8）。
  for (const internal of [
    "selectToolPartsForHistory",
    "runtimeInputMetadata",
    "compactActiveSessionMessages",
  ])
    assert.equal(agent[internal], undefined, `${internal} 不应出现在区域桶`);
});
