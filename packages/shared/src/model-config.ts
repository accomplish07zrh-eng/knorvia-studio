// SPDX-License-Identifier: Apache-2.0
// 模型配置的数据合同：complete 系列是磁盘上的完整快照，宽松系列是它的「补丁」——
// 同一形状逐字段放宽为可缺省或显式 null，用于局部覆盖。
// 这里只放 schema 与推导类型；Provider 行为、IO 与校验时机都不属于公共合同。
import { z } from "zod";
import { compileModelOptionMap } from "@knorvia/model-option-map";

type Infer<T extends z.ZodType> = z.infer<T>;
type OptionMapVariable = "reasoningLevel" | "maxOutputTokens";

const FALLBACK_ISSUE = "Option map 无法编译";
const MIN_ONE = "reasoningLevel.values 不能为空";
const NON_BLANK = "reasoningLevel.values 必须是非空字符串";
const DUPLICATE = "reasoningLevel.values 不能重复";

const strictObject = <S extends z.ZodRawShape>(shape: S) => z.object(shape).strict();
const bool = () => z.boolean();
const positiveInt = () => z.number().int().positive();

/** 补丁字段：既能缺省，也能显式写 null 表示「清空」。 */
const loose = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

/** 由完整形状派生补丁形状：先整体放宽，再让调用方替换需要特殊处理的嵌套字段。 */
type Relaxed<S extends z.ZodRawShape> = {
  [K in keyof S]: z.ZodOptional<z.ZodNullable<S[K]>>;
};

const forkComplete = <S extends z.ZodRawShape, O extends z.ZodRawShape = {}>(
  complete: z.ZodObject<S>,
  overrides?: O,
) => {
  const relaxed = Object.fromEntries(
    Object.entries(complete.shape).map(([field, schema]) => [field, loose(schema as z.ZodTypeAny)]),
  ) as unknown as Relaxed<S>;
  return strictObject({ ...relaxed, ...(overrides ?? ({} as O)) } as Omit<Relaxed<S>, keyof O> & O);
};

/** 编译失败的原因；null 表示通过。用返回值而不是异常表达正常校验结果。 */
function optionMapIssue(candidate: string, variableName: OptionMapVariable): string | null {
  try {
    compileModelOptionMap(candidate, variableName);
  } catch (caught) {
    if (caught instanceof Error) return caught.message;
    return FALLBACK_ISSUE;
  }
  return null;
}

/** 选项映射串必须能被编译：语法或语义错误都转成 zod issue。 */
function optionMap(variableName: OptionMapVariable) {
  const check = (source: string, context: z.RefinementCtx) => {
    const issue = optionMapIssue(source, variableName);
    if (issue !== null) context.addIssue({ code: "custom", message: issue });
  };
  return z.string().min(1).superRefine(check);
}

const isNonBlank = (value: string) => value.trim().length > 0;
const isUnique = (values: readonly string[]) => new Set(values).size === values.length;

/** 档位表按语义强度从低到高；首项是辅助调用可选的最低公开档位。 */
const reasoningValues = () =>
  z
    .array(z.string().refine(isNonBlank, NON_BLANK))
    .min(1, MIN_ONE)
    .refine(isUnique, DUPLICATE)
    .readonly();

export const completeEnumOptionSpecDataSchema = strictObject({
  values: reasoningValues(),
  map: optionMap("reasoningLevel"),
});

export const completeLimitOptionSpecDataSchema = strictObject({
  max: positiveInt(),
  map: optionMap("maxOutputTokens"),
});

export const enumOptionSpecDataSchema = forkComplete(completeEnumOptionSpecDataSchema);

export const limitOptionSpecDataSchema = forkComplete(completeLimitOptionSpecDataSchema);

/** 输入模态开关；顺序即界面展示顺序。 */
const INPUT_MODALITIES = [
  "supportsText",
  "supportsImage",
  "supportsVideo",
  "supportsAudio",
  "supportsPdf",
] as const;

type ModalityShape = Record<(typeof INPUT_MODALITIES)[number], z.ZodBoolean>;

const modalityShape = () =>
  Object.fromEntries(INPUT_MODALITIES.map((modality) => [modality, bool()])) as ModalityShape;

export const completeModelInputFormatDataSchema = strictObject(modalityShape());

export const completeModelOutputFormatDataSchema = strictObject({ supportsText: bool() });

export const modelInputFormatDataSchema = forkComplete(completeModelInputFormatDataSchema);

export const modelOutputFormatDataSchema = forkComplete(completeModelOutputFormatDataSchema);

const propertyShape = <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(inputFormat: I, outputFormat: O) => ({
  requiresMfjsToolSchema: bool(),
  contextWindow: positiveInt(),
  inputFormat,
  outputFormat,
  supportsToolCall: bool(),
  supportsJsonSchemaOutput: bool(),
  supportsNativeWebSearch: bool(),
  supportsMidConversationSystem: bool(),
});

export const completeModelPropertiesDataSchema = strictObject(
  propertyShape(completeModelInputFormatDataSchema, completeModelOutputFormatDataSchema),
);

export const modelPropertiesDataSchema = forkComplete(completeModelPropertiesDataSchema, {
  inputFormat: loose(modelInputFormatDataSchema),
  outputFormat: loose(modelOutputFormatDataSchema),
});

const optionSpecsShape = <R extends z.ZodTypeAny, M extends z.ZodTypeAny>(
  reasoningLevel: R,
  maxOutputTokens: M,
) => ({
  reasoningLevel,
  maxOutputTokens,
});

export const completeModelOptionSpecsDataSchema = strictObject(
  optionSpecsShape(completeEnumOptionSpecDataSchema, completeLimitOptionSpecDataSchema),
);

export const modelOptionSpecsDataSchema = forkComplete(completeModelOptionSpecsDataSchema, {
  reasoningLevel: loose(enumOptionSpecDataSchema),
  maxOutputTokens: loose(limitOptionSpecDataSchema),
});

const modelConfigShape = <P extends z.ZodTypeAny, S extends z.ZodTypeAny>(properties: P, optionSpecs: S) => ({
  enabled: bool(),
  properties,
  optionSpecs,
});

export const completeModelConfigDataSchema = strictObject(
  modelConfigShape(completeModelPropertiesDataSchema, completeModelOptionSpecsDataSchema),
);

export const modelConfigDataSchema = forkComplete(completeModelConfigDataSchema, {
  properties: loose(modelPropertiesDataSchema),
  optionSpecs: loose(modelOptionSpecsDataSchema),
});

export type ModelInputFormatData = Infer<typeof completeModelInputFormatDataSchema>;
export type ModelOutputFormatData = Infer<typeof completeModelOutputFormatDataSchema>;
export type ModelPropertiesData = Infer<typeof completeModelPropertiesDataSchema>;
export type EnumOptionSpecData = Infer<typeof completeEnumOptionSpecDataSchema>;
export type LimitOptionSpecData = Infer<typeof completeLimitOptionSpecDataSchema>;
export type ModelOptionSpecsData = Infer<typeof completeModelOptionSpecsDataSchema>;
