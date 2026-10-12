// SPDX-License-Identifier: Apache-2.0
// 工具副作用范围的两个判定（实现逻辑，不属兼容面；签名见 interface.md）。
//
// 两个判定分工不同，因此分成两条互不复用的规则：
//   - isWorkspaceMutatingToolCall 判「写」：一次调用是否可能改动工作区；
//   - isWorldTouchingToolCall 判「碰」：一次调用是否看了或动了外部世界（读也算）。
// 判定放在 contracts 是因为产生标记的执行器（core）与消费它的 driver（bootstrap）要用同一条规则。
import type { ToolSideEffectScope } from "./contract-declarations.js";

// 会改写工作区的范围：文件系统、git，以及无法证明只读的 shell / 宿主执行。
// network、session、userInteraction、none 不碰工作区。
export const WORKSPACE_MUTATING_SIDE_EFFECT_SCOPES: ReadonlySet<ToolSideEffectScope> =
  new Set<ToolSideEffectScope>(["workspace", "git", "system"]);

// 只服务协议本身、既不读也不改外部世界的范围：session 是把结果/问题交回调用方
// （dynamic-workflow 的 submit_result、escalate 属于这一档），userInteraction 是问用户。
const PROTOCOL_ONLY_SIDE_EFFECT_SCOPES: ReadonlySet<ToolSideEffectScope> =
  new Set<ToolSideEffectScope>(["session", "userInteraction"]);

interface CapabilityView {
  readOnly?: boolean | undefined;
  sideEffectScope?: ToolSideEffectScope | undefined;
}

// 一次工具调用（按解析后的能力）是否会改写工作区。
// 明确声明只读的直接排除；范围缺席按「会改写」处理（保守：未声明即不可信）。
export function isWorkspaceMutatingToolCall(capability: CapabilityView): boolean {
  if (capability.readOnly === true) return false;
  const scope = capability.sideEffectScope;
  if (scope === undefined) return true;
  return WORKSPACE_MUTATING_SIDE_EFFECT_SCOPES.has(scope);
}

// 一次工具调用是否看了或动了外部世界。用排除法：只把协议档排除，其余一律算碰，范围缺席也算碰。
// 读同样算碰——Read 的范围是 none（不产生副作用），但它的答案取决于工作区，因此会影响
// 「一条缓存条目是否纯」的判断（纯 = 只按指令与转录前缀作答，关门后仍可命中）。
export function isWorldTouchingToolCall(capability: {
  sideEffectScope?: ToolSideEffectScope | undefined;
}): boolean {
  const scope = capability.sideEffectScope;
  if (scope === undefined) return true;
  return !PROTOCOL_ONLY_SIDE_EFFECT_SCOPES.has(scope);
}
