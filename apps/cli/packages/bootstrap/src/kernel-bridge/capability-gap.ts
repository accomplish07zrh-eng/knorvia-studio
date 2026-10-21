// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03：**能力缺口命令**的统一处置（B20–B23）。
//
// 这 10 条命令的后端不在 dsh 引擎里（工作流 3 + 钩子 5 + 文件回退 1 + 共享上下文 1），
// 它们的功能实现在各自的插件包里。本包只负责：
//   ① 命令面**可达**（不是 `unsupported`）；
//   ② 回**专门**的能力缺失码 `fault.command.capabilityAbsent`；
//   ③ **不伪造成功**（绝不 accepted / noop）；
//   ④ 载荷校验仍然生效（非法载荷回参数错误，与能力缺失区分）。
//
// 为什么不能让它们继续回 `unsupported`：那是「实现进度」语义（段 A 尚未接入），
// 而这些命令**永远会**在当前引擎下缺失——两者对客户端的意义完全不同：
// 前者是 bug 信号，后者是「暂不支持，后续版本提供」（见 interface.md §3.2）。

/** 能力缺失的冻结 reasonCode（interface.md §3.1）。 */
export const CAPABILITY_ABSENT_REASON = "fault.command.capabilityAbsent";

/**
 * 后端不在 dsh 引擎的 10 条命令 → 归属包。
 *
 * 按**包**分组而不是按命令逐条列：这样「谁该补哪几条」一眼可见，
 * 而且新增一条缺口命令时必须先想清楚「它属于哪个包」。
 *
 * **这是夹具 `command-ownership.json` 的代码侧镜像**：夹具是测试的事实源，
 * 这里是运行期用的映射；`implementation-behavior.test.mjs` 会断言两者都覆盖 10 条。
 */
const GAP_OWNERSHIP: Readonly<Record<string, readonly string[]>> = {
  "kernel-plugin-workflow": [
    "resumeWorkflowRun",
    "startSavedWorkflow",
    "amendWorkflowRunSettings",
    "discardSharedContext",
  ],
  "kernel-plugin-hooks": [
    "respondWorkspaceHookReview",
    "toggleWorkspaceHookReviewItem",
    "revokeWorkspaceHookTrust",
    "requestWorkspaceHookReview",
    "snoozeInteractionAutoResolution",
  ],
  "kernel-plugin-rewind": ["applyFileRewind"],
};

/**
 * 命令 → 归属包的反查表（由上面按包分组的表展开而来，避免两处各写一份）。
 */
export const CAPABILITY_GAP_COMMANDS: ReadonlyMap<string, string> = new Map(
  Object.entries(GAP_OWNERSHIP).flatMap(([owner, commands]) =>
    commands.map((command) => [command, owner] as const),
  ),
);

/** 缺口命令的执行层终态（只允许这一种形状）。 */
export interface CapabilityAbsentOutcome {
  readonly status: "failed";
  readonly reasonCode: typeof CAPABILITY_ABSENT_REASON;
  /** 面向调用方的说明：点明归属包，而不是「未知错误」。 */
  readonly message: string;
}

/**
 * 判断一条命令是否属于能力缺口集合。
 *
 * @param type - v4 命令字面量。
 * @returns 是否缺口命令。
 */
export function isCapabilityGapCommand(type: string): boolean {
  return CAPABILITY_GAP_COMMANDS.has(type);
}

/**
 * 产出能力缺失的终态。
 *
 * **不伪造成功**：`status` 固定为 `failed`，reasonCode 是冻结值；
 * 说明里点明归属包，便于调用方与运维定位「该去哪个包找实现」。
 *
 * 形状必须与 `CommandExecutionOutcome` 对齐（`status` / `reasonCode` / `message`）——
 * 否则说明会在投递到 ACK 时被丢掉，调用方只看到一个光秃秃的 reasonCode。
 *
 * @param type - v4 命令字面量。
 * @returns 执行层终态。
 */
export function capabilityAbsentOutcome(type: string): CapabilityAbsentOutcome {
  const owner = CAPABILITY_GAP_COMMANDS.get(type) ?? "an unassigned plugin package";
  const outcome: CapabilityAbsentOutcome = {
    status: "failed",
    reasonCode: CAPABILITY_ABSENT_REASON,
    message: `${type} is not available in the dsh engine yet; its backend belongs to ${owner}`,
  };
  return outcome;
}
