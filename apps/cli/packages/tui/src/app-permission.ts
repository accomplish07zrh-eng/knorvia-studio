// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  AMEND_WORKFLOW_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionInputSchema,
  CREATE_WORKFLOW_TOOL_NAME,
  type PermissionBrokerPort,
} from "@knorvia/contracts";
import { activatePermissionRequest, PermissionPreparation } from "@knorvia/core";
import type React from "react";
import type { ApprovalPrompt } from "./app-model.js";
import { createQuestionPromptState } from "./app-question-state.js";
import type { TuiRequestPermission } from "./types.js";

export function createTuiPermissionRequester(input: {
  setApprovalQueue: React.Dispatch<React.SetStateAction<ApprovalPrompt[]>>;
  setStatus: (status: string) => void;
}): TuiRequestPermission {
  const preparePermission: PermissionBrokerPort["preparePermission"] = async (request, options) => {
    let prompt: ApprovalPrompt | undefined;
    const removePrompt = () => {
      if (!prompt) return;
      const previous = prompt;
      prompt = undefined;
      input.setApprovalQueue((queue) => queue.filter((item) => item !== previous));
    };
    return new PermissionPreparation({
      signal: options?.signal,
      cancelled: () => new Error("Permission request cancelled"),
      dispose: removePrompt,
      activate: (owner) => {
        // CLI 工作流确认例外只放行这一次，不生成会话或持久 allow 规则。
        if ([CREATE_WORKFLOW_TOOL_NAME, AMEND_WORKFLOW_TOOL_NAME].includes(request.toolName)) {
          owner.resolve({
            decision: "allow",
            reason: `${request.toolName} auto-allowed in CLI (confirmation gate bypass)`,
            resolvedAt: new Date(),
          });
          return;
        }
        const question =
          request.toolName === ASK_USER_QUESTION_TOOL_NAME
            ? AskUserQuestionInputSchema.safeParse(request.input)
            : undefined;
        if (question && !question.success) {
          owner.resolve({
            decision: "deny",
            reason: `Invalid AskUserQuestion input: ${question.error.issues[0]?.message ?? "schema validation failed"}`,
            resolvedAt: new Date(),
          });
          return;
        }
        const approval: ApprovalPrompt = {
          cleanup: removePrompt,
          request,
          selectedDecision: "deny",
          questionState: question?.success ? createQuestionPromptState(question.data) : undefined,
          resolve: (result) =>
            owner.resolveFrom(() => ({ ...result, resolvedAt: result.resolvedAt ?? new Date() })),
          reject: (error) => owner.reject(error),
        };
        // 登记与显示分开：core 先发布 Requested，再把本次 prompt 放入显示队列。
        prompt = approval;
        input.setApprovalQueue((queue) => [...queue, approval]);
        input.setStatus(
          approval.questionState
            ? "Answer the clarification question."
            : `Approval required for ${request.toolName}.`,
        );
      },
    });
  };
  const requestPermission: PermissionBrokerPort["requestPermission"] = (request, options) =>
    activatePermissionRequest(preparePermission(request, options));
  return Object.assign(requestPermission, { preparePermission });
}
