// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// kernel-plugin-tools-02 的契约测试（behavior.md B1-B13）。
import assert from "node:assert/strict";
import test from "node:test";

const ENTRY = "../src/kernel-plugin-tools-02/index.ts";

async function loadPlugin() {
  return await import(ENTRY);
}

/** 一条离峰任务摘要。 */
function task(overrides = {}) {
  return {
    taskId: "task-1",
    title: "nightly build",
    windowStart: "22:00",
    windowEnd: "06:00",
    ...overrides,
  };
}

/** 假离峰端口。 */
function makeOffPeakPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    port: {
      async create(input) {
        calls.push({ op: "create", input });
        if (overrides.createOutcome !== undefined) return overrides.createOutcome;
        return { ok: true, task: task() };
      },
      async list() {
        calls.push({ op: "list" });
        return overrides.windows ?? [task()];
      },
    },
  };
}

/** 假计划模式控制器。 */
function makePlanMode(phase, activeBefore = false) {
  const calls = [];
  return {
    calls,
    controller: {
      get() {
        return { active: activeBefore };
      },
      set(_agent, active) {
        calls.push({ active });
        return phase;
      },
    },
  };
}

/** 假会话上下文源。 */
function makeSessionSource(overrides = {}) {
  return {
    async readProjection() {
      return {
        todos: overrides.todos ?? null,
        planModeActive: overrides.planModeActive ?? false,
      };
    },
    async readAdditionalContext() {
      return overrides.additionalContext ?? { workspace: "ws-1" };
    },
  };
}

// ── B1 四个工具的可用集 ────────────────────────────────

test("B1 注册集包含四个工具", async () => {
  const plugin = await loadPlugin();
  const registered = [];
  const ctx = { tools: { register: (d) => registered.push(d.name) } };

  plugin.apply(ctx, {
    getOffPeakPort: () => undefined,
    getSessionContextSource: () => undefined,
    getPlanModeController: () => undefined,
  });

  assert.deepEqual(registered.sort(), [
    "EnterPlanMode",
    "OffPeakCreate",
    "OffPeakList",
    "ReadSessionContext",
  ]);
});

test("B13 不含 TodoRead（由 sessionProjections 承接）", async () => {
  const plugin = await loadPlugin();
  const registered = [];
  plugin.apply(
    { tools: { register: (d) => registered.push(d.name) } },
    {
      getOffPeakPort: () => undefined,
      getSessionContextSource: () => undefined,
      getPlanModeController: () => undefined,
    },
  );
  assert.equal(registered.includes("TodoRead"), false);
});

// ── B2 参数 schema ────────────────────────────────────

test("B2 OffPeakCreate 有窗口字段", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply(
    { tools: { register: (d) => all.push(d) } },
    {
      getOffPeakPort: () => undefined,
      getSessionContextSource: () => undefined,
      getPlanModeController: () => undefined,
    },
  );
  const createTool = all.find((d) => d.name === "OffPeakCreate");
  const keys = Object.keys(createTool.parameters.properties).sort();
  assert.ok(keys.includes("windowStart"));
  assert.ok(keys.includes("windowEnd"));
});

test("B2 其余三个工具无参数", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply(
    { tools: { register: (d) => all.push(d) } },
    {
      getOffPeakPort: () => undefined,
      getSessionContextSource: () => undefined,
      getPlanModeController: () => undefined,
    },
  );
  for (const name of ["OffPeakList", "ReadSessionContext", "EnterPlanMode"]) {
    const definition = all.find((d) => d.name === name);
    assert.deepEqual(Object.keys(definition.parameters.properties ?? {}), [], `${name} 应无参数`);
  }
});

// ── B5 元数据两层 ────────────────────────────────────

test("B5 第一层：四个工具 timeoutMs 都是 30_000 且不可并发", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply(
    { tools: { register: (d) => all.push(d) } },
    {
      getOffPeakPort: () => undefined,
      getSessionContextSource: () => undefined,
      getPlanModeController: () => undefined,
    },
  );
  for (const definition of all) {
    assert.equal(definition.timeoutMs, 30_000, `${definition.name}.timeoutMs`);
    assert.equal(definition.isConcurrencySafe({}), false, `${definition.name} 不应可并发`);
  }
});

