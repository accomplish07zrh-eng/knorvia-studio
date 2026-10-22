// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// TUI 侧的权限请求器：把 core 的 PermissionPreparation 接到审批队列上。
//
// 三个例外先行，其余才进队列：
//   ① **CLI 工作流确认** —— 创建/修订工作流只放行这一次，不产生会话或持久 allow 规则；
//   ② **AskUserQuestion 入参非法** —— 直接拒绝，把 schema 的第一条问题带回给模型；
//   ③ 其余请求进审批队列等用户选择；请求被取消时把它从队列里摘掉。
//
// 登记与显示是两步：先记下 prompt（供取消时摘除），再放进显示队列。

import {
  AMEND_WORKFLOW_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionInputSchema,
  CREATE_WORKFLOW_TOOL_NAME,
  type PermissionBrokerPort,
  type PermissionBrokerResult,
} from "@knorvia/contracts";
import { activatePermissionRequest, PermissionPreparation } from "@knorvia/core";
import type React from "react";
import type { ApprovalPrompt } from "./app-model.js";
import { createQuestionPromptState } from "./app-question-state.js";
import type { TuiRequestPermission } from "./types.js";

/** 走「确认门豁免」的工具：只放行这一次，不留持久规则。 */
const BYPASSED_TOOLS = new Set<string>([CREATE_WORKFLOW_TOOL_NAME, AMEND_WORKFLOW_TOOL_NAME]);

/** 往审批队列写入（React setState 形态）。 */
type QueueWriter = React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>;

/** 写状态行（纯展示，不承载业务状态）。 */
type StatusWriter = (status: string) => void;

/** 权限请求器的外部依赖。 */
type RequesterDeps = { setApprovalQueue: QueueWriter; setStatus: StatusWriter };

/** `PermissionPreparation` 的构造选项类型，以及它交给 activate 的 owner 类型（从构造函数反推）。 */
type PrepOptions = NonNullable<ConstructorParameters<typeof PermissionPreparation>[0]>;
type Owner = Parameters<NonNullable<PrepOptions["activate"]>>[0];

/** 补齐结论时刻：调用方给了 resolvedAt 就用它的，否则取当前时刻。 */
function stampResolvedAt(result: PermissionBrokerResult): PermissionBrokerResult {
  const resolvedAt = result.resolvedAt ?? new Date();
  return { ...result, resolvedAt };
}

/** 立即给出结论：结论与原因由调用方决定，时刻统一在这里取。 */
function settleNow(owner: Owner, decision: "allow" | "deny", reason: string): void {
  owner.resolve({ decision, reason, resolvedAt: new Date() });
}

/** 立即放行：工作流确认走豁免，只放行本次调用。 */
function autoAllow(owner: Owner, toolName: string): void {
  settleNow(owner, "allow", `${toolName} auto-allowed in CLI (confirmation gate bypass)`);
}

/** 立即拒绝：把 schema 的第一条问题作为原因带回给模型。 */
function denyInvalidQuestion(owner: Owner, detail: string): void {
  settleNow(owner, "deny", `Invalid AskUserQuestion input: ${detail}`);
}

/** 状态行文案：有待回答的问题时提示回答，否则提示审批哪个工具。 */
function statusFor(toolName: string, hasQuestion: boolean): string {
  if (hasQuestion) return "Answer the clarification question.";
  return `Approval required for ${toolName}.`;
}

export function createTuiPermissionRequester(input: RequesterDeps): TuiRequestPermission {
  const preparePermission: PermissionBrokerPort["preparePermission"] = async (request, options) => {
    /** 当前挂在队列里的那一条（取消时要按引用摘掉）。 */
    let shown: ApprovalPrompt | undefined;

    /** 从队列里摘掉当前 prompt（幂等：已摘过就什么都不做）。 */
    const removePrompt = (): void => {
      const target = shown;
      if (target === undefined) return;
      shown = undefined;
      const keepOthers = (queue: ApprovalPrompt[]): ApprovalPrompt[] =>
        queue.filter((item) => item !== target);
      input.setApprovalQueue(keepOthers);
    };

    /** 组装队列里的一条审批提示。 */
    const buildApproval = (owner: Owner, questionState: ApprovalPrompt["questionState"]) => {
      // 两个回调都只是把 owner 的方法转出去；resolve 额外补齐时刻。
      const resolve = (result: PermissionBrokerResult): void =>
        owner.resolveFrom(() => stampResolvedAt(result));
      const decline = (error: Error): void => owner.reject(error);
      const approval: ApprovalPrompt = {
        request,
        cleanup: removePrompt,
        selectedDecision: "deny",
        questionState,
        resolve,
        reject: decline,
      };
      return approval;
    };

    /** 登记与显示分开：先记下（供取消时摘除），再放进显示队列。 */
    const showPrompt = (approval: ApprovalPrompt): void => {
      shown = approval;
      const plusOne = (queue: ApprovalPrompt[]): ApprovalPrompt[] => [...queue, approval];
      input.setApprovalQueue(plusOne);
      input.setStatus(statusFor(request.toolName, approval.questionState !== undefined));
    };

    /** 三个例外先行：豁免 → 非法入参 → 进队列。 */
    const activate = (owner: Owner): void => {
      if (BYPASSED_TOOLS.has(request.toolName)) {
        autoAllow(owner, request.toolName);
        return;
      }

      const asksUser = request.toolName === ASK_USER_QUESTION_TOOL_NAME;
      const question = asksUser ? AskUserQuestionInputSchema.safeParse(request.input) : undefined;
      const invalidInput = question !== undefined && !question.success;
      if (invalidInput) {
        denyInvalidQuestion(owner, question.error.issues[0]?.message ?? "schema validation failed");
        return;
      }

      const questionState = question?.success
        ? createQuestionPromptState(question.data)
        : undefined;
      showPrompt(buildApproval(owner, questionState));
    };

    /** 取消原因：沿用既有文案，调用方按 message 判定。 */
    const cancelled = (): Error => new Error("Permission request cancelled");

    return new PermissionPreparation({
      signal: options?.signal,
      cancelled,
      dispose: removePrompt,
      activate: (owner) => activate(owner),
    });
  };

  const requestPermission: PermissionBrokerPort["requestPermission"] = (request, options) =>
    activatePermissionRequest(preparePermission(request, options));

  return Object.assign(requestPermission, { preparePermission });
}
