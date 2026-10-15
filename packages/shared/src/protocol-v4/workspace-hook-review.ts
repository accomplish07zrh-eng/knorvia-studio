// SPDX-License-Identifier: Apache-2.0
// 工作区 Hook 信任/审核的协议词汇表（B42）。信任态七词表、审核决策（去重）、命令 target、
// 审核请求载荷与呈现 schema 都在这里；请求载荷带一组跨字段一致性校验（三处计数必须与 items 对齐）。
import { z } from "zod";
import { timestampSchema } from "./core.js";

// 私有基础片段收敛成一张表：非空串、正整数、非负整数、64 位小写 hex 摘要，外加去重 issue
// 用的自定义码。表只在模块里解构一次，下面各 schema 直接用解构出来的名字。
const sharedFields = {
  textField: z.string().trim().min(1),
  wholeNumber: z.number().int().positive(),
  countField: z.number().int().nonnegative(),
  digestField: z.string().regex(/^[a-f0-9]{64}$/u),
  customIssue: z.ZodIssueCode.custom,
} as const;

const { textField, wholeNumber, countField, digestField, customIssue } = sharedFields;

// 去重 issue 的固定文案只在这里出现一次；调用点只剩 path 一条信息。
const DUPLICATE_IDS_MESSAGE = "review item ids must be unique";

export const workspaceHookReviewTrustStateSchema = z.enum([
  "not_applicable",
  "pending_trust",
  "trusted_persistent",
  "blocked_untrusted",
  "blocked_policy",
  "revoked",
  "stale_digest",
]);
export type WorkspaceHookReviewTrustState = z.infer<typeof workspaceHookReviewTrustStateSchema>;

export const workspaceHookReviewDecisionSchema = z
  .object({
    action: z.literal("trust_selected"),
    reviewItemIds: z.array(textField).min(1),
  })
  .strict()
  .superRefine((decision, report) => {
    if ("reviewItemIds" in decision && decision.reviewItemIds) {
      flagRepeated(decision.reviewItemIds, report, ["reviewItemIds"]);
    }
  });
export type WorkspaceHookReviewDecision = z.infer<typeof workspaceHookReviewDecisionSchema>;

export const workspaceHookReviewCommandTargetSchema = z
  .object({
    sessionId: textField,
    taskId: textField,
    runId: textField,
    remoteSessionId: textField.optional(),
    workspaceIdentity: textField,
    bundleDigest: digestField,
    reviewFlowId: textField,
    generation: wholeNumber,
    interactionId: textField,
  })
  .strict();
export type WorkspaceHookReviewCommandTarget = z.infer<
  typeof workspaceHookReviewCommandTargetSchema
>;

export const workspaceHookTrustRevokeTargetSchema = z
  .object({
    sessionId: textField,
    remoteSessionId: textField.optional(),
    workspaceIdentity: textField,
    bundleDigest: digestField,
    hookDeclarationDigests: z.array(digestField).min(1),
  })
  .strict()
  .superRefine((target, report) => {
    flagRepeated(target.hookDeclarationDigests, report, ["hookDeclarationDigests"]);
  });
export type WorkspaceHookTrustRevokeTarget = z.infer<typeof workspaceHookTrustRevokeTargetSchema>;

// 软门禁：按需开审核 flow 的命令 target。与 revoke 的非 flow 变体同形，但不需要
// hookDeclarationDigests（审核 flow 从当前 snapshot 拉全部 pending items）。
export const requestWorkspaceHookReviewTargetSchema = z
  .object({
    sessionId: textField,
    remoteSessionId: textField.optional(),
    workspaceIdentity: textField,
    bundleDigest: digestField,
  })
  .strict();
export type RequestWorkspaceHookReviewTarget = z.infer<
  typeof requestWorkspaceHookReviewTargetSchema
>;

