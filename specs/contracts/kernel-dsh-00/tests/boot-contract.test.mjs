// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B3：直接配置启动，不加载 profile/patch，配置内容确定。
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./entry.mjs";
import { withBoot } from "./_kernel.mjs";
import { makeTempDir, removeTempDir } from "./_process.mjs";

const MISSING_PLUGIN_PATCH = [
  "- id: ghost",
  '  name: "@deepseek-ai/kernel-dsh-does-not-exist"',
  "",
].join("\n");

async function readConfig(dshHome) {
  return readFile(join(dshHome, "knorvia", "kernel.cordis.json"), "utf8");
}

test("B3 DSH_HOME 与用户 ~/.dsh 的 patch 均不参与启动，配置内容确定", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-boot-");
  const dataBase = join(root, "base");
  const home = join(root, "home");
  const dshHome = join(dataBase, ".knorvia-studio", "dsh");

  await mkdir(dshHome, { recursive: true });
  await mkdir(join(home, ".dsh"), { recursive: true });
  await writeFile(join(dshHome, "cordis.patch.yml"), MISSING_PLUGIN_PATCH);
  await writeFile(join(home, ".dsh", "cordis.patch.yml"), MISSING_PLUGIN_PATCH);

  try {
    const contents = [];
    for (let index = 0; index < 2; index += 1) {
      await withBoot(kernel, { root, dataBase, home }, async ({ host }) => {
        assert.equal(host.dshHome, dshHome);
        assert.ok(host.context.get("loader"), "Cordis 根 Context 必须已 settle");
        contents.push(await readConfig(dshHome));
      });
    }
    assert.equal(contents[0], contents[1], "同一输入的配置文件字节必须确定");
    assert.equal(contents[0].includes("\r"), false);

    const parsed = JSON.parse(contents[0]);
    // 物化结果 = 底座 19 行 + kernel-dsh-builtins 追加行。底座部分必须与公开物化的
    // 前 19 行逐字段一致（蓝图本身不含注入的持久化根，所以基准取物化结果的底座切片；
    // kernel-dsh-builtins known-differences D1：追加行由该包合同断言）。
    const materialized = kernel.createKernelPluginRows(dshHome, { cwd: root });
    const base = materialized.slice(0, 19);
    assert.equal(base.length, 19, "底座必须是 19 行");
    assert.deepEqual(parsed.slice(0, base.length), base, "底座行必须与物化结果一致");
    assert.ok(parsed.length > base.length, "物化结果必须含 kernel-dsh-builtins 追加行");
    const appendedIds = parsed.slice(base.length).map((row) => row.id);
    assert.equal(new Set(appendedIds).size, appendedIds.length, "追加行 id 不得重复");
    for (const id of appendedIds) {
      assert.equal(
        base.some((row) => row.id === id),
        false,
        `追加行 id 不得与底座重名：${id}`,
      );
    }
  } finally {
    await removeTempDir(root);
  }
});
