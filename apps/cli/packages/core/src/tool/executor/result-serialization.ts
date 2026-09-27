// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  traceContextToLogContext,
  type TraceContext,
} from "@knorvia/contracts";
import { OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION } from "@knorvia/cua/frame-contract";
import type { ToolEntry, ToolResultSerialization } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { fitContentWithSuffix } from "./result/byte-budget.js";
import { hasImage, mediaBytes, modelText } from "./result/model-content.js";
import { inspectOutput, outputDecision, resultEnvelope } from "./result/serialization-policy.js";
import { savedPreview, saveResult } from "./result/artifact-result.js";
import {
  OfficialCuaFrameContractError,
  projectOfficialCuaStructuredContent,
} from "./result/protected-frame.js";
export { appendHookAdditionalContexts } from "./result/hook-result.js";
const RECOVERY =
  "This CUA raster is invalid and cannot be used in this request. Do not send a coordinate target; capture a new raster first.";

export async function serializeOutput(
  deps: ToolExecutorDeps,
  output: unknown,
  entry: ToolEntry,
  traceContext: TraceContext,
  toolCallId: string,
  signal: AbortSignal,
): Promise<ToolResultSerialization> {
  const inspected = inspectOutput(output, entry);
  if (inspected.kind === "empty")
    return resultEnvelope(
      inspected.facts,
      `(${entry.metadata.name} completed with no output)`,
      false,
    );
  const facts = inspected.facts;
  // 未请求保存时不引入 await；否则本已同步完成的投影会被下一微任务的变更影响。
  const artifact = facts.save
    ? await saveResult(deps, facts, entry, traceContext, toolCallId, signal)
    : undefined;
  const path = artifact?.path ?? artifact?.uri ?? facts.path;
  const reference = { artifactPath: path };

  if (
    entry.modelContentProtection === OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION &&
    hasImage(facts.model)
  ) {
    let frame;
    try {
      frame = projectOfficialCuaStructuredContent(
        facts.model,
        facts.limit,
        facts.budget.preview?.direction ?? "head",
      );
    } catch (error) {
      if (!(error instanceof OfficialCuaFrameContractError)) throw error;
      // 保持 fail-closed，但模型只接收可恢复文案；日志不携带栅格或原始 authority。
      deps.logger?.warn("Official CUA frame contract rejected during result serialization", {
        ...traceContextToLogContext(traceContext),
        code: error.code,
        event: "tool.result.cua_frame_contract_rejected",
        module: "core.tool.executor",
        status: "failed",
        toolCallId,
        toolName: entry.metadata.name,
      });
      throw createCoreError(CoreErrorType.ToolExecutionFailed, RECOVERY, {
        context: { code: error.code, source: "tool" },
        recoverable: true,
      });
    }
    if (frame) {
      // 先固定模型可见文本，再读媒体载荷计量，保持有限属性读取的原阶段。
      const captured = modelText(frame.content);
      return resultEnvelope(
        facts,
        frame.content,
        frame.truncated,
        reference,
        mediaBytes(frame.content),
        captured,
      );
    }
  }
  const decision = outputDecision(facts, artifact !== undefined, path);
  switch (decision) {
    case "original":
      return resultEnvelope(facts, facts.model, false, reference, 0, facts.text);
    case "preview":
      return resultEnvelope(facts, savedPreview(facts, entry, output, path!), true, reference);
    case "truncate": {
      const location = path ? `artifactPath=${path}, ` : "";
      const notice = `\n\n[Tool output truncated by resultBudget: ${location}originalBytes=${facts.bytes}, maxModelBytes=${facts.limit}, strategy=${facts.budget.strategy}]`;
      const content = fitContentWithSuffix(
        facts.text,
        facts.limit,
        notice,
        facts.budget.preview?.direction ?? "head",
      );
      return resultEnvelope(facts, content, true, reference);
    }
  }
}
