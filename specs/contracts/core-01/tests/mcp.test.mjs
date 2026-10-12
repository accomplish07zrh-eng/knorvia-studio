// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：MCP 块的**公开可达**部分（M1 / M3 阈值 / M4 导出面）。
//
// 入口：区域桶 `src/mcp/index.ts`（包根 `src/index.ts` 目前把类型 `ToolExecutor` 当值再导出，
// tsx 逐文件转译无法省略该说明符 → 源码入口 import 包根会抛 "does not provide an export named
// 'ToolExecutor'"；包根属 core-03 范围，已登记在 known-differences.md）。
//
// 区域桶实测的 6 个运行时导出：`toMcpToolName`、`MCP_IMAGE_INLINE_BASE64_BYTES`、
// `MCP_IMAGE_INLINE_RAW_BYTES`、`HOST_NODE_REPL_IMAGE_MAX_DIMENSION`、`registerMcpTools`、
// `McpToolOutputJsonSchema`。
// 其余同区导出（`normalizeMcpToolResultForModel`、`toModelVisibleMcpNamePart`、
// `matchesModelVisibleMcpServerName`、`formatMcpToolResult`、`asDataUrl`、
// `base64PayloadFromMcpImageData`、`hasOfficialCuaFrameAuthority`、
// `isTrustedWindowsComputerUseTool`、`restrictBorrowedWindowsComputerUse`、
// `preserveWindowsComputerUseFrames`）只被包内调用方使用 → 按 acceptance.md 的「间接覆盖」登记，
// 其阈值/文案在替换阶段用**内部单测**逐字冻结（同 contracts-03 的做法）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const mcp = await loadFile("mcp/index");

test("M1 模型可见 MCP 工具名（公开面）", () => {
  assert.equal(mcp.toMcpToolName({ name: "given", serverName: "srv", toolName: "t" }), "given");
  assert.equal(
    mcp.toMcpToolName({ serverName: "my server", toolName: "do/it" }),
    "mcp__my_server__do_it",
  );
  assert.equal(mcp.toMcpToolName({ serverName: "", toolName: "" }), "mcp__unknown__unknown");
});

test("M3 图像内联阈值常量（逐字冻结）", () => {
  assert.equal(mcp.MCP_IMAGE_INLINE_BASE64_BYTES, 200 * 1024);
  assert.equal(mcp.MCP_IMAGE_INLINE_RAW_BYTES, Math.floor((200 * 1024 * 3) / 4));
  assert.equal(mcp.HOST_NODE_REPL_IMAGE_MAX_DIMENSION, 2048);
});

test("M4 MCP 区导出面与形态（区域桶）", () => {
  assert.deepEqual(
    Object.keys(mcp).sort(),
    [
      "HOST_NODE_REPL_IMAGE_MAX_DIMENSION",
      "MCP_IMAGE_INLINE_BASE64_BYTES",
      "MCP_IMAGE_INLINE_RAW_BYTES",
      "McpToolOutputJsonSchema",
      "registerMcpTools",
      "toMcpToolName",
    ],
    "区域桶的运行时导出集合是兼容面的一部分",
  );
  assert.equal(typeof mcp.toMcpToolName, "function");
  assert.equal(typeof mcp.registerMcpTools, "function");
  assert.equal(typeof mcp.McpToolOutputJsonSchema, "object");
  assert.equal(typeof mcp.MCP_IMAGE_INLINE_BASE64_BYTES, "number");
});
