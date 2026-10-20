// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B19/B20：目标模式与计划模式在位。
//
// 两个能力都由 DSH 提供，本包只挂载并配置（轮次上限、计划模式的部署文本）。
// 断言走公开服务与公开工具面；计划模式激活后的提示文本要经装配才能观察到。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment } from "./_harness.mjs";

/** 计划模式的部署文本首句；B20 关心的就是「激活后它出现、关闭后它消失」。 */
const PLAN_MODE_BANNER = "You are in plan mode";

/**
 * 一次「为某个 Agent 装配提示」的入参。DSH 的装配上下文由 `scope`（即 Agent 本身）
 * 决定参与哪些 provider；`agent` 字段供需要 Agent 身份的 section 使用。
 *
 * @param agent - 本次装配的目标 Agent。
 * @returns 装配上下文。
 */
function contextFor(agent) {
  return { agent, scope: agent };
}

/**
 * 起内核并把回调交给它；退出时释放内核、探针 Agent 与临时目录。
 *
 * @param callback - 收到 `{ ctx, kernel, agent, workspace, host }` 的回调。
 * @returns 回调的返回值。
 */
async function withKernel(callback) {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-goal-"));
  const workspace = join(root, "ws");
  let host;
  let handle;
  try {
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: isolatedEnvironment({ KNORVIA_DATA_BASE_DIR: join(root, "base") }),
      logger: QUIET_LOGGER,
    });
    handle = await host.context.get("agents").create({
      sessionId: "kernel-builtins-goal-agent",
      meta: { cwd: workspace },
    });
    return await callback({
      ctx: host.context,
      kernel,
      agent: handle.agent,
      workspace,
      host,
    });
  } finally {
    try {
      await handle?.dispose?.();
    } catch {
      // 释放失败不影响本用例的判断。
    }
    try {
      await host?.dispose();
    } catch {
      // 释放失败由 kernel-dsh-00 的用例负责。
    }
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * 读装配结果里的计划模式 section 文本。直接读 section 而不渲染整份 prompt，
 * 是为了让断言只说「部署文本在不在」，不依赖 prompt 的拼接顺序。
 *
 * @param ctx - 内核根 context。
 * @param agent - 本次装配的目标 Agent。
 * @returns 计划模式 section 的文本；不存在或为空时为空串。
 */
async function planSectionText(ctx, agent) {
  const assembly = await ctx.get("systemPrompt").assemble(contextFor(agent));
  const section = assembly.sections.find((entry) => entry.name === "plan:policy");
  return section?.text ?? "";
}

test("B19 目标服务在位，/goal 命令与 goal 工具已注册", async () => {
  await withKernel(async ({ ctx }) => {
    assert.ok(ctx.get("goals"), "B19 必须挂 dsh-goal（ctx.goals）");
    assert.ok(ctx.get("tools").get("create_goal"), "B19 create_goal 工具必须已注册");
    assert.ok(ctx.get("tools").get("get_goal"), "B19 get_goal 工具必须已注册");
    assert.ok(ctx.get("tools").get("update_goal"), "B19 update_goal 工具必须已注册");
    const names = (await ctx.get("commands").list()).map((command) => command.name);
    assert.ok(names.includes("goal"), `B19 /goal 命令必须已注册；实际=${names.join(",")}`);
  });
});

test("B19 轮次上限等于组合配置的 64 轮", async () => {
  await withKernel(async ({ ctx, agent }) => {
    const goal = await ctx.get("goals").create(agent, { objective: "达到一个可验证的目标" });
    assert.ok(typeof goal.id === "string" && goal.id.length > 0, "B19 创建目标必须返回 id");
    assert.equal(
      goal.maxGoalRounds,
      64,
      `B19 轮次上限必须来自组合 config 的 64；实际=${goal.maxGoalRounds}`,
    );
    assert.equal(goal.phase, "active", "B19 新建目标必须处于 active");
    assert.equal(goal.roundsStarted, 0, "B19 新建目标尚未开始回合");
  });
});

test("B19 目标状态由会话日志持有：可读回同一个目标", async () => {
  await withKernel(async ({ ctx, agent }) => {
    const created = await ctx.get("goals").create(agent, { objective: "读回同一个目标" });
    const read = ctx.get("goals").get(agent);
    assert.ok(read, "B19 必须能从会话日志读回目标");
    const current = read.current ?? read;
    assert.equal(current.id, created.id, "B19 读回的必须是同一个目标 id");
    assert.equal(current.objective, created.objective, "B19 读回的目标正文必须一致");
  });
});

test("B20 计划模式服务在位，exit_plan_mode 常驻注册且 plan 投影在", async () => {
  await withKernel(async ({ ctx }) => {
    assert.ok(ctx.get("planMode"), "B20 必须挂 dsh-plan-mode（ctx.planMode）");
    // 未激活时也在，保证请求工具目录稳定（B20 明文）。
    assert.ok(ctx.get("tools").get("exit_plan_mode"), "B20 exit_plan_mode 必须常驻注册");
    assert.ok(
      ctx.get("sessionProjections").registrations.has("plan"),
      "B20 必须注册 plan 投影单元",
    );
  });
});

test("B20 激活计划模式后装配的 prompt 含部署 section 文本", async () => {
  await withKernel(async ({ ctx, agent }) => {
    assert.equal(
      (await planSectionText(ctx, agent)).includes(PLAN_MODE_BANNER),
      false,
      "B20 未激活时不得出现计划模式部署文本",
    );

    const status = ctx.get("planMode").set(agent, true);
    assert.equal(status, "committed", `B20 回合外切换必须立即提交；实际=${status}`);
    assert.deepEqual(ctx.get("planMode").get(agent), { active: true }, "B20 激活状态必须可读");

    const sectionText = await planSectionText(ctx, agent);
    assert.ok(sectionText.includes(PLAN_MODE_BANNER), "B20 激活后必须含部署 section 文本");
    assert.ok(
      sectionText.includes("exit_plan_mode"),
      "B20 部署文本必须指明用 exit_plan_mode 交付计划",
    );
  });
});

test("B20 重复设为同值是 noop，取反可回退", async () => {
  await withKernel(async ({ ctx, agent }) => {
    const planMode = ctx.get("planMode");
    assert.equal(planMode.set(agent, true), "committed");
    assert.equal(planMode.set(agent, true), "noop", "B20 重复设为同值必须是 noop");
    assert.equal(planMode.set(agent, false), "committed", "B20 关闭必须立即提交");
    assert.deepEqual(planMode.get(agent), { active: false }, "B20 关闭后状态必须为未激活");
    assert.equal(
      (await planSectionText(ctx, agent)).includes(PLAN_MODE_BANNER),
      false,
      "B20 关闭后部署文本必须消失",
    );
  });
});