test("B5 第二层：能力声明表取值正确", async () => {
  const plugin = await loadPlugin();
  const capabilities = plugin.TOOLS_02_CAPABILITIES;

  // 只读工具
  for (const name of ["OffPeakList", "ReadSessionContext"]) {
    assert.equal(capabilities[name].readOnly, true, `${name}.readOnly`);
    assert.equal(capabilities[name].needsApproval, false, `${name}.needsApproval`);
    assert.equal(capabilities[name].sideEffectScope, "none", `${name}.sideEffectScope`);
    assert.equal(capabilities[name].riskLevel, "low", `${name}.riskLevel`);
  }

  // 写工具
  assert.equal(capabilities.OffPeakCreate.readOnly, false);
  assert.equal(capabilities.OffPeakCreate.needsApproval, true);
  assert.equal(capabilities.OffPeakCreate.sideEffectScope, "workspace");
  assert.equal(capabilities.OffPeakCreate.riskLevel, "medium");

  // 计划模式：只改会话状态（不是工作区）
  assert.equal(capabilities.EnterPlanMode.readOnly, false);
  assert.equal(capabilities.EnterPlanMode.needsApproval, true);
  assert.equal(capabilities.EnterPlanMode.sideEffectScope, "session", "EnterPlanMode 只改会话状态");
  assert.equal(capabilities.EnterPlanMode.riskLevel, "medium");

  // 全部非 destructive
  for (const name of Object.keys(capabilities)) {
    assert.equal(capabilities[name].destructive, false, `${name}.destructive`);
  }
});

// ── B3 离峰闭环 ──────────────────────────────────────

test("B3 创建 → 列出（含）", async () => {
  const plugin = await loadPlugin();
  const { port } = makeOffPeakPort();
  const ctx = { getOffPeakPort: () => port };

  const created = await plugin.executeOffPeakCreate(
    { title: "nightly", windowStart: "22:00", windowEnd: "06:00" },
    ctx,
  );
  assert.ok(created.task);

  const listed = await plugin.executeOffPeakList(ctx);
  assert.ok(listed.windows.length > 0);
});

test("B3 窗口字段缺一半 → 拒绝且端口未调用", async () => {
  const plugin = await loadPlugin();
  const { calls, port } = makeOffPeakPort();
  const ctx = { getOffPeakPort: () => port };

  await assert.rejects(
    () => plugin.executeOffPeakCreate({ title: "x", windowStart: "22:00" }, ctx),
    /must be provided together/u,
  );
  assert.equal(calls.length, 0, "端口不应被调用");
});

test("B3 两对窗口字段各自成对校验", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.windowPairViolations({ startHour: 22 });
  assert.ok(violations.length > 0);
  assert.ok(violations[0].includes("startHour"));
});

test("B3 成对字段都给了 → 通过", async () => {
  const plugin = await loadPlugin();
  assert.deepEqual(plugin.windowPairViolations({ windowStart: "22:00", windowEnd: "06:00" }), []);
  assert.deepEqual(plugin.windowPairViolations({}), []);
});

test("B3 端口返回失败 → 抛错带三件事", async () => {
  const plugin = await loadPlugin();
  const { port } = makeOffPeakPort({
    createOutcome: {
      ok: false,
      failureStage: "ticket_request",
      errorCategory: "quota_3103",
      errorCode: "3103",
    },
  });

  let caught;
  try {
    await plugin.executeOffPeakCreate(
      { windowStart: "22:00", windowEnd: "06:00" },
      { getOffPeakPort: () => port },
    );
  } catch (error) {
    caught = error;
  }

  assert.ok(caught);
  assert.equal(caught.failureStage, "ticket_request");
  assert.equal(caught.errorCategory, "quota_3103");
  assert.equal(caught.errorCode, "3103");
});

