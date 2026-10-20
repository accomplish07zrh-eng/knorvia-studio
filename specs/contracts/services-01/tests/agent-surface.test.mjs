// SPDX-License-Identifier: Apache-2.0
// A1 agent 契约面（服务接口、descriptor、参数与策略）黑盒契约测试，覆盖 A11–A29：
// descriptor 形态与冻结常量、稳定错误码与守卫、Desktop 呈现面判定、参数族的运行时可见性、
// config id 常量与会话设置投影、automation/off-peak 工具策略、plan 支持探测缓存、
// spawn cwd 选择、浏览器 ambient 只读采集、plugin 引用 catalog 的 -32601 回落。
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { importDeep, repoRoot, services } from "./entry.mjs";
import { runtimeExportNames } from "./exports-ast.mjs";
import { makeTempRoot, writeText } from "./helpers.mjs";

const agent = await importDeep("agent/agent.ts");
const agentErrors = await importDeep("agent/agentErrors.ts");
const presentationSurface = await importDeep("agent/agentPresentationSurface.ts");
const pluginParams = await importDeep("agent/agentPluginParams.ts");
const workflowParams = await importDeep("agent/agentWorkflowParams.ts");
const configOptions = await importDeep("agent/configOptions.ts");
const toolPolicy = await importDeep("agent/automationToolPolicy.ts");
const planSupport = await importDeep("agent/independentPlanSupport.ts");
const spawnCwd = await importDeep("agent/agentSpawnCwd.ts");
const ambient = await importDeep("agent/agentBrowserAmbientContext.ts");
const catalogRequest = await importDeep("agent/pluginReferenceCatalogRequest.ts");

/** 运行时导出账本 oracle：AST 声明的运行时名（星号再导出单独按贡献 0 键处理）。 */
function astRuntimeNames(modulePath) {
  return runtimeExportNames(repoRoot, modulePath)
    .filter((name) => name !== "*")
    .sort();
}

function runtimeKeys(namespace) {
  return Object.keys(namespace)
    .filter((name) => name !== "default")
    .sort();
}

/** 协议 client 桩：真实 KnorviaProtocolClient 用传入 schema 校验响应，桩保持同一时序与校验位置。 */
const rejectWith = (value) => ({ reject: value });

function makeRequestClient(respond) {
  const calls = [];
  return {
    calls,
    async request(method, params, schema) {
      calls.push({ method, params, schema });
      const outcome = respond(calls.length);
      if (outcome && typeof outcome === "object" && "reject" in outcome) {
        throw outcome.reject;
      }
      return schema.parse(outcome);
    },
  };
}

const viewport = { width: 800, height: 600 };
const controlledTab = (tabId, url, extra = {}) => ({
  tabId,
  url,
  title: tabId,
  viewport,
  ...extra,
});
const userTab = (id, url, extra = {}) => ({ id, url, ...extra });

/** 浏览器后端执行桩：记录事件序列，命令结果由 command.method 索引。 */
function makeBrowserExecutor({ list = [], executes = {} }) {
  const events = [];
  return {
    events,
    async list(input) {
      events.push({ kind: "list", input });
      return list;
    },
    async execute(input) {
      events.push({ kind: "execute", method: input.command.method, input });
      const outcome = executes[input.command.method];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? { ok: false, elapsedMs: 0 };
    },
  };
}

const iab = { id: "iab-1", type: "iab", generation: 3 };

describe("A11 IKnorviaAgentService descriptor 形态（agent/agent.ts）", () => {
  it("A11 descriptor 只物化 channelName，且频道名与运行时不可用码是冻结值", () => {
    const descriptor = agent.IKnorviaAgentService;
    assert.deepEqual(Object.keys(descriptor), ["channelName"]);
    // createServiceDescriptor 只保留 channelName；_brand 是 phantom type，不得出现在产物里。
    assert.equal(descriptor._brand, undefined);
    assert.deepEqual({ ...descriptor }, { channelName: "agent" });
    assert.equal(agent.KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE, "KNORVIA_AGENT_RUNTIME_UNAVAILABLE");
    // 根桶与深层模块必须是同一个对象，否则 DI 注册按 descriptor 身份比对会分裂成两个服务。
    assert.equal(services.IKnorviaAgentService, descriptor);
    assert.equal(
      services.KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE,
      agent.KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE,
    );
  });
});

describe("A12 agent.ts 运行时键面（agent/agent.ts）", () => {
  it("A12 运行时导出名与 AST 声明一致，参数族星号再导出贡献 0 个运行时键", () => {
    assert.deepEqual(runtimeKeys(agent), astRuntimeNames("agent/agent.ts"));
    // agent.ts 对两个参数模块做值位 `export *`：参数族是纯类型面，不得往服务兼容面注入新键。
    assert.deepEqual(runtimeKeys(pluginParams), []);
    assert.deepEqual(runtimeKeys(workflowParams), []);
    assert.equal(typeof agent.IKnorviaAgentService.channelName, "string");
    assert.equal(agent.IKnorviaAgentService.channelName, "agent");
  });
});

