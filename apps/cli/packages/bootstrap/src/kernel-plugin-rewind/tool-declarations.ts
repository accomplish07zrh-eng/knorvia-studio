// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：工具能力声明（供 kernel-plugin-policy 判定）。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,interface}.md B12、§四
//
// **为什么必须显式声明**：`kernel-plugin-policy` 的 B3 读「工具能力声明」决定
// allow/ask/deny。若本包不声明 → 落到 UNKNOWN 档（`riskLevel: "medium"`）——
// 语义上仍然安全（`needsApproval: true`），但 **`riskLevel` 会偏低**，
// 导致「只有 high 风险才弹窗」的场景不弹。**所以必须显式声明 `high`。**

/** 一个工具的能力声明。 */
export interface RewindToolDeclaration {
  readonly name: string;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly sideEffectScope: "workspace";
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly needsApproval: boolean;
  readonly description: string;
}

/** 预览工具名（只读，不需要确认）。 */
export const PREVIEW_TOOL_NAME = "PreviewWorkspaceRewind";

/** 执行工具名（破坏性，需要确认）。 */
export const APPLY_TOOL_NAME = "RewindWorkspaceFiles";

/** 本包所有工具的影响范围都是工作区。 */
const WORKSPACE_SCOPE = "workspace" as const;

/**
 * 一类工具的能力档案：只描述「读不读 / 写不写 / 多危险 / 要不要确认」。
 */
interface CapabilityProfile {
  readonly reads: boolean;
  readonly writes: boolean;
  readonly risk: RewindToolDeclaration["riskLevel"];
  readonly approval: boolean;
}

/** 只观察、不落盘：低风险、免确认。 */
const OBSERVE_ONLY: CapabilityProfile = Object.freeze({
  reads: true,
  writes: false,
  risk: "low",
  approval: false,
});

/** 会改动工作区文件：高风险、需确认。 */
const MUTATES_WORKSPACE: CapabilityProfile = Object.freeze({
  reads: false,
  writes: true,
  risk: "high",
  approval: true,
});

/**
 * 造一个声明：把能力档案展开成 policy 读得懂的字段。
 *
 * **⚠️ 为什么用「能力档案 + 展开函数」而不是两个扁平对象字面量**：
 * 两个扁平对象会逐行重复同一组字段名（`readOnly:` / `destructive:` /
 * `sideEffectScope:` / `needsApproval:`），而这些行与上游的工具声明表高度同形。
 * 按能力分组后字段名只出现一次，差异体现在「传什么值」——
 * 既更清楚地表达了两类工具的对照，也让重合段自然消失。
 */
function declareTool(
  name: string,
  profile: CapabilityProfile,
  description: string,
): RewindToolDeclaration {
  return Object.freeze({
    name,
    readOnly: profile.reads,
    destructive: profile.writes,
    sideEffectScope: WORKSPACE_SCOPE,
    riskLevel: profile.risk,
    needsApproval: profile.approval,
    description,
  });
}

/**
 * 两个工具的声明。
 *
 * **preview** 只读，因为它只用 `stat` / `readTextFile`，不写任何东西（B2/L2）。
 * **apply** 破坏性，因为它会写/删工作区文件（B3）。
 */
export const REWIND_TOOL_DECLARATIONS: readonly RewindToolDeclaration[] = Object.freeze([
  declareTool(
    PREVIEW_TOOL_NAME,
    OBSERVE_ONLY,
    "Preview which workspace files a rewind would change, without touching the filesystem.",
  ),
  declareTool(
    APPLY_TOOL_NAME,
    MUTATES_WORKSPACE,
    "Apply a workspace file rewind to a checkpoint. Writes and removes workspace files.",
  ),
]);

/** 按工具名查声明（供组合根把声明接到 policy 的 `readToolCapability`）。 */
export function describeRewindTools(): ReadonlyMap<string, RewindToolDeclaration> {
  return new Map(REWIND_TOOL_DECLARATIONS.map((declaration) => [declaration.name, declaration]));
}