// ── B5 EnterPlanMode 四态 ────────────────────────────

test("B5 committed → active: true, changed: true", async () => {
  const plugin = await loadPlugin();
  const { controller } = makePlanMode("committed");

  const result = plugin.executeEnterPlanMode({
    getPlanModeController: () => controller,
    agent: {},
  });
  assert.equal(result.active, true);
  assert.equal(result.changed, true);
  assert.equal(result.phase, "committed");
});

test("B5 queued → active: true, changed: false（尚未生效）", async () => {
  const plugin = await loadPlugin();
  const { controller } = makePlanMode("queued");

  const result = plugin.executeEnterPlanMode({
    getPlanModeController: () => controller,
    agent: {},
  });
  assert.equal(result.active, true);
  assert.equal(result.changed, false, "排队未生效 → changed: false");
  assert.equal(result.phase, "queued");
});

test("B5 cancelled → 抛 PlanModeEnterCancelledError（不得静默成功）", async () => {
  const plugin = await loadPlugin();
  const { controller } = makePlanMode("cancelled");

  let caught;
  try {
    plugin.executeEnterPlanMode({ getPlanModeController: () => controller, agent: {} });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "cancelled 必须抛错");
  assert.equal(caught.name, "PlanModeEnterCancelledError");
  assert.equal(caught.code, "PLAN_MODE_ENTER_CANCELLED");
});

test("B5 noop → active: true, changed: false（已在计划模式）", async () => {
  const plugin = await loadPlugin();
  const { controller } = makePlanMode("noop", true);

  const result = plugin.executeEnterPlanMode({
    getPlanModeController: () => controller,
    agent: {},
  });
  assert.equal(result.active, true);
  assert.equal(result.changed, false);
  assert.equal(result.phase, "noop");
});

test("B5 sessionModeBeforePlan 反映进入前的状态", async () => {
  const plugin = await loadPlugin();

  const beforeFalse = plugin.executeEnterPlanMode({
    getPlanModeController: () => makePlanMode("committed", false).controller,
    agent: {},
  });
  assert.equal(beforeFalse.sessionModeBeforePlan, false);

  const beforeTrue = plugin.executeEnterPlanMode({
    getPlanModeController: () => makePlanMode("noop", true).controller,
    agent: {},
  });
  assert.equal(beforeTrue.sessionModeBeforePlan, true);
});

