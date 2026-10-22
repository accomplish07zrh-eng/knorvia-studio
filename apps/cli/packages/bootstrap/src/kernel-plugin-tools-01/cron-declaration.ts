// SPDX-License-Identifier: Apache-2.0
// cron 族四个工具共用的元数据工厂。
//
// 为什么要有这一层：四个工具的「静态声明」几乎同构 —— 都写工作区、都是中风险、
// 三个是写操作一个只读。若像旧实现那样在四个对象字面量里各写一遍七个字段，
// 读者要逐行比对才能确认「它们真的只有 readOnly/needsApproval 两处不同」。
// 收成一次调用后，差异只剩参数列表里的两项。
import type { ValueSchemaSpec } from "@deepseek-ai/dsh-tools";

/** 工具对工作区的影响范围（DSH 的 side-effect 声明）。 */
export const WORKSPACE_SCOPE = "workspace" as const;

/** cron 族统一的协作超时预算：写入或列举一次定时任务不应超过 30 秒。 */
export const CRON_TOOL_TIMEOUT_MS = 30_000;

/** cron 族统一的模型可见输出上限：一次最多回传 32 KB 的任务快照。 */
export const CRON_MODEL_BYTES = 32_000;

/** 一个 cron 工具的静态声明。 */
export interface CronToolDeclaration {
  /** 工具名（模型可见的 API 面，不可改）。 */
  readonly name: string;
  /** 是否只读：`CronList` 为 true，其余三个为 false。 */
  readonly readOnly: boolean;
  /** 是否要求审批：写操作要求，只读不要求。 */
  readonly needsApproval: boolean;
  /** 给模型的一句话能力描述。 */
  readonly description: string;
  /** 给模型的操作指引（约束的载体）。 */
  readonly guidance: readonly string[];
}

/**
 * 把声明展开成 DSH 的工具元数据字段。
 *
 * 风险等级与副作用范围对四个工具取值相同，所以不放进参数：
 * 若将来某个工具需要不同取值，再加参数比一开始就摊开七个字段更容易看出差异。
 *
 * @param declaration - 本工具的名字、读写性与文案。
 * @returns 可直接展开进 `defineTool` 选项的元数据字段。
 */
export function cronToolMetadata(declaration: CronToolDeclaration): {
  readonly name: string;
  readonly description: string;
  readonly readOnly: boolean;
  readonly destructive: false;
  readonly concurrentSafe: boolean;
  readonly sideEffectScope: typeof WORKSPACE_SCOPE;
  readonly riskLevel: "medium";
  readonly needsApproval: boolean;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
} {
  return {
    name: declaration.name,
    description: joinGuidance(declaration.description, declaration.guidance),
    readOnly: declaration.readOnly,
    destructive: false,
    // 定时任务的写入不是并发安全的：两个并发 CronUpdate 会互相覆盖同一份任务记录。
    concurrentSafe: false,
    sideEffectScope: WORKSPACE_SCOPE,
    riskLevel: "medium",
    needsApproval: declaration.needsApproval,
    timeoutMs: CRON_TOOL_TIMEOUT_MS,
    maxOutputBytes: CRON_MODEL_BYTES,
  };
}

/**
 * 把「一句话描述」与「若干条操作指引」拼成模型看到的单段文本。
 *
 * DSH 的 `description` 是单字符串，没有独立的 instructions 字段；
 * 旧实现用 `modelInstructions` 数组承载指引，这里在拼接时保留条目边界（换行 + 前缀），
 * 让模型仍能逐条读到约束，而不是糊成一段。
 *
 * @param description - 一句话能力描述。
 * @param guidance - 操作指引条目。
 * @returns 拼接后的描述文本。
 */
function joinGuidance(description: string, guidance: readonly string[]): string {
  if (guidance.length === 0) return description;
  const bullets = guidance.map((item) => `- ${item}`).join("\n");
  return `${description}\n\n${bullets}`;
}

/**
 * 参数 schema 的公共片段：文本字段。
 *
 * 用 DSH 的 `ValueSchemaSpec` 形状（不是 zod）。**注意**：DSH 的
 * `StringValueSchemaSpec` 只有 `type` / `enum` / `const` 与四个注解字段，
 * **没有 `minLength`** —— 长度与空白校验必须在执行体里做（见 `rejectBlankText`）。
 */
export const NON_EMPTY_TEXT: ValueSchemaSpec = { type: "string" };

/**
 * 判断一个字段是否「只含空白」。
 *
 * 旧实现靠 zod 的 `.trim().min(1)` 拒绝空白串；DSH 的 schema 不做变换，
 * 因此在执行体里补这一步，保持「全空白等同于缺席」的旧语义。
 *
 * @param value - 待检查的文本。
 * @returns 是否需要按非法输入拒绝。
 */
export function rejectBlankText(value: string): boolean {
  return value.trim() === "";
}
