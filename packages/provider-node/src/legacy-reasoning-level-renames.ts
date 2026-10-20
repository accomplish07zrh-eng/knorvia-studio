// SPDX-License-Identifier: Apache-2.0
// 已下线推理档位名的对照表：每行把「Built-in 原始 modelMatch 正则」映射到它历史上的档位名。
//
// 这张表是**纯数据**：25 条记录的 modelMatch 与 oldLevel 都由合同固定，不含任何逻辑，
// 因此按声明模式计分（见 `docs/knorvia-packages-02-acceptance.md`）。
//
// 匹配必须精确对齐 Built-in 的原始规则，不按模型名猜测：猜错会把用户的显式选择
// 静默改成另一个档位，比不迁移更糟。
//
// 只有同包的 legacy-reasoning-level.ts 读它；`index.ts` 不 re-export。
export const legacyReasoningLevelRenames = [
  { modelMatch: ".*glm-5(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*GLM-5\\.2(?:[.\\-:/\\[].*)?", oldLevel: "nothink" },
  { modelMatch: ".*GLM-5-Turbo(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-5\\.1(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-5\\.1-highspeed(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-5v-turbo(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-4\\.7(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-4\\.7-flashx(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-4\\.7-flash(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-4\\.6(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-4\\.5(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*glm-4\\.5-air(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*kimi-k2\\.7-code(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*kimi-k2\\.6(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*kimi-k2\\.5(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*deepseek-v4-flash(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*deepseek-v4-pro(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*qwen3\\.5-plus(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*qwen3\\.5-flash(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*qwen-plus(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*qwen-flash(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*qwen3-vl-plus(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*mimo-v2\\.5(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*mimo-v2\\.5-pro(?:[.\\-:/\\[].*)?", oldLevel: "off" },
  { modelMatch: ".*mimo-v2-flash(?:[.\\-:/\\[].*)?", oldLevel: "off" },
] as const;