describe("A13 MCP status-only 能力缺失错误（agent/agentErrors.ts）", () => {
  it("A13 稳定 code 驱动守卫：新实例与 RPC 透传对象命中，仅文案或仅 -32602 不命中", () => {
    const code = agentErrors.KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE;
    assert.equal(code, "KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED");
    const error = new agentErrors.KnorviaAgentMcpStatusModeUnsupportedError();
    assert.ok(error instanceof Error);
    assert.equal(error.name, "KnorviaAgentMcpStatusModeUnsupportedError");
    assert.equal(error.code, code);
    // 无参构造：两次实例化文案逐字相同，UI 才能把它当作稳定标识而不是可变字符串。
    assert.equal(
      new agentErrors.KnorviaAgentMcpStatusModeUnsupportedError().message,
      error.message,
    );
    assert.equal(agentErrors.isKnorviaAgentMcpStatusModeUnsupportedError(error), true);
    assert.equal(agentErrors.isKnorviaAgentMcpStatusModeUnsupportedError({ code }), true);
    const negatives = [
      undefined,
      null,
      "KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED",
      {},
      { code: -32602 },
      { code: "KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_WRONG" },
      { message: error.message },
      { code: null },
    ];
    for (const value of negatives) {
      assert.equal(
        agentErrors.isKnorviaAgentMcpStatusModeUnsupportedError(value),
        false,
        String(value),
      );
    }
    assert.equal(
      services.KnorviaAgentMcpStatusModeUnsupportedError,
      agentErrors.KnorviaAgentMcpStatusModeUnsupportedError,
    );
    assert.equal(
      services.isKnorviaAgentMcpStatusModeUnsupportedError,
      agentErrors.isKnorviaAgentMcpStatusModeUnsupportedError,
    );
  });
});

describe("A14 Desktop 呈现面判定（agent/agentPresentationSurface.ts）", () => {
  it("A14 只有可信 Host 事实给出 desktop，普通 HTTP/manual 装配与显式 false 都保持 terminal", () => {
    const resolve = presentationSurface.resolveKnorviaAgentPresentationSurface;
    assert.equal(resolve({ runtimeSurface: "desktop_local_host" }), "desktop");
    assert.equal(resolve({ serviceAuthorityMode: "desktop-attached-remote" }), "desktop");
    assert.equal(
      resolve({ runtimeSurface: "desktop_local_host", desktopContextPromptEnabled: true }),
      "desktop",
    );
    const terminals = [
      {},
      { runtimeSurface: "remote_workspace_host" },
      { serviceAuthorityMode: "desktop-local" },
      { serviceAuthorityMode: "standalone-server" },
      { desktopContextPromptEnabled: true },
      { runtimeSurface: "desktop_local_host", desktopContextPromptEnabled: false },
      { serviceAuthorityMode: "desktop-attached-remote", desktopContextPromptEnabled: false },
    ];
    for (const facts of terminals) {
      assert.equal(resolve(facts), undefined, JSON.stringify(facts));
    }
    // 未知事实字段不参与判定：不能因为多带一个键就把 terminal 升成 desktop。
    assert.equal(resolve({ runtimeSurface: "desktop_local_host", unknownFact: 1 }), "desktop");
    assert.deepEqual(
      runtimeKeys(presentationSurface),
      astRuntimeNames("agent/agentPresentationSurface.ts"),
    );
  });
});

describe("A15 workspace 目标参数族（agent/agentPluginParams.ts）", () => {
  it("A15 参数族没有运行时面；identity 与 remoteSessionId 只在运行时按存在性透传", async () => {
    assert.deepEqual(runtimeKeys(pluginParams), astRuntimeNames("agent/agentPluginParams.ts"));
    const calls = [];
    const executor = {
      async list(input) {
        calls.push(input);
        return [];
      },
      async execute() {
        return { ok: true, elapsedMs: 0 };
      },
    };
    const base = { sessionId: "s-1", workspacePath: "ws-path" };
    assert.equal(
      await ambient.collectBrowserAmbientContext(executor, {
        ...base,
        workspaceIdentity: "  ws-id  ",
        remoteSessionId: "remote-1",
      }),
      undefined,
    );
    // KnorviaAgentWorkspaceTarget 的唯一运行时物化规则：identity.trim() 优先，空串回落 path。
    assert.equal(calls[0].workspaceKey, "ws-id");
    assert.equal(calls[0].workspaceIdentity, "  ws-id  ");
    assert.equal(calls[0].remoteSessionId, "remote-1");
    assert.equal(calls[0].workspacePath, "ws-path");
    assert.equal(calls[0].sessionId, "s-1");

    assert.equal(await ambient.collectBrowserAmbientContext(executor, base), undefined);
    assert.equal(calls[1].workspaceKey, "ws-path");
    // 缺省字段整体缺键，而不是带 undefined 值上 wire。
    assert.deepEqual(Object.keys(calls[1]).sort(), [
      "clientMode",
      "requestId",
      "sessionContext",
      "sessionId",
      "workspaceKey",
      "workspacePath",
    ]);

    assert.equal(
      await ambient.collectBrowserAmbientContext(executor, { ...base, workspaceIdentity: "   " }),
      undefined,
    );
    // 纯空白 identity 不能被当成有效身份键，否则同一本地 workspace 会裂成两个队列。
    assert.equal(calls[2].workspaceKey, "ws-path");
    // 原值仍按参数族定义逐字透传，由 Host 侧继续做身份路由；只有 workspaceKey 派生用 trim 结果。
    assert.equal(calls[2].workspaceIdentity, "   ");
  });
});