test("B5 set 被调用时 active 恒为 true", async () => {
  const plugin = await loadPlugin();
  const { calls, controller } = makePlanMode("committed");

  plugin.executeEnterPlanMode({ getPlanModeController: () => controller, agent: {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].active, true);
});

// ── B4 ReadSessionContext ───────────────────────────

test("B4 输出键集合正确", async () => {
  const plugin = await loadPlugin();
  const source = makeSessionSource();

  const result = await plugin.executeReadSessionContext({
    getSessionContextSource: () => source,
    sessionId: "s-1",
  });

  assert.deepEqual(Object.keys(result).sort(), [
    "additionalContext",
    "planModeActive",
    "sessionId",
    "todos",
  ]);
});

test("B4 todos 首次写入前为 null（不是空数组）", async () => {
  const plugin = await loadPlugin();
  const source = makeSessionSource({ todos: null });

  const result = await plugin.executeReadSessionContext({
    getSessionContextSource: () => source,
    sessionId: "s-1",
  });
  assert.equal(result.todos, null, "null 表示首次写入前");
});

test("B4 todos 有内容时原样透传（{content, status}）", async () => {
  const plugin = await loadPlugin();
  const todos = [{ content: "write tests", status: "pending" }];
  const source = makeSessionSource({ todos });

  const result = await plugin.executeReadSessionContext({
    getSessionContextSource: () => source,
    sessionId: "s-1",
  });
  assert.deepEqual(result.todos, todos);
  assert.equal(result.todos[0].content, "write tests");
  assert.equal(result.todos[0].status, "pending");
});

test("B4 planModeActive 透传", async () => {
  const plugin = await loadPlugin();
  const source = makeSessionSource({ planModeActive: true });

  const result = await plugin.executeReadSessionContext({
    getSessionContextSource: () => source,
    sessionId: "s-1",
  });
  assert.equal(result.planModeActive, true);
});

test("B4 additionalContext 透传", async () => {
  const plugin = await loadPlugin();
  const source = makeSessionSource({ additionalContext: { workspace: "ws-9", mode: "build" } });

  const result = await plugin.executeReadSessionContext({
    getSessionContextSource: () => source,
    sessionId: "s-1",
  });
  assert.deepEqual(result.additionalContext, { workspace: "ws-9", mode: "build" });
});

// ── B8 服务缺失明确失败 ──────────────────────────────

test("B8 四个工具在依赖缺失时都抛错", async () => {
  const plugin = await loadPlugin();

  await assert.rejects(
    () => plugin.executeOffPeakCreate({}, { getOffPeakPort: () => undefined }),
    /not available/u,
  );
  await assert.rejects(
    () => plugin.executeOffPeakList({ getOffPeakPort: () => undefined }),
    /not available/u,
  );
  await assert.rejects(
    () =>
      plugin.executeReadSessionContext({
        getSessionContextSource: () => undefined,
        sessionId: "s",
      }),
    /not available/u,
  );
  assert.throws(
    () => plugin.executeEnterPlanMode({ getPlanModeController: () => undefined, agent: {} }),
    /not available/u,
  );
});

// ── B9 自动化轮次 ───────────────────────────────────

test("B9 自动化轮次内 OffPeakCreate 被拒", async () => {
  const plugin = await loadPlugin();
  const { calls, port } = makeOffPeakPort();

  await assert.rejects(
    () =>
      plugin.executeOffPeakCreate(
        { windowStart: "22:00", windowEnd: "06:00" },
        { getOffPeakPort: () => port, automationTurn: true },
      ),
    /automation turn/u,
  );
  assert.equal(calls.length, 0);
});

test("B9 自动化轮次内其余三个工具仍可用", async () => {
  const plugin = await loadPlugin();
  const { port } = makeOffPeakPort();

  // OffPeakList
  const listed = await plugin.executeOffPeakList({
    getOffPeakPort: () => port,
    automationTurn: true,
  });
  assert.ok(listed.windows);

  // ReadSessionContext
  const context = await plugin.executeReadSessionContext({
    getSessionContextSource: () => makeSessionSource(),
    sessionId: "s-1",
  });
  assert.ok(context.sessionId);

  // EnterPlanMode
  const planResult = plugin.executeEnterPlanMode({
    getPlanModeController: () => makePlanMode("committed").controller,
    agent: {},
  });
  assert.equal(planResult.active, true);
});

// ── B7 guidance 互相指向 ────────────────────────────

test("B7 进入说明提到 exit_plan_mode", async () => {
  const plugin = await loadPlugin();
  assert.ok(
    plugin.ENTER_PLAN_MODE_GUIDANCE.includes("exit_plan_mode"),
    "进入说明必须提到 exit_plan_mode",
  );
});

test("B7 退出说明提到 enter_plan_mode 或「进入计划模式」", async () => {
  const plugin = await loadPlugin();
  const text = plugin.EXIT_PLAN_MODE_GUIDANCE;
  assert.ok(text.includes("enter_plan_mode") || text.includes("plan mode"), "退出说明必须指向进入");
});

// ── B10 无 DSH 品牌泄漏 ─────────────────────────────

test("B10 description 与 guidance 不含 DSH 品牌", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply(
    { tools: { register: (d) => all.push(d) } },
    {
      getOffPeakPort: () => undefined,
      getSessionContextSource: () => undefined,
      getPlanModeController: () => undefined,
    },
  );

  const texts = [
    ...all.map((d) => d.description),
    plugin.ENTER_PLAN_MODE_GUIDANCE,
    plugin.EXIT_PLAN_MODE_GUIDANCE,
  ];

  for (const text of texts) {
    assert.equal(/DeepSeek Harness/u.test(text), false, "含 DeepSeek Harness");
    assert.equal(/powered by DeepSeek/u.test(text), false);
    assert.equal(/@deepseek-ai\//u.test(text), false);
  }
});

// ── B11 guidance 覆盖 36 项语义 ──────────────────────

test("B11 进入说明覆盖 7 类触发条件（可识别短语）", async () => {
  const plugin = await loadPlugin();
  const text = plugin.ENTER_PLAN_MODE_GUIDANCE.toLowerCase();

  // 7 类各一个可识别短语
  const phrases = [
    "new capability", // 1 新增功能
    "more than one reasonable approach", // 2 多方案
    "existing behaviour or structure", // 3 改动既有
    "architectural", // 4 架构决策
    "two or three files", // 5 多文件
    "still unclear", // 6 需求不清晰
    "ask the user how", // 7 用户偏好
  ];
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `缺触发条件短语：${phrase}`);
  }
});

