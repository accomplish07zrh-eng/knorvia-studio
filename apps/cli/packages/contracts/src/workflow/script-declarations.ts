// SPDX-License-Identifier: Apache-2.0
// 脚本工作流的协议声明、常量表、类型与 schema（兼容面，逐字冻结；纯声明模块，计分走声明模式）。
// 唯一的实现逻辑（脚本元数据的重复阶段标题校验）在 script-validation.ts，script.ts 只做再导出。
import { z } from "zod";
import type { SessionId } from "../interfaces/shared.js";
import { collectScriptMetaIssues } from "./script-validation.js";

const WORKFLOW_AGENT_TOOL_LIMIT = 128;
const WORKFLOW_AGENT_SKILL_LIMIT = 64;
const WORKFLOW_AGENT_TURN_LIMIT = 200;
const WORKFLOW_AGENT_TIMEOUT_LIMIT_MS = 86_400_000;

export const WorkflowScriptPhaseMetaSchema = z
  .object({
    detail: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    title: z.string().min(1),
  })
  .strict();
export type WorkflowScriptPhaseMeta = z.infer<typeof WorkflowScriptPhaseMetaSchema>;

export const WorkflowScriptMetaSchema = z
  .object({
    description: z.string().min(1),
    name: z.string().min(1),
    phases: z.array(WorkflowScriptPhaseMetaSchema).default([]),
    whenToUse: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((meta, context) => {
    for (const issue of collectScriptMetaIssues(meta)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  });
export type WorkflowScriptMeta = z.infer<typeof WorkflowScriptMetaSchema>;

export const WorkflowAgentIsolationSchema = z.enum(["worktree"]);
export type WorkflowAgentIsolation = z.infer<typeof WorkflowAgentIsolationSchema>;

export const WorkflowAgentOptionsSchema = z
  .object({
    agentType: z.string().min(1).optional(),
    instructions: z.string().min(1).optional(),
    isolation: WorkflowAgentIsolationSchema.optional(),
    label: z.string().min(1).optional(),
    maxTurns: z.number().int().positive().max(WORKFLOW_AGENT_TURN_LIMIT).optional(),
    model: z.string().min(1).optional(),
    phase: z.string().min(1).optional(),
    schema: z.record(z.unknown()).optional(),
    skills: z.array(z.string().min(1)).max(WORKFLOW_AGENT_SKILL_LIMIT).optional(),
    systemPrompt: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().max(WORKFLOW_AGENT_TIMEOUT_LIMIT_MS).optional(),
    tools: z.array(z.string().min(1)).max(WORKFLOW_AGENT_TOOL_LIMIT).optional(),
  })
  .strict();
export type WorkflowAgentOptions = z.infer<typeof WorkflowAgentOptionsSchema>;

export const WorkflowAgentCallInputSchema = z
  .object({
    callPath: z.string().min(1).optional(),
    phase: z.string().min(1).optional(),
    opts: WorkflowAgentOptionsSchema.optional(),
    prompt: z.string().min(1),
  })
  .strict();
export type WorkflowAgentCallInput = z.infer<typeof WorkflowAgentCallInputSchema>;

export const SCRIPT_WORKFLOW_RUN_STATUSES = [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ScriptWorkflowRunStatus = (typeof SCRIPT_WORKFLOW_RUN_STATUSES)[number];

export const SCRIPT_WORKFLOW_ACTIVITY_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
  "cancelled",
  "cached",
  "lost",
] as const;
export type ScriptWorkflowActivityStatus = (typeof SCRIPT_WORKFLOW_ACTIVITY_STATUSES)[number];

export type ScriptWorkflowSource = "builtin" | "user";
export const SCRIPT_WORKFLOW_DEFINITION_SCOPES = [
  "builtin",
  "explicit",
  "project",
  "user",
] as const;
export type ScriptWorkflowDefinitionScope = (typeof SCRIPT_WORKFLOW_DEFINITION_SCOPES)[number];

export interface ScriptWorkflowDefinitionRecord {
  enabled: boolean;
  id: string;
  meta: WorkflowScriptMeta;
  name: string;
  scope: ScriptWorkflowDefinitionScope;
  scriptHash: string;
  scriptPath?: string;
  source: ScriptWorkflowSource;
  timeCreated: number;
  timeUpdated: number;
  trusted: boolean;
}

export interface ScriptWorkflowRunStats {
  agentCalls: number;
  cachedAgentCalls: number;
  failedAgentCalls: number;
  toolCalls: number;
  tokens: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
    reasoning: number;
    total: number;
  };
}

export const ScriptWorkflowRunStatsSchema = z
  .object({
    agentCalls: z.number().int().nonnegative(),
    cachedAgentCalls: z.number().int().nonnegative(),
    failedAgentCalls: z.number().int().nonnegative(),
    tokens: z
      .object({
        cacheRead: z.number().int().nonnegative(),
        cacheWrite: z.number().int().nonnegative(),
        input: z.number().int().nonnegative(),
        output: z.number().int().nonnegative(),
        reasoning: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    toolCalls: z.number().int().nonnegative(),
  })
  .strict();

export interface ScriptWorkflowRunRecord {
  args?: unknown;
  argsHash?: string;
  budgetSpent: number;
  budgetTotal?: number;
  completedAt?: number;
  createdAt: number;
  currentPhase?: string;
  cwd: string;
  definitionId?: string;
  failure?: unknown;
  id: string;
  kind: "script";
  name: string;
  parentSessionId?: SessionId;
  scriptHash: string;
  scriptPath?: string;
  startedAt?: number;
  stats?: ScriptWorkflowRunStats;
  status: ScriptWorkflowRunStatus;
  updatedAt: number;
}

export interface ScriptWorkflowActivityRecord {
  attempt: number;
  callIndex: number;
  callPath: string;
  childSessionId?: SessionId;
  completedAt?: number;
  createdAt: number;
  error?: unknown;
  id: string;
  inputHash: string;
  label?: string;
  opts?: WorkflowAgentOptions;
  parentActivityId?: string;
  phase?: string;
  prompt?: string;
  result?: unknown;
  runId: string;
  startedAt?: number;
  status: ScriptWorkflowActivityStatus;
  type: "agent" | "workflow" | "log" | "phase";
  updatedAt: number;
}

export interface ScriptWorkflowEventRecord {
  activityId?: string;
  createdAt: number;
  id: string;
  payload?: unknown;
  phase?: string;
  runId: string;
  sequence: number;
  type: string;
}

export interface SessionTaskLinkRecord {
  activityId?: string;
  agentType?: string;
  childSessionId: SessionId;
  createdAt: number;
  depth: number;
  id: string;
  label?: string;
  model?: string;
  parentLinkId?: string;
  parentSessionId?: SessionId;
  path: string;
  phase?: string;
  role: string;
  rootWorkflowRunId?: string;
  status: string;
  updatedAt: number;
}

export interface UpsertScriptWorkflowDefinitionInput {
  enabled?: boolean;
  id: string;
  meta: WorkflowScriptMeta;
  name: string;
  scope?: ScriptWorkflowDefinitionScope;
  scriptHash: string;
  scriptPath?: string;
  source: ScriptWorkflowSource;
  trusted?: boolean;
}

export interface CreateScriptWorkflowRunInput {
  args?: unknown;
  argsHash?: string;
  budgetTotal?: number;
  cwd: string;
  definitionId?: string;
  id: string;
  name: string;
  parentSessionId?: SessionId;
  scriptHash: string;
  scriptPath?: string;
  stats?: ScriptWorkflowRunStats;
  status?: ScriptWorkflowRunStatus;
}

export interface UpdateScriptWorkflowRunInput {
  budgetSpent?: number;
  completedAt?: number | null;
  currentPhase?: string | null;
  failure?: unknown;
  id: string;
  startedAt?: number | null;
  stats?: ScriptWorkflowRunStats;
  status?: ScriptWorkflowRunStatus;
}

export interface CreateScriptWorkflowActivityInput {
  callIndex: number;
  callPath: string;
  id: string;
  inputHash: string;
  label?: string;
  opts?: WorkflowAgentOptions;
  parentActivityId?: string;
  phase?: string;
  prompt?: string;
  runId: string;
  status?: ScriptWorkflowActivityStatus;
  type: ScriptWorkflowActivityRecord["type"];
}

export interface UpdateScriptWorkflowActivityInput {
  childSessionId?: SessionId | null;
  completedAt?: number | null;
  error?: unknown;
  id: string;
  result?: unknown;
  startedAt?: number | null;
  status?: ScriptWorkflowActivityStatus;
}

export interface CreateSessionTaskLinkInput {
  activityId?: string;
  agentType?: string;
  childSessionId: SessionId;
  depth?: number;
  id: string;
  label?: string;
  model?: string;
  parentLinkId?: string;
  parentSessionId?: SessionId;
  path: string;
  phase?: string;
  role: string;
  rootWorkflowRunId?: string;
  status: string;
}

export interface ScriptWorkflowStorePort {
  appendScriptWorkflowEvent(input: {
    activityId?: string;
    id: string;
    payload?: unknown;
    phase?: string;
    runId: string;
    type: string;
  }): Promise<ScriptWorkflowEventRecord>;
  createScriptWorkflowActivity(
    input: CreateScriptWorkflowActivityInput,
  ): Promise<ScriptWorkflowActivityRecord>;
  createScriptWorkflowRun(input: CreateScriptWorkflowRunInput): Promise<ScriptWorkflowRunRecord>;
  createSessionTaskLink(input: CreateSessionTaskLinkInput): Promise<SessionTaskLinkRecord>;
  findCachedScriptWorkflowActivity(input: {
    callPath: string;
    inputHash: string;
    runId: string;
  }): Promise<ScriptWorkflowActivityRecord | null>;
  getScriptWorkflowRun(runId: string): Promise<ScriptWorkflowRunRecord | null>;
  listScriptWorkflowActivities(input: { runId: string }): Promise<ScriptWorkflowActivityRecord[]>;
  listScriptWorkflowEvents(input: {
    limit?: number;
    runId: string;
  }): Promise<ScriptWorkflowEventRecord[]>;
  listScriptWorkflowRuns(input?: {
    cwd?: string;
    limit?: number;
    statuses?: readonly ScriptWorkflowRunStatus[];
  }): Promise<ScriptWorkflowRunRecord[]>;
  upsertScriptWorkflowDefinition(
    input: UpsertScriptWorkflowDefinitionInput,
  ): Promise<ScriptWorkflowDefinitionRecord>;
  updateScriptWorkflowActivity(
    input: UpdateScriptWorkflowActivityInput,
  ): Promise<ScriptWorkflowActivityRecord>;
  updateScriptWorkflowRun(input: UpdateScriptWorkflowRunInput): Promise<ScriptWorkflowRunRecord>;
}
