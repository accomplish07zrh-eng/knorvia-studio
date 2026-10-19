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
    assert.deepEqual(parsed, kernel.createKernelPluginRows(dshHome));
  } finally {
    await removeTempDir(root);
  }
});
