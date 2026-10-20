// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy 固定请求脚本：合同测试与录制共用同一份，保证两边问的是同一批问题。
//
// outcome 的三档含义（决定断言强度，不决定实现）：
//   "ok"     旧运行时实测成功；两种引擎都必须返回能过共享 schema 的结果。
//   "error"  旧运行时实测以既有协议错误码拒绝；两种引擎都必须给出同一族错误码。
//   "either" 旧运行时成功或以域错误拒绝（取决于本地状态/配置）；只要不是 -32601（未实现）
//            且响应是合法协议消息即可。旧实现在若干域错误上折叠为 -32603，见 behavior.md B7。

export const ABSENT_SESSION_ID = "sess_fixture_absent";
const ABSENT = { sessionId: ABSENT_SESSION_ID };
// 旧运行时把 Hook 摘要当 sha256 十六进制串校验；夹具用全零串，不含任何真实内容。
const FIXTURE_DIGEST = "0".repeat(64);

export function buildLegacyRequestScript(workspacePath) {
  const ws = { workspacePath, workspaceKey: workspacePath };
  const selection = { providerId: "fixture-provider", modelId: "fixture-model" };
  return [
    { method: "runtime/capabilities", params: {}, outcome: "ok" },
    { method: "process/childProcesses", params: {}, outcome: "ok" },
    { method: "workspace/readPresentation", params: { workspace: ws }, outcome: "ok" },
    { method: "session/list", params: { workspace: ws }, outcome: "ok" },

    // 会话只读面：不存在的会话在旧运行时是 -32004「会话未激活」。
    { method: "session/read", params: ABSENT, outcome: "error" },
    { method: "session/messages", params: ABSENT, outcome: "error" },
    { method: "session/events", params: ABSENT, outcome: "error" },
    { method: "session/debug", params: ABSENT, outcome: "either" },
    { method: "session/subagents", params: ABSENT, outcome: "either" },
    { method: "session/usage", params: ABSENT, outcome: "either" },

    // 会话生命周期与回合入口：回合实现由 kernel-bridge-02/03 的执行端口承担。
    { method: "session/create", params: { workspace: ws }, outcome: "ok" },
    { method: "session/resume", params: ABSENT, outcome: "either" },
    {
      method: "session/subscribe",
      params: { ...ABSENT, deliveryKind: "desktop-continuous" },
      outcome: "either",
    },
    { method: "session/send", params: { ...ABSENT, content: "fixture" }, outcome: "either" },
    { method: "session/stop", params: ABSENT, outcome: "either" },
    {
      method: "session/cancelBackgroundTask",
      params: { ...ABSENT, taskId: "task_fixture" },
      outcome: "either",
    },
    { method: "session/fork", params: ABSENT, outcome: "either" },
    { method: "session/compact", params: ABSENT, outcome: "either" },
    { method: "session/goal", params: { ...ABSENT, action: "show" }, outcome: "either" },
    { method: "session/close", params: ABSENT, outcome: "either" },
    { method: "session/setModel", params: { ...ABSENT, model: selection }, outcome: "either" },
    {
      method: "session/setThoughtLevel",
      params: { ...ABSENT, thoughtLevel: "high" },
      outcome: "either",
    },
    { method: "session/setMode", params: { ...ABSENT, mode: "build" }, outcome: "either" },

    // workspace 级策略开关：值是纯内存偏好。
    {
      method: "workspace/updateInteractionPreferences",
      params: { workspace: ws, preferences: { askUserQuestionAutoResolutionEnabled: false } },
      outcome: "either",
    },
    {
      method: "workspace/updateModelIoPreferences",
      params: { workspace: ws, preferences: { fullRetentionEnabled: false } },
      outcome: "either",
    },
    {
      method: "workspace/updateOffPeakToolPolicy",
      params: { workspace: ws, enabled: false },
      outcome: "either",
    },
    {
      method: "workspace/updateDynamicWorkflowPolicy",
      params: { workspace: ws, enabled: false },
      outcome: "either",
    },
    {
      method: "workspace/cancelGenerateText",
      params: { operationId: "op_fixture" },
      outcome: "either",
    },
    {
      method: "workspace/hooks/trustGrant",
      params: {
        workspace: ws,
        bundleDigest: FIXTURE_DIGEST,
        hookDeclarationDigest: FIXTURE_DIGEST,
      },
      outcome: "either",
    },

    // 凭据 / 模型连接性：模型适配归 kernel-plugin-credentials，本包只冻结协议边界。
    {
      method: "provider/updateAccountConfig",
      params: {
        revision: "fixture-revision",
        basedOnKnorviaBuiltinRevision: "0",
        providers: {},
        states: {},
      },
      outcome: "either",
    },
    {
      method: "provider/testModelConnectivity",
      params: { workspace: ws, selection },
      outcome: "either",
    },
    {
      method: "workspace/generateText",
      params: {
        workspace: ws,
        selection,
        prompt: "fixture",
        querySource: "fixture",
        operationId: "op_fixture",
      },
      outcome: "either",
    },

    // MCP / 插件 / 技能 / 工作流目录：目录事实来自本地文件与配置。
    { method: "mcp/list", params: { workspace: ws }, outcome: "either" },
    { method: "plugins/list", params: { workspace: ws }, outcome: "either" },
    { method: "plugins/referenceCatalog", params: { workspace: ws }, outcome: "either" },
    {
      method: "plugins/referenceCatalogWithCategory",
      params: { workspace: ws },
      outcome: "either",
    },
    { method: "skills/referenceCatalog", params: { workspace: ws }, outcome: "either" },
    { method: "plugins/overview", params: { workspace: ws }, outcome: "either" },
    { method: "plugins/cancelOperation", params: { operationId: "op_fixture" }, outcome: "either" },
    {
      method: "plugins/setEnabled",
      params: {
        workspace: ws,
        pluginId: "fixture-plugin",
        enabled: false,
        operationId: "op_fixture",
      },
      outcome: "either",
    },
    {
      method: "plugins/resolveSuggestedReference",
      params: {
        workspace: ws,
        stableId: "fixture-plugin",
        operationId: "op_fixture",
        clientMode: "desktop-continuous",
        deliveryKind: "desktop-continuous",
      },
      outcome: "either",
    },
    {
      method: "plugins/marketplace/add",
      params: { workspace: ws, source: "fixture-marketplace", dryRun: true },
      outcome: "either",
    },
    {
      method: "plugins/marketplace/remove",
      params: { workspace: ws, marketplace: "fixture-marketplace" },
      outcome: "either",
    },
    {
      method: "plugins/marketplace/update",
      params: { workspace: ws, marketplace: "fixture-marketplace" },
      outcome: "either",
    },
    {
      method: "plugins/install",
      params: {
        workspace: ws,
        pluginName: "fixture-plugin",
        marketplace: "fixture-marketplace",
        dryRun: true,
      },
      outcome: "either",
    },
    {
      method: "plugins/uninstall",
      params: { workspace: ws, pluginId: "fixture-plugin" },
      outcome: "either",
    },
    {
      method: "plugins/update",
      params: { workspace: ws, pluginId: "fixture-plugin" },
      outcome: "either",
    },
    {
      method: "plugins/restoreBuiltin",
      params: { workspace: ws, pluginId: "fixture-plugin" },
      outcome: "either",
    },
    {
      method: "plugins/configure",
      params: { workspace: ws, pluginId: "fixture-plugin", options: {}, dryRun: true },
      outcome: "either",
    },
    {
      method: "plugins/resetConfig",
      params: { workspace: ws, pluginId: "fixture-plugin" },
      outcome: "either",
    },
    {
      method: "plugins/validate",
      params: { workspace: ws, pluginName: "fixture-plugin", marketplace: "fixture-marketplace" },
      outcome: "either",
    },
    {
      method: "plugins/describe",
      params: { workspace: ws, pluginName: "fixture-plugin", marketplace: "fixture-marketplace" },
      outcome: "either",
    },

    { method: "workflows/list", params: { workspace: ws }, outcome: "either" },
    {
      method: "workflows/get",
      params: { workspace: ws, name: "fixture-workflow" },
      outcome: "either",
    },
    {
      method: "workflows/updateMeta",
      params: { workspace: ws, name: "fixture-workflow", meta: { description: "fixture" } },
      outcome: "either",
    },
    {
      method: "workflows/delete",
      params: { workspace: ws, name: "fixture-workflow" },
      outcome: "either",
    },
    { method: "workflows/runs", params: { workspace: ws, limit: 5 }, outcome: "either" },
    {
      method: "workflows/move",
      params: { workspace: ws, name: "fixture-workflow" },
      outcome: "either",
    },

    { method: "usage/stats", params: { range: "7d" }, outcome: "either" },
  ];
}

