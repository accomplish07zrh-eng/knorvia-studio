// SPDX-License-Identifier: Apache-2.0
// 工具分部元数据：schema 版本在前，展示、序列化和读档快照按存在与否接在后面。
import { createMcpToolDisplay } from "../../tool/executor/result-display.js";
import {
  COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION,
  type CompletedToolPartMetadata,
  type ToolExecutionResult,
} from "../deps.js";
import { layer } from "./support/m02-record.js";

const SCHEMA = COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION;

type McpPresentation = { serverName: string; toolName: string; description?: string };

export function mcpToolPartMetadata(
  presentation: McpPresentation | undefined,
): CompletedToolPartMetadata | undefined {
  const card = createMcpToolDisplay(presentation);
  if (!card) return;
  const schemaVersion = SCHEMA;
  return { schemaVersion, display: card };
}

function serializationOf(result: ToolExecutionResult): Record<string, unknown> | undefined {
  const raw = result.serialization;
  if (!raw) return;
  const { truncated, originalBytes, returnedBytes, budgetStrategy, artifactPath } = raw;
  return layer<Record<string, unknown>>(
    { truncated, originalBytes, returnedBytes, budgetStrategy },
    artifactPath ? { artifactPath } : undefined,
  );
}

export function completedToolPartMetadata(result: ToolExecutionResult): CompletedToolPartMetadata {
  const serialization = serializationOf(result);
  const schemaVersion = SCHEMA;
  return layer<CompletedToolPartMetadata>(
    { schemaVersion },
    result.display ? { display: result.display } : undefined,
    serialization ? { serialization } : undefined,
    result.readFileStateMetadata ? { readFileState: result.readFileStateMetadata } : undefined,
  );
}
