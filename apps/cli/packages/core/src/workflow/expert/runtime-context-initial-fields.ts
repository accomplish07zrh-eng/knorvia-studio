// SPDX-License-Identifier: Apache-2.0
// 初始快照的字段表：按落库键序分组拼装「空集合 → 运行范围 → 定义 → 图 → 相位 → 登记 → 会话 → 收尾」。
// 顺序即持久化 JSON 的键序：快照会整份落盘，键序变化会让既有运行记录与录制金样对不上。
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

/** 起始空集合：运行开始时还没有活动与产物。 */
const seedRows: FieldRows = [
  ["activities", []],
  ["artifacts", []],
];

/** 运行范围：创建时间与工作目录。 */
const scopeRows = (input: InitialSnapshotInput, timestamp: string): FieldRows => [
  ["createdAt", timestamp],
  ["cwd", input.cwd],
];

/** 定义标识：定义 id 与版本。 */
const identityRows = (definition: WorkflowDefinition): FieldRows => [
  ["definitionId", definition.definitionId],
  ["definitionVersion", definition.definitionVersion],
];

/** 图字段：初始相位图。 */
const graphRows = (definition: WorkflowDefinition): FieldRows => [
  ["graph", createPhaseGraph(definition)],
];

/** 相位字段：定义类型、相位顺序与相位条目。 */
const phaseRows = (definition: WorkflowDefinition): FieldRows => [
  ["kind", definition.kind],
  ["phaseOrder", definition.phaseOrder],
  ["phases", definition.phaseOrder.map((phase) => ({ phase, status: "pending" }))],
];

/** 登记字段：恢复动作、运行号与 schema 版本。 */
const registrationRows = (runId: string): FieldRows => [
  ["recoveryActions", []],
  ["runId", runId],
  ["schemaVersion", 1],
];

/** 会话与策略字段：会话标识、会话链接、初始状态与策略。 */
const sessionRows = (definition: WorkflowDefinition, input: InitialSnapshotInput): FieldRows => [
  ["sessionId", input.sessionId],
  ["sessionLinks", []],
  ["status", "pending"],
  ["strategy", definition.strategy],
];

/** 收尾字段：任务原文、追踪标识与更新时间。 */
const closingRows = (input: InitialSnapshotInput, timestamp: string): FieldRows => [
  ["task", input.task],
  ["traceId", input.traceContext?.traceId],
  ["updatedAt", timestamp],
];

/** 初始快照字段表：八组子表按落库键序拼装，键即快照字段。 */
export const initialSnapshotFields = (
  definition: WorkflowDefinition,
  input: InitialSnapshotInput,
  runId: string,
  timestamp: string,
): FieldRows => [
  ...seedRows,
  ...scopeRows(input, timestamp),
  ...identityRows(definition),
  ...graphRows(definition),
  ...phaseRows(definition),
  ...registrationRows(runId),
  ...sessionRows(definition, input),
  ...closingRows(input, timestamp),
];
