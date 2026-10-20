// SPDX-License-Identifier: Apache-2.0
// 官方 GLM 模型规范 ID 名单（B30）。
// 只供官方名单、telemetry 白名单与单向迁移入口使用；不能用于 Registry 比较或通用请求改写。
import { OFFICIAL_GLM_MODEL_ID_TABLE } from "./official-glm-model-id-data.js";

/** 官方 GLM 模型规范 ID 名单；telemetry 白名单以此为来源，新增官方模型时同步进白名单。 */
export const OFFICIAL_GLM_MODEL_IDS: readonly string[] = OFFICIAL_GLM_MODEL_ID_TABLE;

// 大小写不敏感查表：键为小写规范 ID，值为名单里的规范大小写。
const CANONICAL_ID_BY_LOWERCASE = new Map<string, string>(
  OFFICIAL_GLM_MODEL_ID_TABLE.map((canonicalId) => [canonicalId.toLowerCase(), canonicalId]),
);

/** 命中名单返回规范大小写，未命中原样返回。 */
export const normalizeOfficialGlmModelId = (modelId: string): string =>
  CANONICAL_ID_BY_LOWERCASE.get(modelId.toLowerCase()) ?? modelId;