// 审核请求载荷：kind 与 warningCode 是封闭字面量，两处时间戳必须同向，summary 的三个计数
// 必须与 items 对齐，items 的 reviewItemId 不得重复。待审核的单条 Hook 声明内联在 items 里：
// event / type / executionMode 都是封闭词表，warningCode 固定字面量，逐条字段写在这里，
// 读的人不用跳到另一个定义去看一条 item 长什么样。
export const workspaceHookReviewRequestPayloadSchema = z
  .object({
    kind: z.literal("workspaceHookReview"),
    reviewFlowId: textField,
    generation: wholeNumber,
    interactionId: textField,
    sessionId: textField,
    taskId: textField,
    runId: textField,
    workspaceIdentity: textField,
    workspaceLabel: textField,
    remoteSessionId: textField.optional(),
    bundleDigest: digestField,
    createdAt: timestampSchema,
    deadlineAt: timestampSchema,
    sourceFiles: z.array(
      z
        .object({
          path: textField,
          displayPath: textField,
          editable: z.boolean(),
        })
        .strict(),
    ),
    summary: z
      .object({
        eventCount: countField,
        hookCount: countField,
        pendingCount: countField,
      })
      .strict(),
    items: z.array(
      z
        .object({
          reviewItemId: textField,
          event: z.enum([
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "PermissionRequest",
            "PostToolUse",
            "PostToolUseFailure",
            "Stop",
          ]),
          matcher: z.string().optional(),
          type: z.enum(["command", "process"]),
          displayName: textField,
          displayCommand: textField,
          sourcePath: textField,
          resolvedTimeoutMs: wholeNumber,
          resolvedMaxOutputBytes: wholeNumber,
          executionMode: z.enum(["foreground", "background"]),
          configuredEnabled: z.boolean(),
          editable: z.boolean(),
          trustState: workspaceHookReviewTrustStateSchema,
        })
        .strict(),
    ),
    warningCode: z.literal("workspace_hooks_execute_code"),
  })
  .strict()
  .superRefine((payload, report) => {
    if (payload.deadlineAt < payload.createdAt) {
      report.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deadlineAt"],
        message: "deadlineAt must not precede createdAt",
      });
    }
    if (payload.summary.hookCount !== payload.items.length) {
      report.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["summary", "hookCount"],
        message: "hookCount must match the immutable request items",
      });
    }
    const distinctEvents = new Set(payload.items.map((entry) => entry.event)).size;
    if (payload.summary.eventCount !== distinctEvents) {
      report.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["summary", "eventCount"],
        message: "eventCount must match the immutable request items",
      });
    }
    const awaitingTrust = payload.items.filter((entry) =>
      ["pending_trust", "revoked", "stale_digest"].includes(entry.trustState),
    ).length;
    if (payload.summary.pendingCount !== awaitingTrust) {
      report.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["summary", "pendingCount"],
        message: "pendingCount must match pending admission items",
      });
    }
    flagRepeated(
      payload.items.map((entry) => entry.reviewItemId),
      report,
      ["items"],
    );
  });
export type WorkspaceHookReviewRequestPayload = z.infer<
  typeof workspaceHookReviewRequestPayloadSchema
>;

export const presentWorkspaceHookReviewRequestSchema = z
  .object({
    reviewFlowId: textField,
    generation: wholeNumber,
    interactionId: textField,
    sessionId: textField,
    workspaceIdentity: textField,
    bundleDigest: digestField,
    settingsSection: z.literal("hooks"),
    settingsScope: z.literal("workspace"),
  })
  .strict();
export type PresentWorkspaceHookReviewRequest = z.infer<
  typeof presentWorkspaceHookReviewRequestSchema
>;

// 值列表出现重复时打一条固定文案的 issue（审核项 id / hook 摘要都用它去重）。
// 先按集合数一遍：集合大小没变就说明没有重复项，直接返回，省掉一次 issue 构造。
const flagRepeated = (
  values: readonly string[],
  report: z.RefinementCtx,
  at: PropertyKey[],
): void => {
  const tally = new Set(values);
  if (tally.size !== values.length) {
    report.addIssue({ code: customIssue, path: at, message: DUPLICATE_IDS_MESSAGE });
  }
};
