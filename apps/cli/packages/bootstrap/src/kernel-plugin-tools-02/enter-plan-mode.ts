// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// `EnterPlanMode` 的执行体：把 DSH 的 `PlanModeController.set()` 四态映射成工具返回。
//
// 依据：`specs/contracts/kernel-plugin-tools-02/behavior.md` B5 / B6 / B8。
//
// ⚠️ 这是本包**最关键的适配点** —— 四态的语义各不相同，尤其：
//   · `queued` = 已排队但**尚未生效** → `changed: false`，模型靠 `phase` 区分
//   · `cancelled` = 进入被取消 → **抛错**，不得静默当成功
//     （否则模型会以为已进入计划模式而继续按计划模式行事 → 状态不一致）

/** `PlanModeController.set()` 的四态（DSH 的实际返回）。 */
export type PlanModeSetOutcome = "committed" | "queued" | "cancelled" | "noop";

/** 本工具的成功返回（B5）。 */
export interface EnterPlanModeResult {
  readonly active: true;
  readonly changed: boolean;
  readonly phase: PlanModeSetOutcome;
  /**
   * 进入前是否处于计划模式（B5 末条的降级）。
   *
   * 旧实现返回「运行前的会话模式」（五态字符串），而 DSH 只暴露「当前是否 plan」——
   * 所以这里只能给布尔。记入 known-differences D1。
   */
  readonly sessionModeBeforePlan: boolean;
}

/** 进入被取消时抛的错误（B5：不得静默当成功）。 */
export class PlanModeEnterCancelledError extends Error {
  readonly code = "PLAN_MODE_ENTER_CANCELLED";
  constructor() {
    super(
      "Entering plan mode was cancelled by a pending opposite selection; the mode did not change",
    );
    this.name = "PlanModeEnterCancelledError";
  }
}

/** `PlanModeController` 中本包用到的部分。 */
export interface PlanModeControllerLike {
  get(agent: unknown): { active: boolean; pending?: boolean };
  set(agent: unknown, active: boolean): PlanModeSetOutcome;
}

/** 执行上下文（B8：控制器缺失要明确失败）。 */
export interface EnterPlanModeContext {
  readonly getPlanModeController: () => PlanModeControllerLike | undefined;
  /** 当前 agent（由组合根从 DSH 执行上下文取）。 */
  readonly agent: unknown;
}

/** 控制器不可用时的固定文案（B8）。 */
const CONTROLLER_UNAVAILABLE = "Plan mode is not available in this session";

/**
 * 进入计划模式（B5）。
 *
 * 映射表：
 * | `set()` 返回 | 返回 | 语义 |
 * | --- | --- | --- |
 * | `committed` | `{ active: true, changed: true, phase: "committed" }` | 已进入 |
 * | `queued` | `{ active: true, changed: false, phase: "queued" }` | 已排队，尚未生效 |
 * | `cancelled` | **抛 `PlanModeEnterCancelledError`** | 进入被取消 |
 * | `noop` | `{ active: true, changed: false, phase: "noop" }` | 已在计划模式 |
 */
export function executeEnterPlanMode(context: EnterPlanModeContext): EnterPlanModeResult {
  const controller = context.getPlanModeController();
  if (controller === undefined) throw new Error(CONTROLLER_UNAVAILABLE);

  // 先读「进入前是否已在计划模式」—— `set()` 之后读不到「之前」的值。
  const sessionModeBeforePlan = controller.get(context.agent).active;

  const phase = controller.set(context.agent, true);

  // B5：`cancelled` 必须抛错，不能静默成功。
  if (phase === "cancelled") throw new PlanModeEnterCancelledError();

  // `committed` 是唯一「状态真的变了」的情形。
  return {
    active: true,
    changed: phase === "committed",
    phase,
    sessionModeBeforePlan,
  };
}