/**
 * Host 反向请求方法：CLI→Host 方向；客户端把它当请求发过来必须回 -32601（方向不可反）。
 * 这 14 个方法不出现在上面的脚本里，由 legacy-methods.test.mjs 的 B8 断言。
 */
export const HOST_DIRECTED_METHODS = [
  "session/requestRuntimePreferences",
  "automation/create",
  "automation/update",
  "automation/checkTaskBinding",
  "automation/list",
  "automation/delete",
  "offPeak/create",
  "offPeak/list",
  "interaction/requestPermission",
  "interaction/requestUserInput",
  "interaction/requestProviderRuntimeHeaders",
  "interaction/requestOfficialMcpAuthHeaders",
  "interaction/browserList",
  "interaction/browserExecute",
];

/** 7 个服务端通知名，外加 1 个借用方法名的 CLI→Host 通知。 */
export const LEGACY_NOTIFICATIONS = [
  "startup/storageState",
  "interaction/providerRuntimeHeadersCancelled",
  "process/mcpTelemetry",
  "process/mcpResourceSamples",
  "process/toolExecResource",
  "plugins/operationProgress",
  "process/resourceSample",
];

export const COMPUTER_USE_NOTIFICATION = "computer-use/operation-event";

/** 74 = 客户端方向 59 + Host 方向 14 + 借名通知 1。 */
export const LEGACY_METHOD_TOTAL = 74;
