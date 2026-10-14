// SPDX-License-Identifier: Apache-2.0
// shared-01 契约测试：protocol-v4 输入与配置 schema、CUA 权限、delta/profiles（B20–B30）。
// 黑盒只走 `@knorvia/shared/protocol-v4` 公开入口；期望值以旧实现的接受/拒绝集合为准。
import assert from "node:assert/strict";
import test from "node:test";
import { protocolV4 } from "./entry.mjs";

const {
  submissionModeSchema,
  sharedContextRefSchema,
  attachmentRefSchema,
  stableForkTargetSchema,
} = protocolV4;

test("B20 提交模式枚举：build|edit|plan|yolo，auto 不被接受", () => {
  assert.deepEqual(submissionModeSchema.options, ["build", "edit", "plan", "yolo"]);
  for (const mode of ["build", "edit", "plan", "yolo"]) {
    assert.equal(submissionModeSchema.safeParse(mode).success, true, mode);
  }
  assert.equal(submissionModeSchema.safeParse("auto").success, false, "auto 是 Runtime 内部状态");
  assert.equal(submissionModeSchema.safeParse("BUILD").success, false, "大小写敏感");
  assert.equal(submissionModeSchema.safeParse(1).success, false);
});

test("B21 共享上下文引用：strict + trim 后非空", () => {
  const parsed = sharedContextRefSchema.safeParse({
    kind: "shared_context_import",
    context_id: "  abc  ",
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.context_id, "abc", "trim 后的值进入解析结果");
  assert.equal(
    sharedContextRefSchema.safeParse({ kind: "shared_context_import", context_id: "   " }).success,
    false,
    "trim 后空串拒绝",
  );
  assert.equal(
    sharedContextRefSchema.safeParse({ kind: "shared_context_import", context_id: "a", extra: 1 })
      .success,
    false,
    "未知键拒绝（strict）",
  );
  assert.equal(
    sharedContextRefSchema.safeParse({ kind: "shared_context", context_id: "a" }).success,
    false,
    "kind 必须是字面量",
  );
});

test("B22 附件引用：previewRef 可缺席、bytes 任意数值、未知键拒绝", () => {
  const base = { ref: "att://1", fileName: "a.png", mime: "image/png", bytes: 0 };
  const parsed = attachmentRefSchema.safeParse(base);
  assert.equal(parsed.success, true);
  assert.equal("previewRef" in parsed.data, false, "previewRef 缺席时不出现在结果里");
  assert.equal(
    attachmentRefSchema.safeParse({ ...base, bytes: -1 }).success,
    true,
    "bytes 只承载展示信息",
  );
  assert.equal(
    attachmentRefSchema.safeParse({ ...base, previewRef: "att://p" }).success,
    true,
    "previewRef 在场时接受",
  );
  assert.equal(attachmentRefSchema.safeParse({ ...base, extra: 1 }).success, false, "未知键拒绝");
  assert.equal(
    attachmentRefSchema.safeParse({ ...base, fileName: undefined }).success,
    false,
    "fileName 必填",
  );
});

test("B23 稳定 fork 目标：boundary 必须是 orderedMessageIds 的最后一项", () => {
  const base = {
    productTurnId: "pt-1",
    transcriptTurnId: "tt-1",
    orderedMessageIds: ["m1", "m2", "m3"],
    boundaryMessageId: "m3",
  };
  assert.equal(stableForkTargetSchema.safeParse(base).success, true);
  const broken = stableForkTargetSchema.safeParse({ ...base, boundaryMessageId: "m2" });
  assert.equal(broken.success, false);
  const issue = broken.error.issues.find((item) => item.path.join(".") === "boundaryMessageId");
  assert.ok(issue, "issue 落在 boundaryMessageId 上");
  assert.equal(issue.message, "boundaryMessageId must be the final orderedMessageId");
  assert.equal(
    stableForkTargetSchema.safeParse({ ...base, orderedMessageIds: [] }).success,
    false,
    "orderedMessageIds 至少 1 项",
  );
  assert.equal(stableForkTargetSchema.safeParse({ ...base, productTurnId: "" }).success, false);
  assert.equal(stableForkTargetSchema.safeParse({ ...base, extra: 1 }).success, false, "strict");
});

function validIntent() {
  return {
    sourceCommandId: "cmd-1",
    queueItemId: "qi-1",
    clientId: "client-1",
    kind: "sendText",
    text: "hello",
    delivery: { requested: "auto", admitted: "startNow" },
    order: { admissionSeq: 0 },
    steer: { state: "notRequested" },
    dispatch: { state: "admitted" },
    admittedAt: 1_700_000_000_000,
  };
}

test("B24 输入意图：必填面、缺省补 [] 与三态 delivery/order/steer/dispatch 枚举", () => {
  const schema = protocolV4.conversationInputIntentSchema;
  const parsed = schema.safeParse(validIntent());
  assert.equal(parsed.success, true, "最小合法意图");
  assert.deepEqual(parsed.data.attachments, [], "attachments 缺席时补 []");
  assert.equal(schema.safeParse({ ...validIntent(), kind: "chat" }).success, false, "kind 封闭");
  assert.equal(
    schema.safeParse({
      ...validIntent(),
      delivery: { requested: "startNow", admitted: "startNow" },
    }).success,
    true,
    "requested 允许 startNow",
  );
  assert.equal(
    schema.safeParse({ ...validIntent(), delivery: { requested: "auto", admitted: "auto" } })
      .success,
    false,
    "admitted 不含 auto",
  );
  assert.equal(
    schema.safeParse({
      ...validIntent(),
      delivery: { requested: "auto", admitted: "startNow", extra: 1 },
    }).success,
    false,
    "delivery strict",
  );
  assert.equal(schema.safeParse({ ...validIntent(), order: { admissionSeq: -1 } }).success, false);
  assert.equal(schema.safeParse({ ...validIntent(), order: { admissionSeq: 1.5 } }).success, false);
  assert.equal(schema.safeParse({ ...validIntent(), steer: { state: "nope" } }).success, false);
  assert.equal(schema.safeParse({ ...validIntent(), dispatch: { state: "nope" } }).success, false);
  assert.equal(
    schema.safeParse({ ...validIntent(), sourceCommandId: "" }).success,
    false,
    "空串拒绝",
  );
  assert.equal(schema.safeParse({ ...validIntent(), queueItemId: "" }).success, false);
  assert.equal(schema.safeParse({ ...validIntent(), clientId: "" }).success, false);
  assert.equal(
    schema.safeParse({ ...validIntent(), admittedAt: "1700000000000" }).success,
    false,
    "时间戳必须是数值",
  );
  assert.equal(
    schema.safeParse({ ...validIntent(), mode: "auto" }).success,
    false,
    "auto 不进意图",
  );
  assert.equal(schema.safeParse({ ...validIntent(), mode: "yolo" }).success, true);
  assert.equal(schema.safeParse({ ...validIntent(), extra: 1 }).success, false, "strict");
  const withRefs = {
    ...validIntent(),
    sharedContextRefs: [{ kind: "shared_context_import", context_id: "ctx" }],
  };
  assert.equal(schema.safeParse(withRefs).success, true, "sharedContextRefs 最多 1 项");
  assert.equal(
    schema.safeParse({
      ...withRefs,
      sharedContextRefs: [
        ...withRefs.sharedContextRefs,
        { kind: "shared_context_import", context_id: "ctx2" },
      ],
    }).success,
    false,
    "2 项拒绝",
  );
  assert.equal(
    schema.safeParse({
      ...validIntent(),
      provenance: { sourceCommandId: "", queueItemId: "qi-1" },
    }).success,
    false,
    "provenance.sourceCommandId 空串拒绝",
  );
  assert.equal(
    schema.safeParse({
      ...validIntent(),
      attachments: [{ ref: "att://1", fileName: "a.png", mime: "image/png", bytes: 1 }],
    }).success,
    true,
    "附件数组元素按 attachmentRefSchema 校验",
  );
});

test("B25 会话配置状态：thoughtLevels/mode 默认值（旧快照兼容）与 modelTransition 形态", () => {
  const schema = protocolV4.sessionConfigStateSchema;
  const parsed = schema.safeParse({
    provider: "p",
    model: "m",
    thought: "t",
    followupMode: "queue",
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.thoughtLevels, [], "thoughtLevels 缺席补 []");
  assert.equal(parsed.data.mode, "build", "mode 缺席补 build");
  assert.equal(
    schema.safeParse({ provider: "p", model: "m", thought: "t", followupMode: "push" }).success,
    false,
    "followupMode 封闭",
  );
  assert.equal(
    schema.safeParse({
      provider: "p",
      model: "m",
      thought: "t",
      followupMode: "queue",
      permissionGrant: { interactionId: "" },
    }).success,
    false,
    "permissionGrant.interactionId 空串拒绝",
  );
  const withUnknown = schema.safeParse({
    provider: "p",
    model: "m",
    thought: "t",
    followupMode: "queue",
    unexpectedKey: 1,
  });
  assert.equal(withUnknown.success, true, "该对象非 strict：未知键不报错");
  assert.equal("unexpectedKey" in withUnknown.data, false, "未知键被剥离");

  const transition = protocolV4.sessionModelTransitionSchema;
  const valid = {
    eventId: "e-1",
    origin: "registryFallback",
    from: { provider: "a", model: "x" },
    to: { provider: "b", model: "y" },
  };
  assert.equal(transition.safeParse(valid).success, true);
  assert.equal(
    transition.safeParse({ ...valid, origin: "user" }).success,
    false,
    "origin 是字面量",
  );
  assert.equal(
    transition.safeParse({ ...valid, to: { provider: "b" } }).success,
    false,
    "to 必须成对",
  );
});

test("B26 共享上下文导入状态：v2 的 canonical /cn/share/<code> URL 与 legacy 形态", () => {
  const schema = protocolV4.sharedContextImportStateSchema;
  const v2 = {
    contextId: "ctx-1",
    title: "T",
    shareUrl: "https://example.com/cn/share/abc123",
    status: "pending",
  };
  const parsed = schema.safeParse(v2);
  assert.equal(parsed.success, true, "v2 形态");
  assert.equal(schema.safeParse({ ...v2, status: "attached" }).success, true);
  assert.equal(schema.safeParse({ ...v2, status: "done" }).success, false, "status 封闭");
  assert.equal(
    schema.safeParse({ ...v2, shareUrl: "https://example.com/cn/share/abc?x=1" }).success,
    false,
    "query 拒绝",
  );
  assert.equal(
    schema.safeParse({ ...v2, shareUrl: "https://example.com/cn/share/abc#h" }).success,
    false,
    "hash 拒绝",
  );
  assert.equal(
    schema.safeParse({ ...v2, shareUrl: "https://example.com/share/abc" }).success,
    false,
    "英文站路径拒绝",
  );
  assert.equal(
    schema.safeParse({ ...v2, shareUrl: "https://example.com/cn/share/" }).success,
    false,
    "空 code 拒绝",
  );
  assert.equal(
    schema.safeParse({ ...v2, shareUrl: "ftp://example.com/cn/share/abc" }).success,
    false,
    "非 http(s) 拒绝",
  );
  assert.equal(schema.safeParse({ ...v2, extra: 1 }).success, false, "v2 strict");
  assert.equal(schema.safeParse({ title: "legacy" }).success, true, "legacy 形态只含 title");
  assert.equal(schema.safeParse({ title: "  " }).success, false, "legacy title trim 后非空");
  assert.equal(schema.safeParse({ title: "t", contextId: "c" }).success, false, "legacy strict");
});

test("B27 CUA 权限状态：strict 形态与需求推导判定表", () => {
  const status = {
    schemaVersion: 1,
    platform: "darwin",
    grantOwner: "owner",
    accessibility: "granted",
    screenRecording: "granted",
  };
  const schema = protocolV4.cuaRequestAccessStatusSchema;
  assert.equal(schema.safeParse(status).success, true);
  assert.equal(
    schema.safeParse({ ...status, schemaVersion: 2 }).success,
    false,
    "schemaVersion 是字面量 1",
  );
  assert.equal(
    schema.safeParse({ ...status, platform: "win32" }).success,
    false,
    "platform 是字面量 darwin",
  );
  assert.equal(schema.safeParse({ ...status, accessibility: "unknown" }).success, false);
  assert.equal(schema.safeParse({ ...status, screenRecording: "stale" }).success, false);
  assert.equal(schema.safeParse({ ...status, extra: 1 }).success, false, "strict");

  const required = protocolV4.requiredCuaPermissionsForRequestAccessStatus;
  assert.deepEqual(required({ ...status }), [], "全 granted 不需要任何权限");
  assert.deepEqual(
    required({ ...status, accessibility: "stale" }),
    ["accessibility"],
    "stale 视同需要授权",
  );
  assert.deepEqual(required({ ...status, accessibility: "denied" }), ["accessibility"]);
  assert.deepEqual(
    required({ ...status, accessibility: "denied", screenRecording: "denied" }),
    ["accessibility", "screen_recording"],
    "顺序固定：accessibility 在前",
  );
  assert.deepEqual(
    required({ ...status, screenRecording: "unknown" }),
    [],
    "screenRecording=unknown 不要求权限",
  );

  const observation = protocolV4.cuaPermissionObservationSchema;
  const valid = {
    schemaVersion: 1,
    eventId: "ev-1",
    eventSeq: 0,
    occurredAt: 1_700_000_000_000,
    sessionId: "s-1",
    toolCallId: "tc-1",
    permissionStatus: status,
  };
  assert.equal(observation.safeParse(valid).success, true);
  assert.equal(
    observation.safeParse({ ...valid, turnId: "turn-1" }).success,
    true,
    "turnId 可缺席",
  );
  assert.equal(observation.safeParse({ ...valid, eventSeq: -1 }).success, false);
  assert.equal(observation.safeParse({ ...valid, eventId: "" }).success, false);
  assert.equal(observation.safeParse({ ...valid, extra: 1 }).success, false, "strict");
});

const turnHeaderRow = {
  rowId: 1,
  turnId: "turn-1",
  createdAt: 1_700_000_000_000,
  createdAtSeq: 1,
  kind: "turnHeader",
  origin: "userInput",
  state: "running",
  startedAt: 1_700_000_000_000,
};

test("B28 会话增量：五个 op 的封闭集合与各自必备字段", () => {
  const schema = protocolV4.conversationDeltaSchema;
  const cases = [
    { op: "row.appended", row: turnHeaderRow },
    { op: "row.upserted", row: turnHeaderRow },
    { op: "row.removed", fromRowId: 3 },
    { op: "row.delta", rowId: 1, path: "text", append: "more" },
    { op: "state.updated", patch: { revision: 2 } },
  ];
  for (const delta of cases) {
    assert.equal(schema.safeParse(delta).success, true, delta.op);
  }
  assert.equal(
    schema.safeParse({ op: "row.inserted", row: turnHeaderRow }).success,
    false,
    "没有 row.inserted",
  );
  assert.equal(
    schema.safeParse({ op: "row.moved", rowId: 1, to: 2 }).success,
    false,
    "没有 row.moved",
  );
  assert.equal(
    schema.safeParse({ op: "row.delta", rowId: 1, append: "x" }).success,
    false,
    "缺 path",
  );
  assert.equal(
    schema.safeParse({ op: "row.delta", rowId: 1, path: "input", append: "x" }).success,
    false,
    "path 封闭",
  );
  assert.equal(schema.safeParse({ op: "row.upserted" }).success, false, "缺 row");
  assert.equal(schema.safeParse({ op: "state.updated" }).success, false, "缺 patch");
  assert.equal(
    schema.safeParse({ op: "row.patched", rowId: 1, field: "text" }).success,
    false,
    "没有字段级 patch",
  );
});

const STATE_PATCH_KEYS = [
  "availability",
  "backgroundWorks",
  "config",
  "control",
  "goal",
  "inputRouting",
  "meta",
  "modelTransition",
  "pendingCommands",
  "pendingInteractions",
  "plan",
  "queue",
  "revision",
  "sharedContextImport",
  "subagents",
  "usage",
  "workflowRuns",
  "workspaceHookAdmission",
];

test("B29 状态补丁：键集合封闭（18 键）、未知键被剥离、解析结果按键原样带入", () => {
  const schema = protocolV4.statePatchSchema;
  assert.deepEqual(Object.keys(schema.shape).sort(), STATE_PATCH_KEYS, "键集合是契约");
  assert.equal(schema.safeParse({ revision: 2 }).success, true);
  const withUnknown = schema.safeParse({ revision: 2, nonsense: 1 });
  assert.equal(withUnknown.success, true, "该对象非 strict：未知键不报错（以旧实现为准）");
  assert.equal("nonsense" in withUnknown.data, false, "未知键被剥离，进不了 patch");
  assert.equal(
    schema.safeParse({ revision: -1 }).success,
    true,
    "patch 的 revision 是任意数值（不做非负/整数校验，以旧实现为准）",
  );
  const configPatch = schema.safeParse({
    config: { provider: "p", model: "m", thought: "t", followupMode: "guide" },
  });
  assert.equal(configPatch.success, true);
  assert.deepEqual(configPatch.data.config.thoughtLevels, [], "键内仍按 schema 自己的默认值解析");
  assert.equal(configPatch.data.config.followupMode, "guide", "提供的值整块保留（键级整体替换）");
  assert.deepEqual(Object.keys(configPatch.data), ["config"], "缺省键不出现");
});

test("B30 交付档案过滤：等长拷贝、按 streamPaths 过滤 row.delta、顺序与入参不变", () => {
  const rows = [
    turnHeaderRow,
    {
      ...turnHeaderRow,
      rowId: 2,
      kind: "timelineMarker",
      marker: { type: "goalSet", objective: "o" },
    },
  ];
  const rowsSnapshot = JSON.parse(JSON.stringify(rows));
  const filtered = protocolV4.filterConversationRowsForProfile(
    rows,
    protocolV4.DELIVERY_PROFILES.replayable,
  );
  assert.equal(filtered.length, rows.length, "当前没有 profile 专属行：等长");
  assert.deepEqual(filtered, rows, "逐元素拷贝");
  assert.notEqual(filtered, rows, "返回新数组");
  assert.deepEqual(rows, rowsSnapshot, "不修改入参");

  const deltas = [
    { op: "row.delta", rowId: 1, path: "inputText", append: "draft" },
    { op: "row.delta", rowId: 2, path: "text", append: "chunk" },
    { op: "row.upserted", row: turnHeaderRow },
    { op: "row.removed", fromRowId: 9 },
  ];
  const deltasSnapshot = JSON.parse(JSON.stringify(deltas));
  const replayable = protocolV4.filterConversationDeltasForProfile(
    deltas,
    protocolV4.DELIVERY_PROFILES.replayable,
  );
  assert.deepEqual(
    replayable.map((delta) => delta.op),
    ["row.delta", "row.upserted", "row.removed"],
    "replayable 过滤掉 inputText 流式追加，其余保持权威日志序",
  );
  assert.equal(replayable[0].path, "text", "replayable 只放行 text 流");
  const continuous = protocolV4.filterConversationDeltasForProfile(
    deltas,
    protocolV4.DELIVERY_PROFILES.continuous,
  );
  assert.deepEqual(
    continuous.map((delta) => delta.op),
    ["row.delta", "row.delta", "row.upserted", "row.removed"],
    "continuous 放行全部流式路径",
  );
  assert.deepEqual(deltas, deltasSnapshot, "不修改入参");
  assert.notEqual(continuous, deltas, "返回新数组");
});
