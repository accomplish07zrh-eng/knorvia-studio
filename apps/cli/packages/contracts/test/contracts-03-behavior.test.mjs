// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-03 契约测试：运行时可观察行为（B2、B3、B4、B5、B7）。
// 只走公开入口（包根、./skills、./telemetry 与包内单文件入口），不做内部实现断言。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { load, loadFile } from "./entry.mjs";

const mapping = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../specs/contracts/contracts-03/fixtures/query-source-mapping.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

test("B2 模型 API operation / actor / failure 取值表与恒等映射", async () => {
  const {
    ModelApiActorKind,
    ModelApiOperation,
    ModelFailureExceptionKind,
    mapModelApiOperationToAgentOperation,
  } = await load("telemetry");

  assert.deepEqual(ModelApiOperation, {
    AgentStep: "agent_step",
    ContextCompaction: "context_compaction",
    GoalTitle: "goal_title_generation",
    GoalVerification: "goal_completion_verification",
    GitCommitMessage: "workspace_git_commit_message",
    ProjectMemoryExtract: "project_memory_extract",
    ReadSessionContextExtract: "read_session_context_extract",
    ReadSessionContextSynthesize: "read_session_context_synthesize",
    SessionTitle: "session_title_generation",
    ToolInternalModelCall: "tool_internal_model_call",
    WebFetch: "web_fetch_processing",
    WebSearch: "web_search",
    WorkspaceGenerateText: "workspace_generate_text",
  });
  assert.deepEqual(ModelApiActorKind, {
    MainAgent: "main",
    Subagent: "subagent",
    WorkflowChild: "workflow_child",
    System: "system",
    Tool: "tool",
  });
  assert.deepEqual(ModelFailureExceptionKind, {
    ApiCall: "api_call",
    Generic: "generic",
    Protocol: "protocol",
    ProviderBusiness: "provider_business",
    Transport: "transport",
    TypeError: "type_error",
    Validation: "validation",
  });
  // 映射是恒等：13 个取值逐个再走一次映射必须原样返回。
  const values = Object.values(ModelApiOperation);
  assert.equal(values.length, 13);
  for (const value of values)
    assert.equal(mapModelApiOperationToAgentOperation(value), value, `映射 ${value} 必须是恒等`);
});

test("B3 querySource 映射表、observation 覆盖与 logicalCallId 兜底", async () => {
  const { ModelApiActorKind, ModelApiOperation, resolveModelApiCallObservation } =
    await load("telemetry");

  for (const item of [...mapping.cases, ...mapping.whitespacePadded]) {
    const resolved = resolveModelApiCallObservation(item.querySource, undefined);
    assert.equal(
      resolved.operation,
      item.operation,
      `querySource=${JSON.stringify(item.querySource)}`,
    );
    assert.equal(
      resolved.actorKind,
      item.actorKind,
      `querySource=${JSON.stringify(item.querySource)}`,
    );
    assert.match(resolved.logicalCallId, UUID_V4, "未给 logicalCallId 时必须生成 UUID v4");
  }

  for (const source of [...mapping.defaultCases, undefined]) {
    const resolved = resolveModelApiCallObservation(source, undefined);
    assert.equal(
      resolved.operation,
      mapping.defaultExpectation.operation,
      `默认分支 ${String(source)}`,
    );
    assert.equal(
      resolved.actorKind,
      mapping.defaultExpectation.actorKind,
      `默认分支 ${String(source)}`,
    );
  }

  // observation 覆盖映射结果；未给的字段沿用映射值。
  const overridden = resolveModelApiCallObservation("main_turn", {
    operation: ModelApiOperation.WebSearch,
    actorKind: ModelApiActorKind.Tool,
    attributes: { streamRecoveryNumber: 2 },
    logicalCallId: "  call-1  ",
  });
  assert.equal(overridden.operation, "web_search");
  assert.equal(overridden.actorKind, "tool");
  assert.equal(overridden.logicalCallId, "call-1", "给出的 logicalCallId 必须去首尾空白后原样使用");
  assert.deepEqual(overridden.attributes, { streamRecoveryNumber: 2 });

  const partial = resolveModelApiCallObservation("web_search_tool", { operationId: "op-1" });
  assert.equal(partial.operation, "web_search", "未覆盖 operation 时用映射结果");
  assert.equal(partial.actorKind, "tool", "未覆盖 actorKind 时用映射结果");
  assert.equal(partial.operationId, "op-1", "其余 observation 字段必须保留");

  // 只有空白的 logicalCallId 视为未给。
  const blank = resolveModelApiCallObservation(undefined, { logicalCallId: "   " });
  assert.match(blank.logicalCallId, UUID_V4);

  // 不共享可变状态：每次调用返回新对象、新 id。
  const first = resolveModelApiCallObservation("main_turn", undefined);
  const second = resolveModelApiCallObservation("main_turn", undefined);
  assert.notEqual(first, second);
  assert.notEqual(first.logicalCallId, second.logicalCallId);

  // 映射结果必须都是 agent-execution 侧 operation 表的成员。
  const { AgentTelemetryOperation } = await load("telemetry");
  const agentValues = new Set(Object.values(AgentTelemetryOperation));
  for (const item of mapping.cases)
    assert.ok(
      agentValues.has(item.operation),
      `${item.operation} 必须存在于 AgentTelemetryOperation`,
    );
});

