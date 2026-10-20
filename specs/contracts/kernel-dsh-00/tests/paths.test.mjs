// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B17：cwd 校验、配置字节、含空格/非 ASCII 的数据根与 Windows 大小写清洗。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { loadKernel } from "./entry.mjs";
import { silentLogger, withBoot } from "./_kernel.mjs";
import { makeTempDir, removeTempDir } from "./_process.mjs";

test("B17 相对 cwd 视为配置错误，且不占用启动标记", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-paths-cwd-");
  const home = join(root, "home");
  const env = {
    KNORVIA_DATA_BASE_DIR: join(root, "base"),
    HOME: home,
    USERPROFILE: home,
  };
  try {
    await assert.rejects(
      kernel.bootKernel({ cwd: "relative/path", env, logger: silentLogger() }),
      (error) => error.code === "KERNEL_INVALID_CWD",
    );
    await withBoot(kernel, { root }, async ({ host }) => {
      assert.equal(host.engine, "dsh");
    });
  } finally {
    await removeTempDir(root);
  }
});

test("B17 配置换行固定 \\n，数据根可含空格与非 ASCII 且 DSH_HOME 为绝对路径", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-paths-data-");
  const dataBase = join(root, "数据 base");
  try {
    await withBoot(kernel, { root, dataBase }, async ({ dshHome, workspace }) => {
      assert.equal(isAbsolute(dshHome), true);
      assert.ok(dshHome.startsWith(dataBase));
      const configPath = join(dshHome, "knorvia", "kernel.cordis.json");
      const bytes = await readFile(configPath);
      assert.equal(bytes.includes(0x0d), false, "配置不得包含 CR");
      assert.equal(bytes[bytes.length - 1], 0x0a, "配置必须以单个 LF 结尾");
      const rows = JSON.parse(bytes.toString("utf8"));
      // 底座 19 行必须与公开物化的底座切片逐字段一致；追加行由
      // kernel-dsh-builtins 合同断言（D1）。
      const materialized = kernel.createKernelPluginRows(dshHome, { cwd: workspace });
      const base = materialized.slice(0, 19);
      assert.equal(base.length, 19, "底座必须是 19 行");
      assert.deepEqual(rows.slice(0, base.length), base);
      assert.equal(rows[3].config.root, join(dshHome, "sessions"));
    });
  } finally {
    await removeTempDir(root);
  }
});

test(
  "B17 Windows 下环境变量名大小写不敏感地匹配 DSH_* 与 *_API_KEY",
  { skip: process.platform !== "win32" },
  async () => {
    const kernel = await loadKernel();
    const root = await makeTempDir("kernel-dsh-paths-win-");
    const keys = ["dsh_home_sentinel", "deepseek_api_key"];
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    try {
      for (const key of keys) process.env[key] = "kernel-dsh-win-secret";
      await withBoot(kernel, { root }, async () => {
        for (const key of keys) {
          assert.equal(process.env[key], undefined, `${key} 必须被清除`);
        }
      });
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await removeTempDir(root);
    }
  },
);
