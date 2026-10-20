// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B9–B13（修正一）：工具子进程环境的用户视角行为。
//
// 三条核心断言：
//   (a) 用户普通变量在 shell 工具子进程里可见；
//   (b) 凭据形命名的用户变量（非 DSH/供应商内建名）也可见；
//   (c) DSH_* 在 shell 工具子进程里不可见（含 dsh-shell-env 托管注入的）。
// 附加断言：
//   (d) 进程级仍删供应商 key，但子进程里还在（B12）；
//   (e) boot 之后新增的变量不进子进程（B13）。
//
// 测试走公开入口：另起一个进程在那里 boot 内核（scripts/kernel-shell-probe.mjs），
// 再用已挂载的 shell 执行器跑命令回读环境。测试进程自己不被 boot 影响。
// 契约见 specs/contracts/kernel-dsh-builtins/behavior.md B9-B13。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { repoRootPath } from "./entry.mjs";

const FIXTURES = JSON.parse(
  await readFile(new URL("../fixtures/child-environment.json", import.meta.url), "utf8"),
);

/** tsx 的 ESM loader 地址；Windows 上 --import 只接受 file:// URL。 */
function tsxLoaderUrl() {
  return pathToFileURL(join(repoRootPath, "node_modules/tsx/dist/loader.mjs")).href;
}
const PROBE_SCRIPT = join(repoRootPath, "scripts", "kernel-shell-probe.mjs");

/** ABSENT 是探针脚本约定的「变量不存在」标记，与空字符串区分。 */
const ABSENT = "ABSENT";

/** 读一组环境变量的 shell 片段；两支按平台选语法。 */
function readEnvironmentScript(names) {
  if (process.platform === "win32") {
    const lookups = names
      .map(
        (name) =>
          `$v = [Environment]::GetEnvironmentVariable('${name}'); $o['${name}'] = if ($null -eq $v) { '${ABSENT}' } else { $v }`,
      )
      .join("; ");
    return `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $o = [ordered]@{}; ${lookups}; $o | ConvertTo-Json -Compress`;
  }
  const lookups = names
    .map((name) => `printf '%s=%s\\n' '${name}' "\${${name}-${ABSENT}}"`)
    .join("; ");
  return lookups;
}

/** 解析探针输出；pwsh 支回 JSON，bash 支回 `K=V` 行。 */
function parseEnvironmentOutput(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const parsed = {};
  for (const line of trimmed.split(/\r?\n/u)) {
    const index = line.indexOf("=");
    if (index > 0) parsed[line.slice(0, index)] = line.slice(index + 1);
  }
  return parsed;
}

/**
 * 在独立进程里 boot 内核并回读子进程环境。
 *
 * @param environment - 探针进程的环境（决定快照内容）。
 * @param names - 要在子进程里回读的变量名。
 * @returns 子进程读到的键值对。
 */
async function readChildEnvironment(environment, names) {
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-env-"));
  try {
    const probe = spawn(process.execPath, ["--import", tsxLoaderUrl(), PROBE_SCRIPT], {
      cwd: repoRootPath,
      env: {
        ...environment,
        KNORVIA_DATA_BASE_DIR: join(root, "base"),
        KNORVIA_KERNEL_ENGINE: "dsh",
        HOME: join(root, "home"),
        USERPROFILE: join(root, "home"),
        KNORVIA_PROBE_SCRIPT: readEnvironmentScript(names),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    probe.stdout.setEncoding("utf8");
    probe.stderr.setEncoding("utf8");
    probe.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    probe.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise((resolveExit) => {
      probe.once("exit", (exitCode) => resolveExit(exitCode));
    });
    if (code !== 0) {
      throw new Error(`shell probe failed (exit ${code}); stderr=${JSON.stringify(stderr)}`);
    }
    assert.equal(
      /knorvia-kernel-failed/u.test(stderr),
      false,
      `内核不得启动失败；stderr=${JSON.stringify(stderr)}`,
    );
    return parseEnvironmentOutput(stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** 构造一份只含测试所需变量的环境，避免继承开发机上的无关 DSH 痕迹。 */
function probeEnvironment(extra) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (name.toUpperCase().startsWith("DSH_")) continue;
    if (name === "KNORVIA_KERNEL_ENGINE") continue;
    environment[name] = value;
  }
  return Object.assign(environment, extra);
}

test("B9/B10/B11 工具子进程只看得到用户环境：普通变量与凭据形变量可见，DSH_* 不可见", async () => {
  const visible = FIXTURES.visibleInChildProcess;
  const hidden = FIXTURES.hiddenInChildProcess;
  const managed = FIXTURES.managedByDshShellEnv;
  const names = [...Object.keys(visible), ...Object.keys(hidden), ...managed];

  const childEnvironment = await readChildEnvironment(
    probeEnvironment({ ...visible, ...hidden }),
    names,
  );

  // (a) 用户普通变量可见。
  assert.equal(
    childEnvironment.KNORVIA_TEST_PLAIN_MARKER,
    visible.KNORVIA_TEST_PLAIN_MARKER,
    "B9(a) 用户普通变量必须在工具子进程可见",
  );
  // (b) 凭据形用户变量可见——这是审查结论点名的修正。
  assert.equal(
    childEnvironment.MY_SERVICE_API_KEY,
    visible.MY_SERVICE_API_KEY,
    "B10(b) 凭据形用户变量必须在工具子进程可见",
  );
  // (c) DSH_* 不可见：宿主继承的与 dsh-shell-env 托管注入的都不行。
  assert.equal(
    childEnvironment.DSH_KNORVIA_INHERITED,
    ABSENT,
    "B11(c) 宿主继承的 DSH_* 不得进入工具子进程",
  );
  for (const name of managed) {
    assert.equal(childEnvironment[name], ABSENT, `B11(c) ${name} 不得进入工具子进程`);
  }
});

test("B12 进程级清洗仍生效，但快照让子进程看得到同一个变量", async () => {
  const value = FIXTURES.visibleInChildProcess.ANTHROPIC_API_KEY;
  const childEnvironment = await readChildEnvironment(
    probeEnvironment({ ANTHROPIC_API_KEY: value }),
    ["ANTHROPIC_API_KEY"],
  );
  assert.equal(
    childEnvironment.ANTHROPIC_API_KEY,
    value,
    "B12 供应商 key 在进程内被清洗，但工具子进程仍拿得到启动时的值",
  );
});

test("B13 boot 之后新增的变量不进入工具子进程", async () => {
  const [name] = Object.keys(FIXTURES.hiddenAfterBoot);
  const childEnvironment = await readChildEnvironment(probeEnvironment({}), [
    name,
    "KNORVIA_TEST_PLAIN_MARKER",
  ]);
  assert.equal(
    childEnvironment[name],
    ABSENT,
    "B13 快照是启动时点的事实，boot 之后写入的变量不得进子进程",
  );
  assert.equal(
    childEnvironment.KNORVIA_TEST_PLAIN_MARKER,
    ABSENT,
    "B13 未在启动环境里给出的变量同样不得出现",
  );
});