test("B4 telemetry schema 版本与 agent operation 取值表", async () => {
  const { AgentTelemetryOperation, TELEMETRY_SCHEMA_VERSION } = await loadFile(
    "telemetry/agent-execution",
  );
  assert.equal(TELEMETRY_SCHEMA_VERSION, 6);
  assert.deepEqual(AgentTelemetryOperation, {
    AgentStep: "agent_step",
    ContextCompaction: "context_compaction",
    GoalCompletionVerification: "goal_completion_verification",
    GoalTitleGeneration: "goal_title_generation",
    ProjectMemoryExtract: "project_memory_extract",
    ReadSessionContextExtract: "read_session_context_extract",
    ReadSessionContextSynthesize: "read_session_context_synthesize",
    SessionTitleGeneration: "session_title_generation",
    ToolInternalModelCall: "tool_internal_model_call",
    WebFetchProcessing: "web_fetch_processing",
    WebSearch: "web_search",
    WorkspaceGitCommitMessage: "workspace_git_commit_message",
    WorkspaceGenerateText: "workspace_generate_text",
  });

  // 两个 operation 表按语义一一对应：同一语义的取值必须完全相同。
  const { ModelApiOperation } = await load("telemetry");
  const pairs = [
    ["AgentStep", "AgentStep"],
    ["ContextCompaction", "ContextCompaction"],
    ["GoalTitle", "GoalTitleGeneration"],
    ["GoalVerification", "GoalCompletionVerification"],
    ["GitCommitMessage", "WorkspaceGitCommitMessage"],
    ["ProjectMemoryExtract", "ProjectMemoryExtract"],
    ["ReadSessionContextExtract", "ReadSessionContextExtract"],
    ["ReadSessionContextSynthesize", "ReadSessionContextSynthesize"],
    ["SessionTitle", "SessionTitleGeneration"],
    ["ToolInternalModelCall", "ToolInternalModelCall"],
    ["WebFetch", "WebFetchProcessing"],
    ["WebSearch", "WebSearch"],
    ["WorkspaceGenerateText", "WorkspaceGenerateText"],
  ];
  for (const [modelKey, agentKey] of pairs)
    assert.equal(
      AgentTelemetryOperation[agentKey],
      ModelApiOperation[modelKey],
      `${modelKey} 与 ${agentKey} 的取值必须一致`,
    );
});

test("B5 本地 ISO 日期：补零、本地时区语义、年不补零", async () => {
  const { formatLocalIsoDate } = await loadFile("time/local-date");

  assert.equal(formatLocalIsoDate(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(formatLocalIsoDate(new Date(2026, 8, 9)), "2026-09-09");
  assert.equal(formatLocalIsoDate(new Date(2026, 11, 31)), "2026-12-31");
  assert.equal(formatLocalIsoDate(new Date(2028, 1, 29)), "2028-02-29", "闰年 2 月 29 日");
  // 年份按本地 getFullYear 原样输出（不补零、不截断）。
  assert.equal(formatLocalIsoDate(new Date(999, 0, 1)), "999-01-01");
  assert.equal(formatLocalIsoDate(new Date(10000, 0, 1)), "10000-01-01");

  // 本地时区语义：与同一 Date 的本地 getter 一致（不使用 UTC 字段）。
  const late = new Date(2026, 5, 15, 23, 59, 59);
  const expected = `${late.getFullYear()}-${String(late.getMonth() + 1).padStart(2, "0")}-${String(
    late.getDate(),
  ).padStart(2, "0")}`;
  assert.equal(formatLocalIsoDate(late), expected);
  const early = new Date(2026, 0, 1, 0, 0, 1);
  assert.equal(
    formatLocalIsoDate(early),
    `${early.getFullYear()}-01-01`,
    "本地午夜刚过仍取本地日历日",
  );

  // 幂等且不修改入参。
  const date = new Date(2026, 2, 3, 12, 0, 0);
  const before = date.getTime();
  assert.equal(formatLocalIsoDate(date), formatLocalIsoDate(date));
  assert.equal(date.getTime(), before);
});

test("B7 包根对 @knorvia/shared 的取值转发", async () => {
  const root = await load();
  // 值由 @knorvia/shared 的 media-policy 提供，本包只转发：数值与错误码必须原样可见。
  assert.equal(root.VIDEO_INPUT_MAX_BYTES, 30 * 1024 * 1024);
  assert.equal(
    root.MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE,
    "MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE",
  );
  assert.equal(
    root.MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE,
    "MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE",
  );
  assert.equal(
    root.MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE,
    "MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE",
  );
  // 同一模块实例：包根与 ./telemetry、./skills 不产生第二份实现。
  const telemetry = await load("telemetry");
  assert.equal(telemetry.TELEMETRY_SCHEMA_VERSION, root.TELEMETRY_SCHEMA_VERSION);
});
