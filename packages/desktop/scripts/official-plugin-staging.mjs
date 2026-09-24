#!/usr/bin/env node

// 桌面打包态的内置插件 staging 资产清单与实现。
//
// 这份模块是 dev（scripts/build-desktop-agent-cli.mjs）与打包
// （packages/desktop/scripts/prepare-agent-node-bundle.mjs）**共用**的唯一清单：
// 两套平行清单会各自漂移（历史上打包链去 browser-use 要 node_repl 宿主产物，
// dev 链改对了却测不出打包失败）。权威归属仍是
// apps/cli/packages/bootstrap/src/app/official-plugin-definitions.ts；
// 这里只把同一份 seed 资产带到 resources/knorvia/packages/ 并逐个校验。

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

export const BROWSER_USE_PLUGIN_PACKAGE_NAME = "@knorvia/browser-use-plugin";

export const browserUseRequiredRuntimePaths = [
  "scripts/browser-client.mjs",
  "docs/LICENSE.txt",
  "docs/api.json",
  "docs/documents.json",
  "docs/overview.md",
  // documents.json 已暴露 recording lookup，桌面安装包不能复用缺少正文的 runtime。
  "docs/recording.md",
  "docs/workflow.md",
  "skills/control-browser/SKILL.md",
  "skills/web-gui-tester/SKILL.md",
];

// 内置内容型插件：本仓库不随包发布上游 producer 源码，只保留 seed 资产。
// 每项的 requiredSeedPaths 与 official-plugin-definitions.ts 逐个对应，缺文件即打包失败。
// 只列入用户确认要保留的内置插件：PDF、Word、演示文稿、电子表格、插件创建器、技能创建器；
// browser-use 与 node_repl 宿主在下方单独声明（宿主对用户不可见，但浏览器操作依赖它）。
const contentPluginPackages = [
  {
    name: "documents",
    version: "0.2.0",
    requiredSeedPaths: ["agents/visual-judge.md", "skills/docx/SKILL.md", "skills/docx/LICENSE.txt", "skills/docx/scripts/inspect.py"],
  },
  {
    name: "pdf",
    version: "0.2.0",
    requiredSeedPaths: ["agents/visual-judge.md", "skills/pdf/SKILL.md", "skills/pdf/LICENSE.txt", "skills/pdf/scripts/inspect.py"],
  },
  {
    name: "presentations",
    version: "0.2.0",
    requiredSeedPaths: ["agents/visual-judge.md", "skills/pptx/SKILL.md", "skills/pptx/LICENSE.txt", "skills/pptx/scripts/inspect.py"],
  },
  {
    name: "spreadsheets",
    version: "0.2.0",
    requiredSeedPaths: ["agents/visual-judge.md", "skills/xlsx/SKILL.md", "skills/xlsx/LICENSE.txt", "skills/xlsx/scripts/inspect.py"],
  },
  {
    name: "plugin-creator",
    version: "0.2.0",
    requiredSeedPaths: [
      "skills/plugin-creator/SKILL.md",
      "skills/plugin-creator/LICENSE.txt",
      "skills/plugin-creator/scripts/create-basic-plugin.mjs",
      "skills/plugin-creator/scripts/marketplace-files.mjs",
      "skills/plugin-creator/scripts/upsert-dev-marketplace.mjs",
      "skills/plugin-creator/scripts/scaffold-files.mjs",
      "skills/plugin-creator/scripts/validate-plugin.mjs",
      "skills/plugin-creator/references/plugin-json-spec.md",
      "skills/plugin-creator/references/installing-and-updating.md",
    ],
  },
  {
    name: "skill-creator",
    version: "0.2.0",
    requiredSeedPaths: ["skills/skill-creator/SKILL.md", "skills/skill-creator/LICENSE.txt"],
  },
];