describe("A16 saved-workflow 目标 union（agent/agentWorkflowParams.ts）", () => {
  it("A16 目标 union 是纯类型面，兼容面只能经 agent.ts 的再导出链加载", () => {
    assert.deepEqual(runtimeKeys(workflowParams), astRuntimeNames("agent/agentWorkflowParams.ts"));
    // 五个 workspace 级方法（list/get/updateMeta/delete/runs）+ move 全靠同一 descriptor 承载；
    // 参数模块一旦被拆出兼容面，这条再导出链断在 import 阶段，descriptor 就取不到。
    assert.equal(agent.IKnorviaAgentService.channelName, "agent");
    assert.deepEqual(runtimeKeys(agent), astRuntimeNames("agent/agent.ts"));
    assert.equal(
      "KnorviaAgentSavedWorkflowTarget" in workflowParams,
      false,
      "纯类型别名不得留下运行时键",
    );
  });
});

describe("A17 config id 与会话设置投影（agent/configOptions.ts）", () => {
  it("A17 三个 config id 常量与 settingsToConfigOptions 输出的 id/category 同源", () => {
    assert.deepEqual(runtimeKeys(configOptions), astRuntimeNames("agent/configOptions.ts"));
    assert.equal(configOptions.MODEL_CONFIG_ID, "model");
    assert.equal(configOptions.MODE_CONFIG_ID, "mode");
    assert.equal(configOptions.THOUGHT_LEVEL_CONFIG_ID, "thought_level");
    const settings = {
      model: { current: { providerId: "prov", modelId: "mrl" }, available: [] },
      thoughtLevel: { enabled: false, available: [] },
      mode: { current: "build" },
    };
    const options = configOptions.settingsToConfigOptions(settings);
    assert.deepEqual(
      options.map((option) => option.id),
      [configOptions.MODEL_CONFIG_ID, configOptions.MODE_CONFIG_ID],
    );
    assert.deepEqual(
      options.map((option) => option.category),
      ["model", "mode"],
    );
    assert.deepEqual(
      options.map((option) => option.type),
      ["select", "select"],
    );
    // model 的 currentValue 必须等于同一 formatModelPickerValue 的结果：UI 选中态与 hint 共用一种编码。
    assert.equal(
      options[0].currentValue,
      configOptions.formatModelPickerValue(settings.model.current),
    );
    assert.equal(options[0].currentValue, "prov/mrl");
    assert.equal(options[1].currentValue, "build");

    const withThought = configOptions.settingsToConfigOptions({
      ...settings,
      thoughtLevel: {
        enabled: true,
        current: "medium",
        defaultLevel: "high",
        available: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
        ],
      },
    });
    assert.equal(withThought.length, 3);
    assert.equal(withThought[2].id, configOptions.THOUGHT_LEVEL_CONFIG_ID);
    assert.equal(withThought[2].currentValue, "medium");
    assert.deepEqual(
      withThought[2].options.map((option) => option.value),
      ["low", "medium"],
    );
  });

  it("A17b thought level 缺 current 时按合法默认、首项、空串依次回落", () => {
    const settings = {
      model: { current: undefined, available: [] },
      thoughtLevel: { enabled: true, available: [{ value: "low", label: "Low" }] },
      mode: { current: "plan" },
    };
    const fallbackFirst = configOptions.settingsToConfigOptions({
      ...settings,
      thoughtLevel: { ...settings.thoughtLevel, defaultLevel: "high" },
    });
    // defaultLevel 不在 available 里时不能把它写成 currentValue（旧 Agent 会拒绝未知值）。
    assert.equal(fallbackFirst[2].currentValue, "low");
    const exactDefault = configOptions.settingsToConfigOptions({
      ...settings,
      thoughtLevel: { ...settings.thoughtLevel, defaultLevel: "low" },
    });
    assert.equal(exactDefault[2].currentValue, "low");
    const empty = configOptions.settingsToConfigOptions({
      ...settings,
      thoughtLevel: { enabled: true, available: [] },
    });
    assert.equal(empty[2].currentValue, "");
    // model.current 未绑定是合法恢复状态：投影成空串而不是伪造模型。
    assert.equal(empty[0].currentValue, "");
  });

  it("A17c 模型选项只在 reasoning 自洽时投影深浅字段", () => {
    const options = configOptions.settingsToConfigOptions({
      model: {
        current: { providerId: "prov", modelId: "mrl", options: { reasoningLevel: "high" } },
        available: [
          {
            ref: { providerId: "prov", modelId: "deep" },
            label: "Deep",
            providerLabel: "Prov Label",
            description: "d",
            reasoning: { levels: [{ value: "low", label: "L" }], defaultLevel: "low" },
            properties: {},
          },
          {
            ref: { providerId: "prov", modelId: "bad-default" },
            label: "Bad",
            reasoning: { levels: [{ value: "low", label: "L" }], defaultLevel: "ultra" },
            properties: {},
          },
          { ref: { providerId: "prov", modelId: "flat" }, label: "Flat", properties: {} },
        ],
      },
      thoughtLevel: { enabled: false, available: [] },
      mode: { current: "yolo" },
    });
    assert.equal(options[0].currentValue, "prov/mrl$high");
    const values = options[0].options.map((option) => option.value);
    assert.deepEqual(values, ["prov/deep", "prov/bad-default", "prov/flat"]);
    assert.deepEqual(options[0].options[0].modelThoughtLevels, ["low"]);
    assert.equal(options[0].options[0].modelDefaultThoughtLevel, "low");
    // defaultLevel 不在该模型 levels 内时必须整体缺省，而不是留下 UI 无法选中的值。
    assert.equal("modelDefaultThoughtLevel" in options[0].options[1], false);
    assert.deepEqual(options[0].options[1].modelThoughtLevels, ["low"]);
    assert.equal("modelThoughtLevels" in options[0].options[2], false);
    assert.equal(options[0].options[0].modelProviderName, "Prov Label");
    assert.equal(options[0].options[2].modelProviderName, "prov");
    assert.equal(options[1].currentValue, "yolo");
  });
});

