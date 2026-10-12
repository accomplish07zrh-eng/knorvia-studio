// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组最后一项（A15 read-file-state-hydrator）。
// 入口用文件级入口 `src/agent/read-file-state-hydrator.ts`（该导出不经区域桶）。
//
// 实测语义（读源码确认）：
// - 唯一运行时导出 `hydrateReadFileStateFromSession(input)`，入参需要 `readFileState`（实现调用 `clear()`/`set()`，
//   即 Map 语义）与 `messages`；返回 `{restoredCount, skippedRangeReadCount, skippedUnreadableEditCount}`。
// - 先 `readFileState.clear()`；只遍历**助手**消息，且消息内 part 按 `part.id` 去重（后者覆盖前者）。
// - 只接受 `type==="tool"`、`state.status==="completed"`、含 `output`、且 `tool ∈ {Read, Write, Edit}` 的 part。
// - `Read` 且窗口不是"全量"（`(offset ?? 1) <= 1 && limit === undefined` 之外）→ 计入 `skippedRangeReadCount`
//   （在 metadata 校验**之前**，保持旧日志统计口径）。
// - `skippedUnreadableEditCount` 在本投影里**从不自增**（恒 0）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const hydrator = await loadFile("agent/read-file-state-hydrator");
const hydrate = (input) => hydrator.hydrateReadFileStateFromSession(input);

const toolPart = (id, tool, state) => ({ id, type: "tool", tool, state });
const message = (id, role, parts) => ({ info: { id, role }, parts });
const baseInput = (messages, readFileState) => ({
  messages,
  readFileState,
  workingDirectory: "/w",
  workspaceRoot: "/w",
});

test("A15 hydrateReadFileStateFromSession：清空状态、计数形状与忽略规则", async () => {
  const states = new Map([["stale", { path: "/w/old.ts" }]]);
  const result = await hydrate(baseInput([], states));
  assert.deepEqual(result, {
    restoredCount: 0,
    skippedRangeReadCount: 0,
    skippedUnreadableEditCount: 0,
  });
  assert.equal(states.size, 0, "先 clear() 掉旧状态");
  assert.ok(states instanceof Map);

  const completed = { status: "completed", input: {}, output: "x", metadata: undefined };
  const rangeRead = toolPart("p1", "Read", { status: "completed", input: { offset: 5 }, output: "x" });
  const limitRead = toolPart("p2", "Read", { status: "completed", input: { limit: 10 }, output: "x" });
  const rangeResult = await hydrate(
    baseInput([message("m1", "assistant", [rangeRead, limitRead])], new Map()),
  );
  assert.deepEqual(rangeResult, {
    restoredCount: 0,
    skippedRangeReadCount: 2,
    skippedUnreadableEditCount: 0,
  });

  const ignored = [
    toolPart("p3", "Bash", completed),
    toolPart("p4", "Read", { status: "running", input: {}, output: "x" }),
    toolPart("p5", "Read", { status: "completed", input: {} }),
    { id: "p6", type: "text" },
  ];
  const ignoredResult = await hydrate(
    baseInput(
      [
        message("m2", "assistant", ignored),
        message("m3", "user", [toolPart("p7", "Read", { status: "completed", input: { offset: 2 }, output: "x" })]),
      ],
      new Map(),
    ),
  );
  assert.deepEqual(ignoredResult, {
    restoredCount: 0,
    skippedRangeReadCount: 0,
    skippedUnreadableEditCount: 0,
  });

  const fullWindowNoMetadata = await hydrate(
    baseInput([message("m4", "assistant", [toolPart("p8", "Read", completed)])], new Map()),
  );
  assert.deepEqual(
    fullWindowNoMetadata,
    { restoredCount: 0, skippedRangeReadCount: 0, skippedUnreadableEditCount: 0 },
    "全量窗口但 metadata 无效时不恢复",
  );

  const duplicated = await hydrate(
    baseInput(
      [
        message("m5", "assistant", [
          toolPart("same", "Read", { status: "completed", input: { offset: 3 }, output: "x" }),
          toolPart("same", "Read", { status: "completed", input: { offset: 4 }, output: "x" }),
        ]),
      ],
      new Map(),
    ),
  );
  assert.equal(duplicated.skippedRangeReadCount, 1, "同一 part.id 去重后只计一次");
});
