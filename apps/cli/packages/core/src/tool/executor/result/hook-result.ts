// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
  containsOfficialCuaImageRefCredentialText,
} from "@knorvia/cua/frame-contract";
import type { ToolEntry, ToolResultSerialization } from "../../types.js";
import { isPersistedOutputContent } from "../../result-persistence-format.js";
import { formatHookAdditionalContexts } from "../hook-flow.js";
import { appendHookToStringContent, appendHookToPersistedArtifactPreview } from "./byte-budget.js";
import {
  appendHookWithoutReorderingStructuredContent,
  projectHookAugmentedModelContent,
} from "./structured-content.js";
import { byteSize, DEFAULT_BUDGET, hasImage, textLimit } from "./model-content.js";

export function appendHookAdditionalContexts(
  serialization: ToolResultSerialization,
  additionalContexts: string[],
  entry: ToolEntry,
): ToolResultSerialization {
  if (additionalContexts.length === 0) return serialization;
  const protectedContent =
    entry.modelContentProtection === OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION;
  const accepted = protectedContent
    ? additionalContexts.filter((text) => !containsOfficialCuaImageRefCredentialText(text))
    : additionalContexts;
  const omitted = accepted.length !== additionalContexts.length;
  const mark = (value: ToolResultSerialization): ToolResultSerialization =>
    omitted ? { ...value, truncated: true } : value;
  if (accepted.length === 0) return mark(serialization);
  const hookContext = formatHookAdditionalContexts(accepted);
  const suffix = `\n\n${hookContext}`;
  const limit = textLimit(entry.resultBudget ?? DEFAULT_BUDGET);
  if (
    entry.modelContentProtection === OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION &&
    hasImage(serialization.modelContent ?? serialization.content)
  )
    return mark(
      appendHookWithoutReorderingStructuredContent(serialization, hookContext, suffix, limit),
    );
  const direction = entry.resultBudget?.preview?.direction ?? "head";
  const artifactPreview =
    serialization.budgetStrategy === "artifact" &&
    serialization.truncated &&
    typeof serialization.artifactPath === "string" &&
    serialization.artifactPath.length > 0 &&
    isPersistedOutputContent(serialization.content);
  const projected = artifactPreview
    ? appendHookToPersistedArtifactPreview(serialization.content, suffix, limit)
    : appendHookToStringContent(serialization.content, suffix, limit, direction);
  // 先展开原 envelope，再计算模型内容；复制 getter 的可见更新不能被提前投影漏掉。
  const copied = { ...serialization };
  const modelContent = projectHookAugmentedModelContent({
    artifactPreview,
    contentProjection: projected,
    hookContext,
    maxModelBytes: limit,
    modelContent: serialization.modelContent ?? serialization.content,
    previewDirection: direction,
    suffix,
  });
  return mark({
    ...copied,
    content: projected.content,
    modelContent,
    returnedBytes: byteSize(projected.content),
    truncated: serialization.truncated || projected.truncated,
  });
}