test("B11 进入说明覆盖 4 条「何时不用」", async () => {
  const plugin = await loadPlugin();
  const text = plugin.ENTER_PLAN_MODE_GUIDANCE.toLowerCase();

  const phrases = [
    "typo", // 1 单行修复
    "already fully specified", // 2 需求已明确
    "stated exactly what to change", // 3 用户已给具体指令
    "pure investigation", // 4 纯研究
  ];
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `缺反例短语：${phrase}`);
  }
});

test("B11 进入说明覆盖 6 步流程（含搜索/呈现/退出）", async () => {
  const plugin = await loadPlugin();
  const text = plugin.ENTER_PLAN_MODE_GUIDANCE.toLowerCase();

  for (const phrase of [
    "search",
    "patterns",
    "design",
    "present",
    "clarification",
    "exit_plan_mode",
  ]) {
    assert.ok(text.includes(phrase), `缺流程短语：${phrase}`);
  }
});

test("B11 退出说明覆盖 6 种失败模式", async () => {
  const plugin = await loadPlugin();
  const text = plugin.EXIT_PLAN_MODE_GUIDANCE.toLowerCase();

  const modes = [
    "keep planning", // 继续规划
    "dismissed", // 用户取消
    "reloaded", // 服务重载
    "not in plan mode", // 不在计划模式
    "no review channel", // 无通道
    "must begin with", // plan 参数格式（以 # 开头）
  ];
  for (const mode of modes) {
    assert.ok(text.includes(mode), `缺失败模式：${mode}`);
  }
});

test("B11 退出说明说明「成功只有一种结果」", async () => {
  const plugin = await loadPlugin();
  const text = plugin.EXIT_PLAN_MODE_GUIDANCE.toLowerCase();
  assert.ok(
    text.includes("threw") || text.includes("thrown") || text.includes("error"),
    "应说明靠是否抛错判断成功",
  );
});

// ── B12 guidance 无逐字雷同（结构断言）────────────────

test("B12 两份 guidance 是独立常量（不合并）", async () => {
  const plugin = await loadPlugin();
  assert.notEqual(plugin.ENTER_PLAN_MODE_GUIDANCE, plugin.EXIT_PLAN_MODE_GUIDANCE);
  assert.ok(plugin.ENTER_PLAN_MODE_GUIDANCE.length > 500);
  assert.ok(plugin.EXIT_PLAN_MODE_GUIDANCE.length > 300);
});

test("B12 两份 guidance 无大段相同文本", async () => {
  const plugin = await loadPlugin();
  const enterLines = plugin.ENTER_PLAN_MODE_GUIDANCE.split("\n").filter(
    (l) => l.trim().length > 20,
  );
  const exitLines = new Set(
    plugin.EXIT_PLAN_MODE_GUIDANCE.split("\n").filter((l) => l.trim().length > 20),
  );
  const shared = enterLines.filter((line) => exitLines.has(line));
  assert.equal(shared.length, 0, `两份 guidance 不应有相同的长行，实际 ${shared.length} 行`);
});
