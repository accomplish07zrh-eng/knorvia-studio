#!/usr/bin/env node

// 桌面打包态的 agent 运行时资产：把 agent 的 JS bundle（knorvia.cjs）放进 bundled-agents/<platform>/knorvia，
// 由 app 内置的 Electron Node runtime（ELECTRON_RUN_AS_NODE）执行，替代以前随包内置的独立 Node 二进制。
//
// 为什么这么做：
// - agent 没有任何原生 NAPI 插件（ripgrep 是 WASM，其余纯 JS），可直接跑在 Electron 的 Node 上；
// - Electron 41 内置 Node 24.x，与 cli 的目标运行时一致；
// - 单平台体积从 ~180MB 降到 ~16MB，且同一份 JS 跨平台通用；
// - app-server 命令路径不会加载 @knorvia/tui，所以这里天然不打包 TUI。
//
// 远端（SSH/WSL/Docker）没有 Electron，仍走 prepare:remote-assets 的原生二进制，互不影响。

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCommand } from "../../../scripts/spawn-command.mjs";
import {
  buildOfficialPluginRuntimes,
  stageOfficialPluginAssets,
} from "./official-plugin-staging.mjs";
import { stageAgentBundle } from "./stage-agent-bundle.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const cliBundlePath = resolve(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");
const pnpmRunEnv = {
  ...process.env,
  // pnpm 11 会在 apps/cli 子 workspace 执行 run 前触发 install；
  // 子 workspace 不能解析根 workspace 的 @knorvia/shared，Docker/web app 打包会因此卡在插件 runtime 构建。
  PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "false",
};

// 平台目录命名：darwin/win32/linux + x64/arm64，
// 支持 KNORVIA_TARGET_OS / KNORVIA_TARGET_ARCH 覆盖（交叉打包时由 CI 注入）。
function normalizePlatform(raw) {
  switch (raw) {
    case "mac":
    case "macos":
    case "darwin":
    case "osx":
      return "darwin";
    case "win":
    case "windows":
    case "win32":
      return "win32";
    case "linux":
      return "linux";
    default:
      return raw;
  }
}

function normalizeArch(raw) {
  switch (raw) {
    case "x86_64":
    case "x64":
    case "amd64":
      return "x64";
    case "aarch64":
    case "arm64":
      return "arm64";
    default:
      return raw;
  }
}

const platform = normalizePlatform(process.env.KNORVIA_TARGET_OS || "") || process.platform;
const arch = normalizeArch(process.env.KNORVIA_TARGET_ARCH || "") || process.arch;
const platformKey = `${platform}-${arch}`;

const agentDir = resolve(desktopRoot, "bundled-agents", platformKey, "knorvia");
// 官方插件资产清单与 staging 实现已抽到 official-plugin-staging.mjs，
// dev 链（scripts/build-desktop-agent-cli.mjs）与打包链共用同一份，
// 权威归属见 apps/cli/packages/bootstrap/src/app/official-plugin-definitions.ts。
const isBootstrapWithRemote = process.env.KNORVIA_BOOTSTRAP_WITH_REMOTE === "1";

function buildCliBundle() {
  console.log("[prepare:agent-bundle] building cli app-server bundle ...");
  // 复用仓库根脚本（turbo build:desktop-agent --filter=@knorvia/cli），命中缓存时几乎瞬时。
  runCommand(process.execPath, [resolve(repoRoot, "scripts/build-desktop-agent-cli.mjs")], {
    cwd: repoRoot,
    env: pnpmRunEnv,
  });
  if (!existsSync(cliBundlePath)) {
    throw new Error(
      `[prepare:agent-bundle] expected cli bundle missing after build: ${cliBundlePath}`,
    );
  }
}

function stageBundle() {
  // 实现已抽到 stage-agent-bundle.mjs：dev 链（scripts/build-desktop-agent-cli.mjs）
  // 必须用同一份，否则 dev 会继续跑上一次打包留下的陈旧 agent。
  stageAgentBundle({ repoRoot, platformKey });
}

// Electron 生产包只带 resources/knorvia/knorvia.cjs 时，app-server 进程的
// __dirname 附近没有官方插件目录，启动时 seed 找不到 source，用户侧不会自动得到内置插件。
// 这里把官方插件按 bootstrap 的 rootCandidates 期望放到 knorvia/packages/*-plugin，
// 让 Electron Node 运行 knorvia.cjs 时复用同一套 filesystem seed 逻辑。
// browser-use runtime 的声明生成依赖 @knorvia/core/dist。CI 干净检出没有该产物，
// 必须先构建 CLI 依赖，再构建官方插件；开发机残留的 dist 曾掩盖这个顺序问题。
buildCliBundle();
buildOfficialPluginRuntimes({ repoRoot, runCommand, env: pnpmRunEnv, isBootstrapWithRemote });
stageBundle();
stageOfficialPluginAssets({ repoRoot, agentDir });
