import type { Model, ModelOptions } from "@knorvia/contracts";

const /* 辅助调用输出上限 */ AUXILIARY_MAX_OUTPUT_TOKENS = 5_000;

// 辅助调用统一取公开档位的最低项，并压住输出预算。
// 档位顺序以 Model Config 为准，不能按 disabled/off 这类名字反推协议行为。
export function /* 辅助调用的模型选项 */ auxiliaryModelOptions(
  model: Model,
): Required<ModelOptions> {
  return /* 构造选项 */ {
    reasoningLevel: /* 公开档位最低项 */ model.optionSpecs.reasoningLevel.values[0]!,
    maxOutputTokens: /* 与上限取小 */ Math.min(
      AUXILIARY_MAX_OUTPUT_TOKENS,
      model.optionSpecs.maxOutputTokens.max,
    ),
  };
}
