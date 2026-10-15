// SPDX-License-Identifier: Apache-2.0
// 权限代理端口：需要用户点头的工具调用在这里挂起，等一条答复才继续。
// 端口由权限代理（Host 侧）实现，排队、超时、应答归属与规则落库都在它那边；工具运行时只提交
// 请求，取回决策、改写后的输入与要回写的规则更新。

// ── 章节：一 规则语汇 · 二 策略与来源标记 · 三 能力分组常量 · 四 请求与结果 · 五 端口与预备句柄

import type { PermissionDecision } from "../events/session.events.js";
import type { ModelToolSideEffectScope } from "../model/index.js";
import type { CollaborationMode, RiskLevel } from "./session.port.js";
import type { InteractionRequestOrigin, SessionId, ToolCallId, TraceId, TurnId } from "./shared.js";

// ── 一、规则语汇：项目的权限规则长什么样 ────────────────────────────

/** 单条规则的处置方式：放行、拒绝，或者每次都重新问。 */
export type PermissionRuleBehavior = "allow" | "deny" | "ask";

/** 规则命中的对象：工具名，加上可选的规则内容（例如命令前缀、路径）。 */
export interface PermissionRuleValue {
  toolName: string;
  ruleContent?: string;
}

/** 一份规则集合，可以来自项目配置，也可以只活在运行时的会话内存里。三个数组按处置方式分桶， `version` 标记结构版本，`mode` 记录当时的协作模式；索引签名把未知字段原样留住，跨版本读写 不至于丢信息。 */
export interface PermissionRuleset {
  version?: 1;
  allow?: PermissionRuleValue[];
  deny?: PermissionRuleValue[];
  ask?: PermissionRuleValue[];
  mode?: CollaborationMode;
  [key: string]: unknown;
}

/** 一次「追加规则」的更新；由决策方回写，最终落进规则集合里对应的桶。 */
export type PermissionUpdate = {
  type: "addRules";
  behavior: PermissionRuleBehavior;
  rules: PermissionRuleValue[];
};

// ── 二、策略与来源标记 ──────────────────────────────────────────────

/** 收窄一次权限询问愿意给出的选项。`no-always-allow` 去掉「永久允许」：有些工具每次调用带的 代码都不一样（例如 CreateWorkflow 生成的脚本），记住一条长期规则等于永久关掉这道门，而不是 记住一个可比较的判断。`session-always-allow` 则把长期规则换成只存在于运行时内存的会话级 授权。 */
export type PermissionOptionsPolicy = "no-always-allow" | "session-always-allow";

/** 拒绝反馈的来源标记。工作流 Refine 与 plan 反馈同构：只有携带专用 source 的 deny + reason， 才允许被提升成一条真实的 user message。 */
export type PermissionBrokerReasonSource = "plan_approval_feedback" | "workflow_refine_feedback";

// ── 三、能力分组常量 ────────────────────────────────────────────────

/** 能力分组表：把「官方 computer use」这类需要单独授权的工具归到同一个组名下。组名会写进规则 与授权记录，属于运行时协议的一部分，取值不能改写。由权限代理读取，供规则匹配使用。 */
export const PermissionCapabilityGroup = { OfficialCua: "official_cua" } as const;

/** 从上表取出的合法分组名联合；增补分组只改表即可。 */
export type PermissionCapabilityGroup =
  (typeof PermissionCapabilityGroup)[keyof typeof PermissionCapabilityGroup];

// ── 四、请求与结果 ──────────────────────────────────────────────────

/** 一次权限询问。`requestId` 由代理侧生成，充当应答路由的键；工具身份（toolName / input / ruleId / riskLevel / sideEffectScope）由工具运行时填写，`origin` 记录触发来源。 */
export interface PermissionBrokerRequest {
  requestId: string;
  sessionId: SessionId;
  turnId?: TurnId;
  traceId: TraceId;
  toolCallId: ToolCallId;
  toolName: string;
  input: unknown;
  mode: CollaborationMode;
  ruleId: string;
  reason: string;
  riskLevel: RiskLevel;
  sideEffectScope?: ModelToolSideEffectScope;
  suggestedPermissionUpdates?: PermissionUpdate[];
  optionsPolicy?: PermissionOptionsPolicy;
  requestedAt: Date;
  origin?: InteractionRequestOrigin;
}

// 权限询问的结论。 `decision` 是唯一必填项，其余按决策附带：说明文本、改写后的工具输入、要回写 的规则更新，以及解析时间。
// 规则更新有两个所有者：`permissionUpdates` 会被持久化，`sessionPermissionUpdates` 只作用于 运行时的会话内存。
// 后者由代理在应答侧合成，因为线上协议的选项 schema 是严格的。 `preserveReasonFormatting` 保留 provider 可见的原因原文；
// `reasonSource` 说明该原因来自 plan 审批还是工作流 Refine 反馈。
export interface PermissionBrokerResult {
  decision: PermissionDecision;
  reason?: string;
  preserveReasonFormatting?: boolean;
  reasonSource?: PermissionBrokerReasonSource;
  modifiedInput?: unknown;
  permissionUpdates?: PermissionUpdate[];
  sessionPermissionUpdates?: PermissionUpdate[];
  resolvedAt?: Date;
}

/** 调用方可选的等待控制。`claimResponse` 让调用方在应答抵达时先抢一次唯一处理权，抢不到就退回 用户审批流程，Hook 不再介入；`signal` 与 `timeoutMs` 分别表达取消与等待上限。 */
export interface PermissionBrokerRequestOptions {
  claimResponse?: () => boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

// ── 五、端口与预备句柄 ──────────────────────────────────────────────

/** 权限代理对外的能力面。规范顺序是先 `preparePermission` 拿到句柄（此时应答路由已绑定，通知 尚未激活），再决定何时激活；`requestPermission` 是同一件事的一步式便捷入口，core 走前者。 */
export interface PermissionBrokerPort {
  preparePermission(
    request: PermissionBrokerRequest,
    options?: PermissionBrokerRequestOptions,
  ): Promise<PreparedPermissionRequest>;
  requestPermission(
    request: PermissionBrokerRequest,
    options?: PermissionBrokerRequestOptions,
  ): Promise<PermissionBrokerResult>;
}

/** 一次已绑定应答路由、尚未激活的询问句柄，由代理创建后交给调用方。`result` 要等激活之后才会 落定；`activate` 回报本次激活是否被受理（已答复或已释放的请求返回 false）；`dispose` 幂等地 释放这一代句柄，并让悬空的 `result` 结束。 */
export interface PreparedPermissionRequest {
  readonly result: Promise<PermissionBrokerResult>;
  activate(): boolean;
  dispose(): void;
}