describe("A18 mode 目录事实源（agent/configOptions.ts）", () => {
  it("A18 mode 菜单含 edit 且与 availableModes 同源，未知模式回落 build，返回值是隔离副本", () => {
    const modes = configOptions.getKnorviaAgentAvailableModes();
    assert.deepEqual(
      modes.map((mode) => mode.id),
      ["build", "edit", "plan", "yolo"],
    );
    const settings = {
      model: { current: undefined, available: [] },
      thoughtLevel: { enabled: false, available: [] },
      mode: { current: "edit" },
    };
    const options = configOptions.settingsToConfigOptions(settings);
    assert.deepEqual(
      options[1].options.map((option) => option.value),
      modes.map((mode) => mode.id),
    );
    assert.equal(options[1].currentValue, configOptions.normalizeAvailableKnorviaMode("edit"));
    assert.equal(configOptions.normalizeAvailableKnorviaMode("build"), "build");
    assert.equal(configOptions.normalizeAvailableKnorviaMode("plan"), "plan");
    assert.equal(configOptions.normalizeAvailableKnorviaMode("yolo"), "yolo");
    // auto 是合法 session mode 但不在 UI 菜单里：必须回落 build，不能让选中态显示空值。
    assert.equal(configOptions.normalizeAvailableKnorviaMode("auto"), "build");
    assert.equal(configOptions.normalizeAvailableKnorviaMode("unknown-mode"), "build");
    assert.equal(configOptions.normalizeAvailableKnorviaMode(""), "build");
    assert.equal(configOptions.normalizeAvailableKnorviaMode(undefined), "build");
    // 每次调用返回新副本：调用方就地改菜单不能污染后续会话的呈现。
    const again = configOptions.getKnorviaAgentAvailableModes();
    assert.notEqual(modes[0], again[0]);
    modes[0].id = "tampered";
    assert.equal(again[0].id, "build");
  });
});

describe("A19 模型展示值与 task meta 恢复 hint（agent/configOptions.ts）", () => {
  it("A19 task meta 优先取最近一条真实使用过的模型，缺省才回落 settings.current", () => {
    assert.equal(configOptions.formatModelPickerValue(undefined), "");
    assert.equal(configOptions.formatModelPickerValue({ providerId: "p", modelId: "m" }), "p/m");
    const snapshot = {
      messages: [
        { info: { model: { providerId: "old", modelId: "a" } } },
        {
          info: { model: { providerId: "new", modelId: "b", options: { reasoningLevel: "low" } } },
        },
        { info: {} },
      ],
      settings: { model: { current: { providerId: "stale", modelId: "c" }, available: [] } },
    };
    assert.equal(configOptions.formatTaskMetaModelSelectionFromSnapshot(snapshot), "new/b$low");
    assert.equal(
      configOptions.formatTaskMetaModelSelectionFromSnapshot({
        ...snapshot,
        messages: [{ info: {} }, { info: {} }],
      }),
      "stale/c",
    );
    assert.equal(
      configOptions.formatTaskMetaModelSelectionFromSnapshot({
        messages: [],
        settings: { model: { available: [] } },
      }),
      "",
    );
    // 只往回找第一条带模型的记录，中间缺 model 的消息不能提前终止扫描。
    assert.equal(
      configOptions.formatTaskMetaModelSelectionFromSnapshot({
        messages: [{ info: { model: { providerId: "x", modelId: "y" } } }, { info: {} }],
        settings: { model: { current: { providerId: "z", modelId: "w" }, available: [] } },
      }),
      "x/y",
    );
  });
});

