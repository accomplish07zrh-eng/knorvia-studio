// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 的测试 seam 自检：假 provider 能否注册（B2 的驱动前提）。
//
// 这条用例在**合同阶段即可通过**：它证明「离线确定性驱动回合」这件事在 DSH 公开
// 接口上确实成立（README §八之二）。实现阶段 B2/B11/B12 的帧断言依赖它。
//
// 只经 DSH 公开导出与内核公开入口，不 import DSH 源码、不改 DSH。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { repoRoot } from "./entry.mjs";

/** 内核公开入口（与 kernel-dsh-00/builtins 同一解析规则）。 */
const KERNEL_ENTRY = join(repoRoot, "apps/cli/packages/bootstrap/dist/kernel/index.js");

/** DSH 的公开 LLM 入口；`LlmAdapter` 从这里导出。 */
const DSH_LLM_ENTRY = join(repoRoot, "node_modules/@deepseek-ai/dsh-llm/lib/index.js");

/** 沉默 logger：seam 自检不关心内核日志。 */
const QUIET = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * 造一个只回固定文本的最小假 adapter。
 * `LlmAdapter` 的最小实现面见 README §八之二。
 *
 * @param LlmAdapter - DSH 导出的抽象基类。
 * @param reply - 该 provider 每次产出的固定文本。
 * @returns 可注册的 adapter 实例。
 */
function createFakeAdapter(LlmAdapter, reply) {
  return new (class extends LlmAdapter {
    /** provider 元数据：id 必须等于注册名，name 非空。 */
    providerInfo(provider) {
      return { id: provider, name: "Knorvia Fake Provider" };
    }

    /** 用默认重试策略。 */
    providerRetryPolicy() {
      return undefined;
    }

    /** 不声明图片定价。 */
    imageRequestPricing() {
      return undefined;
    }

    /** 产出固定文本帧。 */
    async *stream() {
      yield { type: "text", text: reply };
    }
  })();
}

test("B2 假 provider 可通过公开 seam 注册，并被 listProviders 列出", async () => {
  const llm = await import(pathToFileURL(DSH_LLM_ENTRY).href);
  assert.equal(
    typeof llm.LlmAdapter,
    "function",
    "@deepseek-ai/dsh-llm 必须导出 LlmAdapter（README §八之二）",
  );

  const kernel = await import(pathToFileURL(KERNEL_ENTRY).href);
  const root = await mkdtemp(join(tmpdir(), "kernel-bridge-02-seam-"));
  const workspace = join(root, "ws");
  let host;
  try {
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: {
        KNORVIA_DATA_BASE_DIR: join(root, "base"),
        HOME: join(root, "home"),
        USERPROFILE: join(root, "home"),
      },
      logger: QUIET,
    });
    const llmRuntime = host.context.get("llm");
    assert.ok(llmRuntime, "boot 后必须有 ctx.llm");

    const handle = llmRuntime.registerAdapter(
      ["knorvia-fake"],
      createFakeAdapter(llm.LlmAdapter, "fake reply"),
    );
    // 返回的 handle 只有 replace（换绑，不是解绑）——合同按此记录。
    assert.deepEqual(
      Object.keys(handle ?? {}),
      ["replace"],
      "registerAdapter 的 handle 形状是 { replace }",
    );

    const providers = llmRuntime.listProviders();
    const listed = providers.map((entry) => entry.id);
    assert.ok(
      listed.includes("knorvia-fake"),
      `listProviders 必须列出刚注册的 provider；实际=${listed.join(",")}`,
    );
    const fake = providers.find((entry) => entry.id === "knorvia-fake");
    assert.equal(fake.name, "Knorvia Fake Provider", "provider 元数据的 name 必须原样保留");
  } finally {
    try {
      await host?.dispose();
    } catch {
      // 释放失败由 kernel-dsh-00 的用例负责。
    }
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("B2 假 provider 的元数据校验是 fail closed：name 为空即拒绝注册", async () => {
  const llm = await import(pathToFileURL(DSH_LLM_ENTRY).href);
  const kernel = await import(pathToFileURL(KERNEL_ENTRY).href);
  const root = await mkdtemp(join(tmpdir(), "kernel-bridge-02-seam-bad-"));
  const workspace = join(root, "ws");
  let host;
  try {
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: {
        KNORVIA_DATA_BASE_DIR: join(root, "base"),
        HOME: join(root, "home"),
        USERPROFILE: join(root, "home"),
      },
      logger: QUIET,
    });
    const llmRuntime = host.context.get("llm");
    const brokenAdapter = new (class extends llm.LlmAdapter {
      providerInfo(provider) {
        // 故意给空 name：DSH 必须在注册期就拒绝，而不是等到请求期。
        return { id: provider, name: "" };
      }
      providerRetryPolicy() {
        return undefined;
      }
      imageRequestPricing() {
        return undefined;
      }
      async *stream() {
        yield { type: "text", text: "never" };
      }
    })();
    assert.throws(
      () => llmRuntime.registerAdapter(["knorvia-broken"], brokenAdapter),
      (error) => /name/u.test(error.message),
      "元数据非法的 adapter 必须在注册期被拒绝",
    );
  } finally {
    try {
      await host?.dispose();
    } catch {
      // 同上。
    }
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
