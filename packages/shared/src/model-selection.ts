// SPDX-License-Identifier: Apache-2.0
// 模型选择 schema 与 Picker 展示值编解码（B28）。
import { z } from "zod";

const PICKER_SEPARATORS = { provider: "/", reasoning: "$" } as const;

const trimmedIdField = z.string().trim().min(1);
const reasoningLevelField = z.string().trim().min(1).optional();
const pickerOptionsSchema = z
  .object({ reasoningLevel: reasoningLevelField })
  .strict() // 未知键拒绝
  .optional();

// 用户对后续模型执行的完整选择；它不表达已经创建的 Active Model。
const selectionShape = z
  .object({ providerId: trimmedIdField, modelId: trimmedIdField, options: pickerOptionsSchema })
  .strict(); // 未知键拒绝

export const modelSelectionSchema = selectionShape;

export type ModelSelection = z.output<typeof modelSelectionSchema>;

const SELECTION_ISSUE_TABLE = {
  "selection-missing": true,
  "account-connection-unavailable": true,
  "provider-not-found": true,
  "model-not-found": true,
  "reasoning-level-missing": true,
  "reasoning-level-not-supported": true,
} as const;
type SelectionIssueText = keyof typeof SELECTION_ISSUE_TABLE;

// 公共解析结果：页面可以展示不完整的选择，但执行入口必须同时看 selectionIssue。
export type EffectiveModelSelectionResult = {
  readonly effectiveSelection: /* 最终生效选择；未定为 null */ ModelSelection | null;
  readonly selectionIssue?: /* 领域校验问题码 */ SelectionIssueText;
};

export const KNORVIA_MODEL_REASONING_SEPARATOR = PICKER_SEPARATORS.reasoning;

/** UI Picker/legacy CLI 的展示值；它不是可逆的 ModelSelection 序列化格式。 */
export function formatModelPickerValue(pickerSelection: ModelSelection | undefined): string {
  // 展示边界把未绑定表示为空串；真正执行前仍要校验完整 ModelSelection。
  if (!pickerSelection) return "";
  const base = `${pickerSelection.providerId}${PICKER_SEPARATORS.provider}${pickerSelection.modelId}`;
  const reasoningText = pickerSelection.options?.reasoningLevel;
  return reasoningText ? `${base}${KNORVIA_MODEL_REASONING_SEPARATOR}${reasoningText}` : base;
}

/** 只解析 Picker/legacy 字符串边界；领域状态与协议必须直接保存 ModelSelection。 */
export function parseModelPickerValue(pickerText: string): ModelSelection {
  const trimmedText = pickerText.trim();
  const slashIndex = trimmedText.indexOf(PICKER_SEPARATORS.provider);
  if (slashIndex <= 0) {
    throw new Error(`模型选择缺少 Provider: ${trimmedText}`);
  }
  const providerId = trimmedText.slice(0, slashIndex);
  const modelPart = trimmedText.slice(slashIndex + 1);
  const reasoningIndex = modelPart.indexOf(KNORVIA_MODEL_REASONING_SEPARATOR);
  const hasReasoning = reasoningIndex > 0 && reasoningIndex < modelPart.length - 1;
  if (!hasReasoning) {
    return modelSelectionSchema.parse({ providerId, modelId: modelPart });
  }
  return modelSelectionSchema.parse({
    providerId,
    modelId: modelPart.slice(0, reasoningIndex),
    options: { reasoningLevel: modelPart.slice(reasoningIndex + 1) },
  });
}