describe("A20 automation 工具策略（agent/automationToolPolicy.ts）", () => {
  it("A20 automation denylist 合并保留调用方条目、去重且不改写输入数组", () => {
    assert.deepEqual(runtimeKeys(toolPolicy), astRuntimeNames("agent/automationToolPolicy.ts"));
    assert.deepEqual(
      [...toolPolicy.AUTOMATION_MUTATION_TOOL_NAMES],
      ["CronCreate", "CronUpdate", "CronDelete"],
    );
    const current = ["Bash", "CronUpdate"];
    const merged = toolPolicy.mergeAutomationMutationToolDenylist(current);
    assert.deepEqual(merged, ["Bash", "CronUpdate", "CronCreate", "CronDelete"]);
    assert.notEqual(merged, current);
    assert.deepEqual(current, ["Bash", "CronUpdate"]);
    assert.equal(new Set(merged).size, merged.length);
    assert.deepEqual(toolPolicy.mergeAutomationMutationToolDenylist(undefined), [
      "CronCreate",
      "CronUpdate",
      "CronDelete",
    ]);
    assert.deepEqual(toolPolicy.mergeAutomationMutationToolDenylist([]), [
      "CronCreate",
      "CronUpdate",
      "CronDelete",
    ]);
    assert.deepEqual(toolPolicy.mergeAutomationMutationToolDenylist(merged), merged);
  });

  it("A21 闲时轮只 deny OffPeakCreate，绝不与 cron 名单互相污染", () => {
    assert.deepEqual([...toolPolicy.OFF_PEAK_MUTATION_TOOL_NAMES], ["OffPeakCreate"]);
    const merged = toolPolicy.mergeOffPeakMutationToolDenylist(["Bash", "OffPeakList"]);
    assert.deepEqual(merged, ["Bash", "OffPeakList", "OffPeakCreate"]);
    for (const name of toolPolicy.AUTOMATION_MUTATION_TOOL_NAMES) {
      assert.equal(merged.includes(name), false, `闲时 denylist 不得包含 ${name}`);
    }
    // 反向不变式：cron automation 轮要放行 OffPeakCreate，混入会让定时派生闲时任务被误 deny。
    const cronMerged = toolPolicy.mergeAutomationMutationToolDenylist(["OffPeakList"]);
    for (const name of toolPolicy.OFF_PEAK_MUTATION_TOOL_NAMES) {
      assert.equal(cronMerged.includes(name), false, `cron denylist 不得包含 ${name}`);
    }
    assert.deepEqual(toolPolicy.mergeOffPeakMutationToolDenylist(undefined), ["OffPeakCreate"]);
  });
});

describe("A22 独立 Plan 支持探测（agent/independentPlanSupport.ts）", () => {
  it("A22 同一 client 只发一次 runtime/capabilities，成功判定与 client 收到的 schema 同源", async () => {
    assert.deepEqual(runtimeKeys(planSupport), astRuntimeNames("agent/independentPlanSupport.ts"));
    const client = makeRequestClient(() => ({ independentPlanState: true }));
    const first = planSupport.ensureIndependentPlanSupport(client);
    const second = planSupport.ensureIndependentPlanSupport(client);
    // 并发调用共享同一 in-flight 探测，不能对同一 CLI 连发两次 capability 查询。
    assert.equal(first, second);
    assert.equal(await first, undefined);
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].method, "runtime/capabilities");
    assert.deepEqual(client.calls[0].params, {});
    const schema = client.calls[0].schema;
    assert.equal(schema.safeParse({ independentPlanState: true }).success, true);
    assert.equal(schema.safeParse({}).success, true);
    assert.equal(schema.safeParse({ independentPlanState: "true" }).success, false);
    assert.equal(schema.safeParse({ independentPlanState: 1 }).success, false);
    // runtime/capabilities schema 不 strict：旧 CLI 多带的字段被剥掉而不是整体失败。
    assert.equal(schema.safeParse({ independentPlanState: true, extra: 1 }).success, true);
    assert.deepEqual(schema.parse({ independentPlanState: true, extra: 1 }), {
      independentPlanState: true,
    });
    assert.deepEqual(schema.parse({}), {});
    await planSupport.ensureIndependentPlanSupport(client);
    assert.equal(client.calls.length, 1);
    // 缓存按 client 对象身份隔离：两个 runtime 必须各自探测。
    const other = makeRequestClient(() => ({ independentPlanState: true }));
    await planSupport.ensureIndependentPlanSupport(other);
    assert.equal(other.calls.length, 1);
  });

  it("A23 执行端未确认 Plan 时拒绝并清缓存，下一次调用重新探测且保留 cause", async () => {
    for (const outcome of [{}, { independentPlanState: false }]) {
      const client = makeRequestClient(() => outcome);
      await assert.rejects(
        () => planSupport.ensureIndependentPlanSupport(client),
        (error) => {
          assert.equal(error.message, "proto.independentPlanUnsupported");
          assert.equal(error.cause.message, "proto.independentPlanUnsupported");
          return true;
        },
      );
      await assert.rejects(() => planSupport.ensureIndependentPlanSupport(client));
      // 失败结果不得被缓存，否则 CLI 升级后同一进程永远认为不支持 Plan。
      assert.equal(client.calls.length, 2);
    }
    const transport = makeRequestClient((attempt) =>
      attempt === 1 ? rejectWith(new Error("transport closed")) : { independentPlanState: true },
    );
    await assert.rejects(
      () => planSupport.ensureIndependentPlanSupport(transport),
      (error) =>
        error.message === "proto.independentPlanUnsupported" &&
        error.cause.message === "transport closed",
    );
    assert.equal(await planSupport.ensureIndependentPlanSupport(transport), undefined);
    assert.equal(transport.calls.length, 2);
    // 成功后重新缓存同一条 promise：连续调用不得触发第三次请求。
    const settled = planSupport.ensureIndependentPlanSupport(transport);
    assert.equal(settled, planSupport.ensureIndependentPlanSupport(transport));
    assert.equal(await settled, undefined);
    assert.equal(transport.calls.length, 2);
  });
});

