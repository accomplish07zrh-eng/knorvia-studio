// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B17/B18：压缩链在位，且阈值与旧内核口径同值。
//
// B18 的断言对象是「由组合 config 推导出的有效压力阈值」。DSH 的水位公式是
// min(窗口 × 占比, 窗口 − 输出预留 − 余量)，因此只核对字段名没有意义——
// 这里用公开导出按 DSH 的公式重算，并与旧内核的「有效窗口 − 缓冲」对齐。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment } from "./_harness.mjs";

/** 旧内核口径的三个事实数，直接取自 interface.md §六。 */
const LEGACY_THRESHOLD = 166_000;
const LEGACY_WINDOW = 200_000;

/**
 * 起内核并把回调交给它；退出时释放内核与临时目录。
 *
 * @param callback - 收到 `{ ctx, kernel, host }` 的回调。
 * @returns 回调的返回值。
 */
async function withKernel(callback) {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-compaction-"));
  const workspace = join(root, "ws");
  let host;
  try {
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: isolatedEnvironment({ KNORVIA_DATA_BASE_DIR: join(root, "base") }),
      logger: QUIET_LOGGER,
    });
    return await callback({ ctx: host.context, kernel, host });
  } finally {
    try {
      await host?.dispose();
    } catch {
      // 释放失败由 kernel-dsh-00 的用例负责；这里只做清理。
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("B17 压缩链四段都在位：计量、自动压缩、工具结果裁剪、/compact", async () => {
  await withKernel(async ({ ctx }) => {
    assert.ok(ctx.get("tokenMeter"), "B17 必须挂 dsh-token-meter（ctx.tokenMeter）");
    assert.ok(ctx.get("compaction"), "B17 必须挂 dsh-compaction-basic（ctx.compaction）");
    assert.ok(
      ctx.get("toolResultPruner"),
      "B17 必须挂 dsh-compaction-tool-result-pruner（ctx.toolResultPruner）",
    );
    const commands = await ctx.get("commands").list();
    const names = commands.map((command) => command.name);
    assert.ok(names.includes("compact"), `B17 /compact 必须已注册；实际=${names.join(",")}`);
  });
});

test("B17 工具结果裁剪的预算来自组合配置", async () => {
  await withKernel(async ({ ctx }) => {
    const config = ctx.get("toolResultPruner").config;
    assert.equal(config.thresholdChars, 8_192, "B17 裁剪阈值必须是旧内核口径的 8192 字符");
    assert.equal(config.headChars, 4_096, "B17 保留头部 4096 字符");
    assert.equal(config.tailChars, 1_024, "B17 保留尾部 1024 字符");
    // 头部 + 尾部必须仍然小于阈值，否则裁剪不会真正缩短内容。
    assert.ok(
      config.headChars + config.tailChars < config.thresholdChars,
      "B17 头尾保留量之和必须小于裁剪阈值",
    );
  });
});

test("B17 自动压缩处于开启状态且重试预算就位", async () => {
  await withKernel(async ({ ctx }) => {
    const config = ctx.get("compaction").config;
    assert.equal(config.auto, true, "B17 自动压缩必须开启（旧内核有自动压缩）");
    assert.ok(config.compactionRetries >= 1, "B17 压缩失败后必须允许重试");
    assert.ok(config.maxOverflowRetries >= 1, "B17 溢出必须允许重试");
  });
});

test("B18 由组合 config 推导的压力阈值等于旧内核的 166000", async () => {
  const kernel = await loadKernel();
  const config = kernel.KERNEL_COMPRESSION_CONFIG;
  // 按 DSH 自己的公式重算：min(窗口 × 占比, 窗口 − 输出预留 − 余量)。
  const derived = kernel.pressureThresholdFor(config, LEGACY_WINDOW);
  assert.equal(
    derived,
    LEGACY_THRESHOLD,
    `B18 推导阈值必须等于 ${LEGACY_THRESHOLD}；实际=${derived}`,
  );
  assert.equal(
    kernel.KERNEL_AUTO_COMPACT_THRESHOLD,
    LEGACY_THRESHOLD,
    "B18 常量本身也必须等于旧内核阈值",
  );
});

test("B18 预算链逐节点与旧内核一致：有效窗口 179000、缓冲 13000、阈值 166000", async () => {
  const kernel = await loadKernel();
  const chain = kernel.legacyBudgetChain(
    kernel.LEGACY_CONTEXT_WINDOW,
    kernel.LEGACY_OUTPUT_RESERVE_REQUEST,
    kernel.LEGACY_BUFFER_TOKENS,
  );
  assert.deepEqual(
    chain.map((entry) => [entry.name, entry.tokens]),
    [
      ["effectiveWindow", 179_000],
      ["buffer", 13_000],
      ["autoCompactThreshold", 166_000],
    ],
    "B18 预算链必须与旧内核公式逐节点一致",
  );
  // 组合 config 里的三个旋钮必须能反推回同一条链：输出预留 = 窗口 − 有效窗口，
  // 余量 = 缓冲。
  const config = kernel.KERNEL_COMPRESSION_CONFIG;
  assert.equal(
    kernel.LEGACY_CONTEXT_WINDOW - config.maxTokens,
    179_000,
    "B18 输出预留必须等于旧内核「预留请求压到上限」后的 21000",
  );
  assert.equal(config.headroomTokens, 13_000, "B18 余量必须等于旧内核缓冲");
});

test("B18 三组窗口的等价关系（防 DSH 升级后口径漂移）", async () => {
  const kernel = await loadKernel();
  const config = kernel.KERNEL_COMPRESSION_CONFIG;

  // 大窗口：合同点名的 166000，且必须等于旧内核公式的结果。
  assert.equal(kernel.pressureThresholdFor(config, 200_000), 166_000);
  // 中等窗口：100000 − 21000 − 13000 = 66000，两侧仍同值。
  assert.equal(kernel.pressureThresholdFor(config, 100_000), 66_000);
  // 90000 与 40000 两个中间档把「随窗口线性下移」锁死：只锁一个点可能两边
  // 同时改公式而仍然相等。
  for (const windowSize of [90_000, 64_000, 40_000]) {
    const derived = kernel.pressureThresholdFor(config, windowSize);
    const legacy = kernel.legacyAutoCompactThreshold(
      windowSize,
      kernel.LEGACY_OUTPUT_RESERVE_REQUEST,
      kernel.LEGACY_BUFFER_TOKENS,
    );
    assert.equal(
      derived,
      legacy,
      `B18 窗口 ${windowSize} 下两侧必须同值：DSH=${derived}、旧内核=${legacy}`,
    );
    assert.equal(
      derived,
      windowSize - config.maxTokens - config.headroomTokens,
      `B18 窗口 ${windowSize} 的推导必须落在「窗口 − 预留 − 余量」上`,
    );
  }
});

test("B18 小窗口：旧内核夹到 0，DSH 拒绝加载——必须由 modelPolicies 覆盖（D4b）", async () => {
  const kernel = await loadKernel();
  const config = kernel.KERNEL_COMPRESSION_CONFIG;

  // 小窗口 = 容不下「输出预留 + 余量」。32000 是典型的小窗口模型。
  const smallWindow = 32_000;
  // 旧内核的公式两侧都能算，但它把结果夹到 0，语义是「永不自动压缩」。
  assert.equal(
    kernel.legacyAutoCompactThreshold(
      smallWindow,
      kernel.LEGACY_OUTPUT_RESERVE_REQUEST,
      kernel.LEGACY_BUFFER_TOKENS,
    ),
    0,
    "B18 旧内核在小窗口下把阈值夹到 0",
  );
  // DSH 在同样的窗口下拒绝这个配置；本包用同一个判据在 boot 之前就报出来。
  assert.throws(
    () => kernel.pressureThresholdFor(config, smallWindow),
    (error) => error instanceof kernel.CompressionWindowError,
    "B18 小窗口必须抛 CompressionWindowError（对应 DSH 的 TargetPressureConfigError）",
  );
  // 阈值恰为 0 的边界窗口同样必须拒绝：0 水位不可用。
  assert.throws(
    () => kernel.pressureThresholdFor(config, config.maxTokens + config.headroomTokens),
    (error) => error instanceof kernel.CompressionWindowError,
    "B18 压力预算恰为 0 时必须拒绝",
  );
  // 最小可用窗口是「预留 + 余量 + 1」，它必须刚好可用、再小 1 就必须拒绝。
  const minimum = kernel.minimumUsableWindow(config);
  assert.equal(
    minimum,
    config.maxTokens + config.headroomTokens + 1,
    "B18 最小可用窗口 = 输出预留 + 余量 + 1",
  );
  assert.equal(kernel.pressureThresholdFor(config, minimum), 1, "B18 最小可用窗口下的水位必须是 1");
  assert.throws(
    () => kernel.pressureThresholdFor(config, minimum - 1),
    (error) => error instanceof kernel.CompressionWindowError,
    "B18 比最小可用窗口小 1 就必须拒绝",
  );
  // 覆盖后的值走同一条公式：这就是 modelPolicies 要填的数。
  const override = { ...config, maxTokens: 4_000, headroomTokens: 2_000 };
  assert.equal(
    kernel.pressureThresholdFor(override, smallWindow),
    smallWindow - 4_000 - 2_000,
    "B18 小窗口模型用 modelPolicies 覆盖后必须能算出正水位",
  );
});

test("B18 modelPolicies 留位：空数组即「逐模型填值」的入口", async () => {
  const kernel = await loadKernel();
  const config = kernel.KERNEL_COMPRESSION_CONFIG;
  assert.ok(Array.isArray(config.modelPolicies), "B18 modelPolicies 必须存在");
  assert.equal(
    config.modelPolicies.length,
    0,
    "B18 本包留空：逐模型覆盖归 kernel-plugin-policy 与 kernel-switch 验收",
  );
});