export const officialPluginPackages = [
  {
    // browser-use 只携带自己的 client script 与 skill/docs；node_repl MCP runtime 归
    // @knorvia/node-repl-host（见各自包内注释）。
    packageName: BROWSER_USE_PLUGIN_PACKAGE_NAME,
    name: "browser-use",
    version: "0.6.0",
    relativePath: "apps/cli/packages/browser-use-plugin",
    requiresRuntime: true,
    requiredRuntimePaths: browserUseRequiredRuntimePaths,
    runtimeBuildScript: "scripts/build.mjs",
    stagedPath: "packages/browser-use-plugin",
  },
  {
    // node_repl 宿主：Browser Use 与 Computer Use 共用的 MCP runtime。
    // 它没有 listing（不进插件市场展示面），但必须随包携带 dist runtime。
    packageName: "@knorvia/node-repl-host",
    name: "node-repl-host",
    version: "0.7.0",
    relativePath: "apps/cli/packages/node-repl-host",
    requiresRuntime: true,
    requiredRuntimePaths: ["dist/mcp/server.js", "docs/LICENSE.txt"],
    runtimeBuildScript: "scripts/build.mjs",
    stagedPath: "packages/node-repl-host",
  },
  ...contentPluginPackages.map((plugin) => {
    const dirName = plugin.dirName ?? plugin.name;
    return {
      ...plugin,
      packageName: `@knorvia/${dirName}-plugin`,
      relativePath: `apps/cli/packages/${dirName}-plugin`,
      stagedPath: `packages/${dirName}-plugin`,
    };
  }),
];

const includedOfficialPluginTopLevelPaths = new Set([
  ".mcp.json",
  ".knorvia-plugin",
  "README.md",
  // Electron 生产资源复制有独立白名单，遗漏 agents 会让首启 filesystem seed 永久缺少子代理。
  "agents",
  "commands",
  "dist",
  "docs",
  "hooks",
  "output-styles",
  "package.json",
  "scripts",
  "skills",
  "templates",
]);
const excludedOfficialPluginAssetNames = new Set([
  ".DS_Store",
  ".venv",
  "__pycache__",
  "node_modules",
]);

function shouldCopyOfficialPluginAsset(sourcePath) {
  const name = basename(sourcePath);
  return !excludedOfficialPluginAssetNames.has(name) && !name.endsWith(".pyc");
}

export function buildOfficialPluginRuntimes({
  repoRoot,
  runCommand,
  env = process.env,
  isBootstrapWithRemote = false,
}) {
  for (const plugin of officialPluginPackages) {
    if (!plugin.requiresRuntime) continue;
    if (plugin.prebuiltRuntime) {
      // 预编译产物随仓库分发（android/ios 模拟器插件），没有本仓库构建步骤。
      assertOfficialPluginRuntime({ plugin, repoRoot });
      continue;
    }
    console.log(`[prepare:agent-bundle] building ${plugin.packageName} runtime ...`);
    if (isBootstrapWithRemote) {
      buildOfficialPluginRuntimeForBootstrap({ plugin, repoRoot, runCommand });
      assertOfficialPluginRuntime({ plugin, repoRoot });
      continue;
    }

    runCommand(
      "pnpm",
      ["--dir", resolve(repoRoot, "apps/cli"), "--filter", plugin.packageName, "build"],
      {
        cwd: repoRoot,
        env,
      },
    );
    assertOfficialPluginRuntime({ plugin, repoRoot });
  }
}

function buildOfficialPluginRuntimeForBootstrap({ plugin, repoRoot, runCommand }) {
  const pluginRoot = resolve(repoRoot, plugin.relativePath);
  const hasCompleteRuntime = plugin.requiredRuntimePaths.every((relativePath) =>
    existsSync(resolve(pluginRoot, ...relativePath.split("/"))),
  );
  if (plugin.packageName !== BROWSER_USE_PLUGIN_PACKAGE_NAME && hasCompleteRuntime) {
    console.log(
      `[prepare:agent-bundle] reuse existing official plugin runtime: ${plugin.packageName}`,
    );
    return;
  }

  // bootstrap:with-remote 会连续构建 remote assets 和桌面 agent bundle。
  // 通过 pnpm/filter 进入插件 build 时，tsc shim 在本地低内存环境中容易被 SIGKILL；
  // 这里仅在 bootstrap 开关下用当前 Node 直接执行等价 tsc + build-mcp，不改变插件自身 build 脚本。
  // browser-use 的 server 与 browser-client 是同一发布对；即使旧 server.js 存在也必须重建，
  // 否则会把旧 server 与当前 client（或缺失 client）一起 stage 到桌面安装包。
  runCommand(process.execPath, ["../../node_modules/typescript/bin/tsc"], {
    cwd: pluginRoot,
    env: process.env,
  });
  runCommand(process.execPath, [plugin.runtimeBuildScript], {
    cwd: pluginRoot,
    env: process.env,
  });
}