describe("A24 spawn cwd 选择（agent/agentSpawnCwd.ts）", () => {
  it("A24 只有 requestedCwd 等于 workspacePath 且失效时才换备用目录，探测顺序可观测", async () => {
    assert.deepEqual(runtimeKeys(spawnCwd), astRuntimeNames("agent/agentSpawnCwd.ts"));
    const probed = [];
    const makeProbe =
      (usablePaths, directories = usablePaths) =>
      async (path) => {
        probed.push(path);
        if (!usablePaths.includes(path)) {
          throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" });
        }
        return { isDirectory: () => directories.includes(path) };
      };

    probed.length = 0;
    const ok = await spawnCwd.resolveKnorviaAgentSpawnCwd(
      { requestedCwd: "ws", workspacePath: "ws", spawnFallbackCwd: "fallback" },
      makeProbe(["ws", "fallback"]),
    );
    assert.deepEqual(ok, { cwd: "ws", usedFallback: false, cwdExists: true });
    // 目录可用时不得再探测备用路径：避免每次启动多一次 stat。
    assert.deepEqual(probed, ["ws"]);

    probed.length = 0;
    const fallback = await spawnCwd.resolveKnorviaAgentSpawnCwd(
      { requestedCwd: "ws", workspacePath: "ws", spawnFallbackCwd: "fallback" },
      makeProbe(["fallback"]),
    );
    assert.deepEqual(fallback, { cwd: "fallback", usedFallback: true, cwdExists: true });
    assert.deepEqual(probed, ["ws", "fallback"]);

    probed.length = 0;
    const commandCwd = await spawnCwd.resolveKnorviaAgentSpawnCwd(
      { requestedCwd: "command-cwd", workspacePath: "ws", spawnFallbackCwd: "fallback" },
      makeProbe(["fallback"]),
    );
    // 显式 command.cwd 失效时保留原路径，让正常启动按真实原因报错，而不是静默换目录。
    assert.deepEqual(commandCwd, { cwd: "command-cwd", usedFallback: false, cwdExists: false });
    assert.deepEqual(probed, ["command-cwd"]);

    probed.length = 0;
    const noFallback = await spawnCwd.resolveKnorviaAgentSpawnCwd(
      { requestedCwd: "ws", workspacePath: "ws" },
      makeProbe([]),
    );
    assert.deepEqual(noFallback, { cwd: "ws", usedFallback: false, cwdExists: false });
    assert.deepEqual(probed, ["ws"]);

    probed.length = 0;
    const fileFallback = await spawnCwd.resolveKnorviaAgentSpawnCwd(
      { requestedCwd: "ws", workspacePath: "ws", spawnFallbackCwd: "fallback-file" },
      makeProbe(["ws-nope", "fallback-file"], ["ws-nope"]),
    );
    // 备用路径是文件（ENOTDIR 语义）时同样不算可用目录。
    assert.deepEqual(fileFallback, { cwd: "ws", usedFallback: false, cwdExists: false });
    assert.deepEqual(probed, ["ws", "fallback-file"]);
  });

  it("A25 缺省探测用真实文件系统：目录可用、文件与缺失路径不可用并可回落", async (t) => {
    const root = await makeTempRoot(t);
    const workspace = join(root, "workspace");
    await writeText(join(workspace, "seed.txt"), "x");
    const missing = join(root, "missing-dir");
    const fallback = join(root, "fallback");
    await writeText(join(fallback, "seed.txt"), "x");

    const direct = await spawnCwd.resolveKnorviaAgentSpawnCwd({
      requestedCwd: workspace,
      workspacePath: workspace,
    });
    assert.deepEqual(direct, { cwd: workspace, usedFallback: false, cwdExists: true });

    // 文件路径不是可用 cwd；requestedCwd === workspacePath 时按备用目录接管。
    const filePath = join(workspace, "seed.txt");
    const fromFile = await spawnCwd.resolveKnorviaAgentSpawnCwd({
      requestedCwd: filePath,
      workspacePath: filePath,
      spawnFallbackCwd: fallback,
    });
    assert.deepEqual(fromFile, { cwd: fallback, usedFallback: true, cwdExists: true });

    const fromMissing = await spawnCwd.resolveKnorviaAgentSpawnCwd({
      requestedCwd: missing,
      workspacePath: workspace,
      spawnFallbackCwd: fallback,
    });
    assert.deepEqual(fromMissing, { cwd: missing, usedFallback: false, cwdExists: false });
  });
});

