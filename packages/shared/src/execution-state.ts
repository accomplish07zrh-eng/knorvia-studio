// SPDX-License-Identifier: Apache-2.0
// 执行状态在接纳边界一次性定格。plan 不是权限模式，只在旧请求里打开 planEnabled。
import { z } from "zod";

const PERMISSION_MODE_VALUES = ["build", "edit", "yolo", "auto"] as const;

export const executionPermissionModeSchema = z.enum(PERMISSION_MODE_VALUES);

const modeField = executionPermissionModeSchema;
const planFlagField = z.boolean();

// 非 strict：历史载荷上的多余字段不拒绝，解析结果只保留 mode 与 planEnabled。
const executionStateFields = {
  mode: modeField,
  planEnabled: planFlagField,
};

export const executionStateSchema = z.object(executionStateFields);

export type ExecutionState = {
  mode: /* 已接纳的权限模式，不含 plan */ (typeof PERMISSION_MODE_VALUES)[number];
  planEnabled: /* 计划开关与权限模式分开存储 */ boolean;
};

const IDLE_EXECUTION: ExecutionState = { mode: "build", planEnabled: false };

type ExecutionStateInput = {
  mode?: /* 请求模式；plan 只用于打开计划，不是权限模式 */ string | null;
  planEnabled?: /* null 与缺省一样继承，显式布尔覆盖 */ boolean | null;
};

type ModeDecision =
  | { readonly accepted: true; readonly mode: ExecutionState["mode"] }
  | { readonly accepted: false };

function decideMode(rawMode: string | null | undefined): ModeDecision {
  const parsed = executionPermissionModeSchema.safeParse(rawMode);
  if (!parsed.success) return { accepted: false };
  return { accepted: true, mode: parsed.data };
}

function explicitPlanFlag(input: ExecutionStateInput): boolean | undefined {
  const flag = input.planEnabled;
  if (flag === undefined || flag === null) return undefined;
  return flag;
}

function decidePlanEnabled(
  input: ExecutionStateInput,
  modeAccepted: boolean,
  inherited: boolean,
): boolean {
  const explicit = explicitPlanFlag(input);
  if (explicit !== undefined) return explicit;
  if (input.mode === "plan") return true;
  // 新请求带了合法权限模式时，计划开关默认关掉，不再继承上一轮。
  if (modeAccepted) return false;
  return inherited;
}

// plan 模式不会写入 mode。
export function resolveExecutionState(
  input: ExecutionStateInput,
  current: ExecutionState = IDLE_EXECUTION,
): ExecutionState {
  const decision = decideMode(input.mode);
  const mode = decision.accepted ? decision.mode : current.mode;
  const planEnabled = decidePlanEnabled(input, decision.accepted, current.planEnabled);
  return { mode, planEnabled };
}
