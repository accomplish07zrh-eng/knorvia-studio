// SPDX-License-Identifier: Apache-2.0
// 工作区 transcript 的协议词汇表（B41）。一个 run 的 files.*/git.*/world.run 调用在侧板上以
// 工具卡回放，权威在 journal 的 dwf_node 行。两条 v4 查询按「轻行清单 / 单节点正文」拆开：
// 正文永远不进清单，清单只带 op/args/状态/摘要/时刻。只读、无状态、重发安全。
import { z } from "zod";

// 这组数值构成协议面：网关按它截尾，UI 按它预校验，改一个数就是改线。
export const WORKFLOW_WORKSPACE_LIMITS = {
  /** 一次清单最多多少行；超界由网关截尾并置 truncated。 */
  maxNodes: 2000,
  /** op 名的长度（git-changed-files 是最长的那个）。 */
  maxOpLength: 32,
  /** 实参个数（引擎侧截断后有界；未截断的原值更少）。 */
  maxArgs: 16,
  /** 失败信息的展示长度；超长由宿主切尾。 */
  maxErrorMessageLength: 2000,
  /** 正文一次最多读回多少字节（截断而不是拒绝——这是审计面，不是脚本取数面）。 */
  resultMaxBytes: 32 * 1024,
} as const;

export const workflowRunWorkspaceNodeKindSchema = z.enum(["world-read", "world-run"]);
export type WorkflowRunWorkspaceNodeKind = z.infer<typeof workflowRunWorkspaceNodeKindSchema>;

/** journal 行的状态（线上镜像）。 */
export const workflowRunWorkspaceNodeStatusSchema = z.enum(["running", "completed", "failed"]);
export type WorkflowRunWorkspaceNodeStatus = z.infer<typeof workflowRunWorkspaceNodeStatusSchema>;

/** 结构化失败：journal error_json 的 code + message（其余字段不出协议），strict。 */
export const workflowRunWorkspaceNodeErrorSchema = z
  .object({
    code: z.string().min(1).max(64),
    message: z.string().max(WORKFLOW_WORKSPACE_LIMITS.maxErrorMessageLength),
  })
  .strict();
export type WorkflowRunWorkspaceNodeError = z.infer<typeof workflowRunWorkspaceNodeErrorSchema>;

// 清单上一行的摘要：不解正文就能报的几个数。哪个在场取决于 op——数组正文有 resultCount，
// world.run 有 exitCode 与两路输出字节数，字符串正文只有 resultBytes。
export const workflowRunWorkspaceNodeSummarySchema = z
  .object({
    resultBytes: z.number().int().nonnegative(),
    resultCount: z.number().int().nonnegative().optional(),
    exitCode: z.number().int().optional(),
    stdoutBytes: z.number().int().nonnegative().optional(),
    stderrBytes: z.number().int().nonnegative().optional(),
  })
  .strict();
export type WorkflowRunWorkspaceNodeSummary = z.infer<typeof workflowRunWorkspaceNodeSummarySchema>;

// 工作区 transcript 的一行。op/args 来自 input_json，升级前的历史行两者缺席；inputTruncated
// 表示 args 是逐项字符串预览而不是原值（只能是字面 true）。
export const workflowRunWorkspaceNodeSchema = z
  .object({
    siteId: z.string().min(1).max(64),
    ordinal: z.number().int().nonnegative(),
    kind: workflowRunWorkspaceNodeKindSchema,
    op: z.string().min(1).max(WORKFLOW_WORKSPACE_LIMITS.maxOpLength).optional(),
    args: z.array(z.unknown()).max(WORKFLOW_WORKSPACE_LIMITS.maxArgs).optional(),
    inputTruncated: z.literal(true).optional(),
    status: workflowRunWorkspaceNodeStatusSchema,
    error: workflowRunWorkspaceNodeErrorSchema.optional(),
    summary: workflowRunWorkspaceNodeSummarySchema.optional(),
    /** journal 行的建立/最近更新时刻（epoch 毫秒）；二者之差就是这一步的耗时。 */
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type WorkflowRunWorkspaceNode = z.infer<typeof workflowRunWorkspaceNodeSchema>;

// v4 查询①：workflowRunWorkspace（轻行清单）。
export const v4ConversationWorkflowRunWorkspaceParamsSchema = z
  .object({
    sessionId: z.string().min(1),
    runId: z.string().min(1),
  })
  .strict();
export type V4ConversationWorkflowRunWorkspaceParams = z.infer<
  typeof v4ConversationWorkflowRunWorkspaceParamsSchema
>;

export const v4ConversationWorkflowRunWorkspaceResultSchema = z
  .object({
    /** 按落库先后（journal 行 id 升序 = 引擎准入顺序）。 */
    nodes: z.array(workflowRunWorkspaceNodeSchema).max(WORKFLOW_WORKSPACE_LIMITS.maxNodes),
    /** 清单超过 maxNodes 被截尾。 */
    truncated: z.boolean().optional(),
  })
  .strict();
export type V4ConversationWorkflowRunWorkspaceResult = z.infer<
  typeof v4ConversationWorkflowRunWorkspaceResultSchema
>;

// v4 查询②：workflowRunNodeResult（一个节点的正文）。授权在 CLI 侧：sessionId 必须是该 run 的
// parentSessionId。正文按 maxBytes 保形有界化（字符串切尾、数组去尾、run 的 stdout/stderr 各自切尾）。
export const v4ConversationWorkflowRunNodeResultParamsSchema = z
  .object({
    sessionId: z.string().min(1),
    runId: z.string().min(1),
    siteId: z.string().min(1).max(64),
    ordinal: z.number().int().nonnegative(),
    /** 缺省与上限都是 resultMaxBytes；网关钳制。 */
    maxBytes: z.number().int().positive().max(WORKFLOW_WORKSPACE_LIMITS.resultMaxBytes).optional(),
  })
  .strict();
export type V4ConversationWorkflowRunNodeResultParams = z.infer<
  typeof v4ConversationWorkflowRunNodeResultParamsSchema
>;

export const v4ConversationWorkflowRunNodeResultResultSchema = z
  .object({
    status: workflowRunWorkspaceNodeStatusSchema,
    /** 有界化后的正文；running 行与 failed 行缺席。 */
    result: z.unknown().optional(),
    error: workflowRunWorkspaceNodeErrorSchema.optional(),
    truncated: z.boolean(),
    /** 截断前的序列化字节数。 */
    totalBytes: z.number().int().nonnegative(),
  })
  .strict();
export type V4ConversationWorkflowRunNodeResultResult = z.infer<
  typeof v4ConversationWorkflowRunNodeResultResultSchema
>;