describe("A26 浏览器 ambient 只读采集（agent/agentBrowserAmbientContext.ts）", () => {
  it("A27 无 executor 直接返回 undefined；没有 iab 后端时不执行任何命令", async () => {
    assert.deepEqual(runtimeKeys(ambient), astRuntimeNames("agent/agentBrowserAmbientContext.ts"));
    const target = { sessionId: "s-1", workspacePath: "ws-path" };
    assert.equal(await ambient.collectBrowserAmbientContext(undefined, target), undefined);
    const idle = makeBrowserExecutor({ list: [{ id: "b-1", type: "chrome", generation: 1 }] });
    assert.equal(await ambient.collectBrowserAmbientContext(idle, target), undefined);
    assert.deepEqual(
      idle.events.map((event) => event.kind),
      ["list"],
    );
    assert.equal(idle.events[0].input.sessionContext, "live");
    assert.equal(idle.events[0].input.clientMode, "desktop-continuous");
    // list 抛错也不能阻断真实 prompt：整体降级为 undefined。
    const failing = {
      async list() {
        throw new Error("browser host down");
      },
      async execute() {
        throw new Error("must not run");
      },
    };
    assert.equal(await ambient.collectBrowserAmbientContext(failing, target), undefined);
    assert.equal(
      await ambient.collectBrowserAmbientContext(makeBrowserExecutor({ list: [iab] }), target),
      undefined,
    );
  });

  it("A28 受控与用户 tab 去重计数，currentUrl 按 active→用户首→受控尾取值，单侧失败不影响另一侧", async () => {
    const both = makeBrowserExecutor({
      list: [iab],
      executes: {
        list: {
          ok: true,
          elapsedMs: 1,
          tabs: [
            controlledTab("t1", "https://a/"),
            controlledTab("t2", "https://b/", { active: true }),
          ],
        },
        listUserTabs: { ok: true, elapsedMs: 2, userTabs: [userTab("t1", "https://user/")] },
      },
    });
    const result = await ambient.collectBrowserAmbientContext(both, {
      sessionId: "s-1",
      workspacePath: "ws-path",
      clientMode: "web-remote-replayable",
    });
    assert.deepEqual(result, { tabCount: 2, currentUrl: "https://b/" });
    // 采集顺序：先 list 选后端，再并发两条只读命令；两条命令都必须带 browserId/generation。
    assert.equal(both.events[0].kind, "list");
    assert.deepEqual(
      both.events
        .slice(1)
        .map((event) => event.method)
        .sort(),
      ["list", "listUserTabs"],
    );
    for (const event of both.events) {
      assert.equal(event.input.clientMode, "web-remote-replayable");
      assert.equal(event.input.sessionContext, "live");
    }
    for (const event of both.events.slice(1)) {
      assert.equal(event.input.browserId, "iab-1");
      assert.equal(event.input.browserGeneration, 3);
    }

    const userOnly = makeBrowserExecutor({
      list: [iab],
      executes: {
        listUserTabs: {
          ok: true,
          elapsedMs: 0,
          userTabs: [userTab("u1", "https://u1/"), userTab("u2", "https://u2/")],
        },
      },
    });
    // 受控侧默认失败（漏 finalize 的 handoff 之后 tabs.list() 为空）时，用户 tab 仍进 ambient state。
    assert.deepEqual(
      await ambient.collectBrowserAmbientContext(userOnly, { sessionId: "s", workspacePath: "ws" }),
      {
        tabCount: 2,
        currentUrl: "https://u1/",
      },
    );

    const controlledTail = makeBrowserExecutor({
      list: [iab],
      executes: {
        list: {
          ok: true,
          elapsedMs: 0,
          tabs: [controlledTab("t1", "https://first/"), controlledTab("t2", "https://tail/")],
        },
      },
    });
    assert.deepEqual(
      await ambient.collectBrowserAmbientContext(controlledTail, {
        sessionId: "s",
        workspacePath: "ws",
      }),
      {
        tabCount: 2,
        currentUrl: "https://tail/",
      },
    );

    const rejected = makeBrowserExecutor({
      list: [iab],
      executes: {
        list: { ok: true, elapsedMs: 0, tabs: [controlledTab("t1", "https://a/")] },
        listUserTabs: new Error("user tabs unavailable"),
      },
    });
    assert.deepEqual(
      await ambient.collectBrowserAmbientContext(rejected, { sessionId: "s", workspacePath: "ws" }),
      {
        tabCount: 1,
        currentUrl: "https://a/",
      },
    );

    for (const outcome of [
      { ok: false, elapsedMs: 0 },
      { ok: true, elapsedMs: 0, tabs: [{ tabId: "t1" }] },
      { ok: true, tabs: [controlledTab("t1", "https://a/")] },
    ]) {
      const unusable = makeBrowserExecutor({
        list: [iab],
        executes: { list: outcome, listUserTabs: { ok: true, elapsedMs: 0 } },
      });
      // ok:false、缺必需字段与不合严格 schema 的结果一律按空处理（缺 elapsedMs 也是不合规响应）。
      assert.equal(
        await ambient.collectBrowserAmbientContext(unusable, {
          sessionId: "s",
          workspacePath: "ws",
        }),
        undefined,
      );
    }
  });

  it("A29 URL 净化剥凭据、限协议、丢超长，requestId 每条唯一且 workspaceKey 用 trim 后的 identity", async () => {
    const long = `https://a/${"y".repeat(4100)}`;
    const cases = [
      ["https://user:pass@knorvia.example/path?x=1#f", "https://knorvia.example/path?x=1#f"],
      ["about:blank", "about:blank"],
      ["file:///etc/passwd", undefined],
      ["javascript:alert(1)", undefined],
      ["not a url", undefined],
      [long, undefined],
    ];
    for (const [rawUrl, expected] of cases) {
      const executor = makeBrowserExecutor({
        list: [iab],
        executes: {
          list: { ok: true, elapsedMs: 0, tabs: [controlledTab("t1", rawUrl, { active: true })] },
        },
      });
      const result = await ambient.collectBrowserAmbientContext(executor, {
        sessionId: "s-1",
        workspacePath: "ws-path",
        workspaceIdentity: " ws-id ",
        remoteSessionId: "remote-1",
      });
      if (expected === undefined) {
        // tab 仍然计数，只是不带 currentUrl 键。
        assert.deepEqual(result, { tabCount: 1 }, rawUrl);
      } else {
        assert.equal(result.currentUrl, expected, rawUrl);
      }
      const requestIds = executor.events.map((event) => event.input.requestId);
      assert.equal(new Set(requestIds).size, requestIds.length, rawUrl);
      for (const id of requestIds) {
        assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
      }
      assert.equal(executor.events[0].input.workspaceKey, "ws-id");
      assert.equal(executor.events[0].input.remoteSessionId, "remote-1");
    }
  });
});