export function assertOfficialPluginRuntime({ plugin, repoRoot }) {
  const pluginRoot = resolve(repoRoot, plugin.relativePath);
  for (const relativePath of plugin.requiredRuntimePaths ?? []) {
    const runtimePath = resolve(pluginRoot, ...relativePath.split("/"));
    if (!existsSync(runtimePath)) {
      throw new Error(`[prepare:agent-bundle] missing official plugin runtime: ${runtimePath}`);
    }
  }
}

/**
 * 把官方插件按 bootstrap 的 rootCandidates 期望放到 knorvia/packages/*-plugin，
 * 让 dev 与 Electron Node 运行 knorvia.cjs 时复用同一套 filesystem seed 逻辑。
 */
export function stageOfficialPluginAssets({ repoRoot, agentDir, log = console.log }) {
  // 先检查全部来源。一个坏包不能让前几个插件已经被覆盖、后几个仍是旧版。
  for (const plugin of officialPluginPackages) {
    const sourceRoot = resolve(repoRoot, plugin.relativePath);
    const manifestPath = resolve(sourceRoot, ".knorvia-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`[prepare:agent-bundle] missing official plugin manifest: ${manifestPath}`);
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      throw new Error(`[prepare:agent-bundle] invalid official plugin manifest: ${manifestPath}`, {
        cause: error,
      });
    }
    if (manifest.name !== plugin.name || manifest.version !== plugin.version) {
      throw new Error(
        `[prepare:agent-bundle] official plugin identity mismatch: ${manifestPath} (expected ${plugin.name}@${plugin.version})`,
      );
    }
    for (const relativePath of [
      ...(plugin.requiredSeedPaths ?? []),
      ...(plugin.requiredRuntimePaths ?? []),
    ]) {
      const sourcePath = resolve(sourceRoot, ...relativePath.split("/"));
      if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
        throw new Error(`[prepare:agent-bundle] missing official plugin seed asset: ${sourcePath}`);
      }
    }
  }

  for (const plugin of officialPluginPackages) {
    const sourceRoot = resolve(repoRoot, plugin.relativePath);
    const targetRoot = resolve(agentDir, plugin.stagedPath);
    // 先清空目标目录再复制：插件包重命名或删除文件后，只做覆盖复制会把上一次 staging 的
    // 陈旧文件永久留在安装包里，source 与 packaged 就此分叉。
    //
    // 注意：清空复制会忠实镜像 source，包括 source 里缺失的文件。因此第三方许可正文
    // （LICENSE.txt）与 manifest 的 author/license 字段必须在 source 里存在；下面的
    // 许可守卫会在缺失时直接让打包失败，避免"删除一次就永久带进安装包"。
    rmSync(targetRoot, { force: true, recursive: true });
    mkdirSync(targetRoot, { recursive: true });
    for (const entryName of includedOfficialPluginTopLevelPaths) {
      const sourcePath = resolve(sourceRoot, entryName);
      if (!existsSync(sourcePath)) continue;
      cpSync(sourcePath, resolve(targetRoot, entryName), {
        recursive: true,
        filter: shouldCopyOfficialPluginAsset,
      });
    }
    // 许可守卫：manifest 声明了 license 字段时，被指向的许可正文必须真实存在且已 staged。
    // 这是 specs/knorvia-builtin-plugins.md 对"发行来源与权利依据需单独记录"的机械兜底。
    const manifest = JSON.parse(readFileSync(resolve(sourceRoot, ".knorvia-plugin", "plugin.json"), "utf8"));
    const declaredLicense = typeof manifest.license === "string" ? manifest.license : "";
    const seeLicenseIn = /^SEE LICENSE IN\s+(.+)$/u.exec(declaredLicense.trim());
    if (seeLicenseIn) {
      const licenseRelativePath = seeLicenseIn[1].trim();
      const stagedLicensePath = resolve(targetRoot, ...licenseRelativePath.split("/"));
      if (!existsSync(stagedLicensePath)) {
        throw new Error(
          `[prepare:agent-bundle] official plugin declares "${declaredLicense}" but the license text is missing: ${stagedLicensePath}`,
        );
      }
    }
    for (const relativePath of [
      ...(plugin.requiredSeedPaths ?? []),
      ...(plugin.requiredRuntimePaths ?? []),
    ]) {
      const stagedAssetPath = resolve(targetRoot, ...relativePath.split("/"));
      if (!existsSync(stagedAssetPath)) {
        throw new Error(
          `[prepare:agent-bundle] missing staged official plugin seed asset: ${stagedAssetPath}`,
        );
      }
    }
    log(`[prepare:agent-bundle] staged official plugin ${plugin.stagedPath}`);
  }
}
