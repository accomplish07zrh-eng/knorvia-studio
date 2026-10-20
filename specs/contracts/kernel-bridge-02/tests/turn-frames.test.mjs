// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B11/B12：回合事件 → v4 帧的派生规则。
//
// 本模块是**纯派生**：输入一条 DSH 回合事件的判别形状，输出「该产出哪些行操作」。
// 因此可以用最小事件形状直接断言，不需要真实 DSH 运行时，也不依赖模型。
import { join as combinePath } from "node:path";
import { pathToFileURL as moduleUrlOf } from "node:url";
import { repoRoot as workspaceRoot } from "./entry.mjs";
import { strict as strictAssert } from "node:assert";
import { test as caseTest } from "node:test";

/** 派生模块的源码入口。 */
const FRAME_MODULE = combinePath(
  workspaceRoot,
  "apps/cli/packages/bootstrap/src/kernel-bridge/turn-frames.ts",
);

/**
 * 载入派生模块。
 *
 * @returns 该模块的命名空间。
 */
async function loadFrameModule() {
  return import(moduleUrlOf(FRAME_MODULE).href);
}

caseTest("B11 assistant 文本增量产出 assistantText 行", async () => {
  const { deriveTurnFrame } = await loadFrameModule();
  const derived = deriveTurnFrame({ type: "assistant/delta", textDelta: "hello" }, "turn-1");
  strictAssert.equal(derived.concludesTurn, false, "文本增量不结束回合");
  strictAssert.equal(derived.rows.length, 1, "一条文本增量产一行");
  strictAssert.equal(derived.rows[0].rowKind, "assistantText", "行种类必须是 assistantText");
  strictAssert.equal(derived.rows[0].op, "row.appended", "新行用 row.appended");
  strictAssert.equal(derived.rows[0].turnId, "turn-1", "行必须携带所属回合");
});

caseTest("B11 空文本增量不产行（避免空行污染序号）", async () => {
  const { deriveTurnFrame } = await loadFrameModule();
  const derived = deriveTurnFrame({ type: "assistant/delta", textDelta: "" }, "turn-1");
  strictAssert.deepEqual(derived.rows, [], "空增量不得产行");
  strictAssert.equal(derived.concludesTurn, false);
});

caseTest("B11 工具调用产出 toolCall 行", async () => {
  const { deriveTurnFrame } = await loadFrameModule();
  const derived = deriveTurnFrame(
    { type: "tool/call", toolCall: { id: "call-1", name: "read" } },
    "turn-1",
  );
  strictAssert.equal(derived.rows.length, 1, "一次工具调用产一行");
  strictAssert.equal(derived.rows[0].rowKind, "toolCall", "行种类必须是 toolCall");
  strictAssert.equal(derived.concludesTurn, false, "工具调用不结束回合");
});

caseTest("B11 回合边界只标结束、不产行", async () => {
  const { deriveTurnFrame } = await loadFrameModule();
  const derived = deriveTurnFrame({ type: "turn/end", stopReason: "end_turn" }, "turn-1");
  strictAssert.deepEqual(derived.rows, [], "回合边界不是「行」，不得产行");
  strictAssert.equal(derived.concludesTurn, true, "回合边界必须标 concluding");
  strictAssert.equal(derived.conclusionReason, "completed", "正常结束归 completed");
});

caseTest("B11 回合结束原因：取消归 cancelled、失败归 failed", async () => {
  const { deriveTurnFrame } = await loadFrameModule();
  for (const [stopReason, expected] of [
    ["aborted", "cancelled"],
    ["user_cancel", "cancelled"],
    ["tool_error", "failed"],
    ["failed", "failed"],
    ["end_turn", "completed"],
    [undefined, "completed"],
  ]) {
    const derived = deriveTurnFrame({ type: "turn/end", stopReason }, "turn-1");
    strictAssert.equal(
      derived.conclusionReason,
      expected,
      `stopReason=${JSON.stringify(stopReason)} 应归 ${expected}`,
    );
  }
});

caseTest("B11 与本包无关的事件不产行、不结束回合", async () => {
  const { deriveTurnFrame } = await loadFrameModule();
  for (const type of ["session/meta", "compact/checkpoint", "goal/set", "subagent/catalog"]) {
    const derived = deriveTurnFrame({ type }, "turn-1");
    strictAssert.deepEqual(derived.rows, [], `${type} 不应由本包派生出帧`);
    strictAssert.equal(derived.concludesTurn, false, `${type} 不得结束回合`);
  }
});

caseTest("B12 同一帧的行不跨回合", async () => {
  const { rowsShareOneTurn } = await loadFrameModule();
  const oneTurn = [
    { op: "row.appended", turnId: "turn-1", rowKind: "assistantText" },
    { op: "row.appended", turnId: "turn-1", rowKind: "toolCall" },
  ];
  strictAssert.equal(rowsShareOneTurn(oneTurn), true, "同回合的行可以合成一帧");
  const twoTurns = [
    { op: "row.appended", turnId: "turn-1", rowKind: "assistantText" },
    { op: "row.appended", turnId: "turn-2", rowKind: "assistantText" },
  ];
  strictAssert.equal(rowsShareOneTurn(twoTurns), false, "跨回合的行必须拆帧，否则序号回退");
  strictAssert.equal(rowsShareOneTurn([]), true, "空集视为同回合");
  strictAssert.equal(rowsShareOneTurn([oneTurn[0]]), true, "单行视为同回合");
});