describe("A30 plugin 引用 catalog 回落（agent/pluginReferenceCatalogRequest.ts）", () => {
  it("A31 只有 -32601 回落旧入口；其他错误原样抛出且两次共用同一严格 schema", async () => {
    assert.deepEqual(
      runtimeKeys(catalogRequest),
      astRuntimeNames("agent/pluginReferenceCatalogRequest.ts"),
    );
    const catalog = { authority: "session", plugins: [] };
    const params = { workspace: { path: "ws-path" }, sessionId: "s-1" };
    const happy = makeRequestClient(() => catalog);
    const happyResult = await catalogRequest.requestPluginReferenceCatalog(happy, params);
    // 结果按 client 侧严格 schema 的解析输出返回（新对象），不是调用方传入的字面量。
    assert.deepEqual(happyResult, catalog);
    assert.equal(happy.calls.length, 1);
    assert.equal(happy.calls[0].method, "plugins/referenceCatalogWithCategory");
    assert.equal(happy.calls[0].params, params);

    const legacy = makeRequestClient((attempt) =>
      attempt === 1
        ? rejectWith(Object.assign(new Error("Method not found"), { code: -32601 }))
        : { authority: "workspace", plugins: [] },
    );
    const fallbackResult = await catalogRequest.requestPluginReferenceCatalog(legacy, params);
    assert.deepEqual(fallbackResult, { authority: "workspace", plugins: [] });
    assert.deepEqual(
      legacy.calls.map((call) => call.method),
      ["plugins/referenceCatalogWithCategory", "plugins/referenceCatalog"],
    );
    // 回落请求保持同一 params 与同一结果 schema：旧入口不得被放宽成无校验透传。
    assert.equal(legacy.calls[0].schema, legacy.calls[1].schema);
    assert.equal(legacy.calls[1].params, params);
    const schema = legacy.calls[1].schema;
    assert.equal(schema.safeParse({ authority: "workspace", plugins: [] }).success, true);
    assert.equal(schema.safeParse({ authority: "unknown", plugins: [] }).success, false);
    assert.equal(schema.safeParse({ plugins: [] }).success, false);
    assert.equal(
      schema.safeParse({ authority: "workspace", plugins: [], extra: 1 }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        authority: "workspace",
        plugins: [
          {
            pluginId: "p",
            name: "n",
            marketplace: "m",
            enabled: false,
            conflictingPluginIds: [],
            skillQualifiedNames: [],
            mcpServerNames: [],
          },
        ],
      }).success,
      true,
    );

    const other = makeRequestClient(() =>
      rejectWith(Object.assign(new Error("session not found"), { code: -32004 })),
    );
    const thrown = await catalogRequest
      .requestPluginReferenceCatalog(other, params)
      .catch((error) => error);
    assert.equal(thrown.code, -32004);
    // 非 -32601 不能触发回落，否则 session 不存在会被静默降级成 workspace authority。
    assert.equal(other.calls.length, 1);

    for (const value of [
      Object.assign(new Error("legacy"), { code: "-32601" }),
      Object.assign(new Error("no code"), { code: 32601 }),
      new Error("plain"),
      "nope",
      {},
      null,
    ]) {
      const strict = makeRequestClient(() => rejectWith(value));
      const caught = await catalogRequest
        .requestPluginReferenceCatalog(strict, params)
        .catch((error) => error);
      // 抛出值逐字保留（同一对象身份），调用方才能继续按自己的 code 分支处理。
      assert.equal(caught, value);
      assert.equal(strict.calls.length, 1);
    }

    const legacyAlsoFails = makeRequestClient(() =>
      rejectWith(Object.assign(new Error("gone"), { code: -32601 })),
    );
    const final = await catalogRequest
      .requestPluginReferenceCatalog(legacyAlsoFails, params)
      .catch((error) => error);
    assert.equal(final.code, -32601);
    assert.equal(legacyAlsoFails.calls.length, 2);
  });
});
