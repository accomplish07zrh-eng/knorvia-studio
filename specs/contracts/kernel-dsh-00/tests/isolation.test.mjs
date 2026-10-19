// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B4/B5/B6/B7/B10：DSH_HOME、.env、环境清洗、技能根与包内版本隔离。
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join, sep } from "node:path";
import test from "node:test";
import { loadKernel, repoRoot } from "./entry.mjs";
import { recordingLogger, withBoot } from "./_kernel.mjs";
import { makeTempDir, removeTempDir } from "./_process.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/isolation-env.json", import.meta.url), "utf8"),
);

function restoreEnv(previous) {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("B4 DSH_HOME 固定为 <数据根>/dsh，且不读写 ~/.dsh", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-home-");
  try {
    await withBoot(kernel, { root }, async ({ host, home, dataRoot, dshHome }) => {
      assert.equal(dshHome, join(dataRoot, "dsh"));
      assert.equal(host.dshHome, dshHome);
      assert.equal(existsSync(dshHome), true);
      assert.equal(existsSync(join(home, ".dsh")), false, "不得创建用户自己的 ~/.dsh");
      const persistence = host.context.get("sessionPersistence");
      assert.equal(persistence.config.root, join(dshHome, "sessions"));
    });
  } finally {
    await removeTempDir(root);
  }
});

test("B5 工作区与 DSH_HOME 的 .env 均不生效", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-dotenv-");
  const dataBase = join(root, "base");
  const dataRoot = join(dataBase, ".knorvia-studio");
  const dshHome = join(dataRoot, "dsh");
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  await mkdir(dshHome, { recursive: true });
  await writeFile(
    join(workspace, ".env"),
    "KNORVIA_DOTENV_SENTINEL=workspace\nDEEPSEEK_API_KEY=dotenv-leak\n",
  );
  await writeFile(join(dshHome, ".env"), "KNORVIA_DOTENV_SENTINEL=dsh-home\n");

  const previous = new Map([
    ["KNORVIA_DOTENV_SENTINEL", process.env.KNORVIA_DOTENV_SENTINEL],
    ["DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY],
  ]);
  delete process.env.KNORVIA_DOTENV_SENTINEL;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    await withBoot(kernel, { root, dataBase, cwd: workspace }, async () => {
      assert.equal(process.env.KNORVIA_DOTENV_SENTINEL, undefined);
      assert.equal(process.env.DEEPSEEK_API_KEY, undefined);
    });
  } finally {
    restoreEnv(previous);
    await removeTempDir(root);
  }
});

test("B6 清除 DSH_* 与供应商 key，保留 KNORVIA_*，日志不记录键名和值", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-env-");
  const keys = [
    ...fixture.providerKeyNames,
    "DSH_KERNEL_SENTINEL",
    fixture.dotenvSentinelKey,
    "KNORVIA_KEEP_SENTINEL",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const secret = "kernel-dsh-env-secret-value";
  try {
    for (const key of keys) process.env[key] = secret;
    const { entries, logger } = recordingLogger();
    await withBoot(kernel, { root, logger }, async ({ dataRoot, dshHome }) => {
      for (const key of keys.filter((key) => !key.startsWith("KNORVIA_"))) {
        assert.equal(process.env[key], undefined, `${key} 必须被清除`);
      }
      assert.equal(process.env.KNORVIA_KEEP_SENTINEL, secret);
      assert.equal(process.env.DSH_HOME, dshHome);
      assert.equal(process.env.DSH_TELEMETRY_DISABLED, "1");
      assert.equal(dshHome, join(dataRoot, "dsh"));

      const serialized = JSON.stringify(entries);
      assert.equal(serialized.includes(secret), false, "日志不得记录环境变量值");
      assert.equal(serialized.includes("DSH_KERNEL_SENTINEL"), false, "日志不得记录键名");
      assert.ok(entries.some((entry) => entry.message === "kernel.env.sanitized"));
    });
  } finally {
    restoreEnv(previous);
    await removeTempDir(root);
  }
});

test("B7 工作区 .dsh/skills 与 DSH_HOME/skills 都不进入技能注册表", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-skills-");
  const workspace = join(root, "workspace");
  const dshHome = join(root, "base", ".knorvia-studio", "dsh");
  await mkdir(join(workspace, ".dsh", "skills", "project-skill"), { recursive: true });
  await mkdir(join(dshHome, "skills", "home-skill"), { recursive: true });
  await writeFile(
    join(workspace, ".dsh", "skills", "project-skill", "SKILL.md"),
    "# project skill\n",
  );
  await writeFile(join(dshHome, "skills", "home-skill", "SKILL.md"), "# home skill\n");
  try {
    await withBoot(kernel, { root, cwd: workspace }, async ({ host }) => {
      const skills = host.context.get("skills");
      assert.ok(skills, "skill 服务应存在");
      assert.deepEqual(await skills.list(), []);
    });
  } finally {
    await removeTempDir(root);
  }
});

test("B10 不执行 PATH 中的 dsh，模块解析固定在仓库依赖树内", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-path-");
  const binDir = join(root, "bin");
  const marker = join(root, "dsh-invoked");
  await mkdir(binDir, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(join(binDir, "dsh.cmd"), `@echo invoked> "${marker}"\r\n`);
  } else {
    const fake = join(binDir, "dsh");
    await writeFile(fake, `#!/bin/sh\necho invoked > "${marker}"\n`);
    chmodSync(fake, 0o755);
  }

  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${delimiter}${previousPath ?? ""}`;
  try {
    await withBoot(kernel, { root }, async ({ host }) => {
      assert.equal(existsSync(marker), false, "不得执行 PATH 中的 dsh");
      assert.ok(host.context.get("sessions"));
    });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await removeTempDir(root);
  }

  const requireFromKernel = createRequire(
    join(repoRoot, "apps/cli/packages/bootstrap/dist/kernel/host.js"),
  );
  const resolvedEntry = requireFromKernel.resolve("@deepseek-ai/dsh-app-boot");
  assert.ok(resolvedEntry.startsWith(`${repoRoot}${sep}`), resolvedEntry);
  assert.ok(resolvedEntry.includes(`${sep}node_modules${sep}`), resolvedEntry);
  const manifestPath = requireFromKernel.resolve("@deepseek-ai/dsh-app-boot/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.version, "0.2.0-rc.2");
});
