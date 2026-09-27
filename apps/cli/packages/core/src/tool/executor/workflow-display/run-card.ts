// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS,
  type GetWorkflowRunOutput,
  type GetWorkflowRunToolResultDisplayPayload,
} from "@knorvia/contracts";
import { CardBudget } from "./policy.js";

type SourceAgent = GetWorkflowRunOutput["subagents"][number];
type AgentRow = NonNullable<GetWorkflowRunToolResultDisplayPayload["subagents"]>[number];

// 顺序是持久化协议的一部分；每个来源区段只提供允许展示的键，不透传诊断袋。
function agentRow(source: SourceAgent): AgentRow {
  const { currentAsk: ask, wait } = source;
  const row: Partial<AgentRow> = { siteId: source.siteId, ordinal: source.ordinal };
  const put = <K extends keyof AgentRow>(key: K, value: AgentRow[K]) => {
    if (value !== undefined) row[key] = value;
  };
  put("name", source.name);
  row.state = source.state;
  put("phaseName", source.phaseName);
  if (ask) {
    for (const key of ["instructionsHead", "startedAt", "turn", "toolCalls", "lastTool"] as const)
      put(key, ask[key]);
  }
  if (wait) {
    row.waitCause = wait.cause;
    put("retryAfterMs", wait.retryAfterMs);
    put("waitSince", wait.since);
  }
  put("parkedOn", source.parkedOn);
  row.stepsSettled = source.stepsSettled;
  row.stepsFailed = source.stepsFailed;
  row.tokens = source.tokens;
  put("lastProgressAt", source.lastProgressAt);
  // 必填键在以上封闭流程写入，动态写入器只处理静态列协议中的可选键。
  return row as AgentRow;
}

export function runCard(data: GetWorkflowRunOutput): GetWorkflowRunToolResultDisplayPayload {
  const budget = new CardBudget();
  const actors = budget.window(data.actors, WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS);
  const recent = budget.window(data.logTail, WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES, "tail");
  const logTail = recent.map((entry) => ({
    sequence: entry.sequence,
    message: budget.text(entry.message, WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS),
    ...(entry.at === undefined ? {} : { at: entry.at }),
  }));
  const result = budget.optionalText(data.result, WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS);
  const error =
    data.error === undefined ? undefined : { code: data.error.code, message: data.error.message };
  const phases =
    data.phases === undefined
      ? undefined
      : budget.window(data.phases, WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES);
  const selected = budget.window(data.subagents, WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS);
  budget.note(data.subagentsTruncated === true);
  return {
    kind: "get_workflow_run",
    runId: data.runId,
    label: data.label,
    status: data.status,
    ...(data.stopReason === undefined ? {} : { stopReason: data.stopReason }),
    ...(data.possiblyInterrupted === true ? { possiblyInterrupted: true } : {}),
    summary: data.summary,
    generatedAt: data.generatedAt,
    usage: data.usage,
    ...(phases?.length ? { phases } : {}),
    subagents: selected.map(agentRow),
    health: data.health,
    actors,
    logTail,
    ...(result === undefined ? {} : { result }),
    ...(error === undefined ? {} : { error }),
    ...budget.flag,
  };
}
