import { z } from "zod";
import { completeModelConfigDataSchema, modelConfigDataSchema } from "@knorvia/shared/model-config";

const complete = completeModelConfigDataSchema.shape;
// 手动模式只冻结产品明确开放的叶子；新增系统字段默认不属于个人手动配置。
export const manualModelConfigSchema = completeModelConfigDataSchema
  .pick({ enabled: true })
  .extend({
    enabled: modelConfigDataSchema.shape.enabled,
    properties: complete.properties
      .pick({
        contextWindow: true,
        supportsJsonSchemaOutput: true,
        supportsNativeWebSearch: true,
        supportsMidConversationSystem: true,
      })
      .extend({
        inputFormat: complete.properties.shape.inputFormat.pick({
          supportsImage: true,
          supportsVideo: true,
          supportsPdf: true,
        }),
      }),
    optionSpecs: complete.optionSpecs.pick({ reasoningLevel: true }).extend({
      maxOutputTokens: complete.optionSpecs.shape.maxOutputTokens.pick({ max: true }),
    }),
  });

export type ManualModelConfig = z.infer<typeof manualModelConfigSchema>;

/** 草稿/旧完整规则提取复用 schema 结构，避免维护第二份可编辑字段清单。 */
export function extractManualModelConfig(input: unknown): ManualModelConfig {
  return manualModelConfigSchema.parse(pickManualFields(manualModelConfigSchema, input));
}

export function clearManualModelConfig(input: z.infer<typeof modelConfigDataSchema>) {
  return modelConfigDataSchema.parse(
    removeManualFields(manualModelConfigSchema.omit({ enabled: true }), input),
  );
}

function pickManualFields(schema: z.ZodObject, input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const source = input as Record<string, unknown>;
  const schemaEntries = Object.entries(schema.shape);
  const selected: [string, unknown][] = [];

  for (const [key, child] of schemaEntries) {
    if (key in source) {
      selected.push([
        key,
        child instanceof z.ZodObject ? pickManualFields(child, source[key]) : source[key],
      ]);
    }
  }

  return Object.fromEntries(selected);
}

function removeManualFields(schema: z.ZodObject, input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const sourceEntries = Object.entries(input);
  const remainingEntries: [string, unknown][] = [];

  for (const [key, value] of sourceEntries) {
    const child = schema.shape[key];
    if (!child) {
      remainingEntries.push([key, value]);
      continue;
    }

    if (!(child instanceof z.ZodObject) || value == null) {
      continue;
    }

    const remaining = removeManualFields(child, value);
    if (remaining && typeof remaining === "object" && Object.keys(remaining).length > 0) {
      remainingEntries.push([key, remaining]);
    }
  }

  return Object.fromEntries(remainingEntries);
}
