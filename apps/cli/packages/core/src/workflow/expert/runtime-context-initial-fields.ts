// SPDX-License-Identifier: Apache-2.0
// 初始快照的字段表：把「常量字段 / 定义字段 / 图字段 / 会话字段 / 策略字段」分组拼装。
import type { ExpertWorkflowRunSnapshot, WorkflowDefinition } from "@knorvia/contracts";
import { createPhaseGraph } from "./prompts.js";

/** 初始快照入参：任务原文、工作目录与可选会话/追踪标识。 */
export type InitialSnapshotInput = {
  cwd: string;
  sessionId?: string;
  task: string;
  traceContext?: { traceId: string };
};

type FieldRows = readonly (readonly [keyof ExpertWorkflowRunSnapshot, unknown])[];

/** 常量字段：空集合、初始状态与 schema 版本。 */
const CONSTANT_ROWS: FieldRows = [
  ["activities", []],
  ["artifacts", []],
  ["recoveryActions", []],
  ["schemaVersion", 1],
  ["sessionLinks", []],
  ["status", "pending"],
];

/** 定义字段：来自已解析的定义标识与类型。 */
const definitionRows = (definition: WorkflowDefinition): FieldRows => [
  ["definitionId", definition.definitionId],
  ["definitionVersion", definition.definitionVersion],
  ["kind", definition.kind],
  ["phaseOrder", definition.phaseOrder],
];

/** 图字段：初始相位图与相位条目。 */
const graphRows = (definition: WorkflowDefinition): FieldRows => [
  ["graph", createPhaseGraph(definition)],
  ["phases", definition.phaseOrder.map((phase) => ({ phase, status: "pending" }))],
];

/** 会话与追踪字段：可选，缺省即为 undefined。 */
const scopeRows = (input: InitialSnapshotInput): FieldRows => [
  ["sessionId", input.sessionId],
  ["traceId", input.traceContext?.traceId],
];

/** 运行字段：时间、目录、运行号与任务原文。 */
const runRows = (input: InitialSnapshotInput, runId: string, timestamp: string): FieldRows => [
  ["createdAt", timestamp],
  ["cwd", input.cwd],
  ["runId", runId],
  ["task", input.task],
  ["updatedAt", timestamp],
];

/** 初始快照字段表：五组子表拼装，键即快照字段。 */
export const initialSnapshotFields = (
  definition: WorkflowDefinition,
  input: InitialSnapshotInput,
  runId: string,
  timestamp: string,
): FieldRows => [
  ...CONSTANT_ROWS,
  ...definitionRows(definition),
  ...graphRows(definition),
  ...scopeRows(input),
  ...runRows(input, runId, timestamp),
  ["strategy", definition.strategy],
];
