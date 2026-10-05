# 工具结果图片的排列顺序

2026-10-05，用户定位并离线复现：`apps/cli/packages/adapters/src/model/transform.ts` 的 `toAiSdkMessages()` 在每条工具结果后立刻以 user 消息补发其图片。并行读取两张图片时序列为 tool① → user(图片①) → tool②，AI SDK `convertToLanguageModelPrompt` 遇到 user 消息时发现 tool② 尚未回填，抛出 `MissingToolResultsError`，对话中断。

## 规则

- 工具结果中的可投递媒体仍以 user 消息补发（保持能力检查、CUA 凭证邻接与 `stripMedia` 规则不变）。
- 同一段连续 tool 结果的媒体先暂存，段结束（遇到非 tool 消息或消息结束）后按原顺序合并为一条 user 消息：tool① → tool② → user(图片①, 图片②)。
- 单条工具结果的输出不变：tool → user(图片)。

本规格补充 `knorvia-model-adapter-runtime.md` 中「工具结果投影」一条；该文件为已审定版本，不直接改写。

## 验收

`apps/cli/packages/adapters/test/tool-result-media-order.test.ts`：以与 AI SDK 相同的规则校验 user 消息出现时没有未回填的工具调用，并校验图片顺序；修复前失败（user message arrived before all tool results），修复后通过。
