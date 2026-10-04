#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compactStudioTestArguments } from "./studio-test-arguments.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDirectories = [
  "packages/services/test",
  "packages/ui/test",
  "packages/desktop/test",
  "packages/desktop/src/host",
  "packages/desktop/src/main/browserView",
  "packages/desktop/src/preload",
  "packages/server/test",
  "packages/server-cli/test",
  "packages/shared/test",
  "packages/rpc/test",
  "apps/cli/packages/core/test",
  "apps/cli/packages/contracts/test",
  "apps/cli/packages/adapters/test",
  "apps/cli/packages/plugin-creator-plugin/test",
  "apps/cli/packages/node-repl-host/test",
];
// `scripts/` 不在上面的目录扫描范围内，必须逐个显式列入，否则不会被统一入口跑到。
// 发布判定（release-gate）必须在这里，不能只靠质量工作流“碰巧”覆盖。
const explicitTests = [
  "scripts/studio-test-arguments.test.mjs",
  "scripts/check-evidence-integrity.test.mjs",
  "scripts/knorvia-agent-base.test.ts",
  "scripts/release-gate.test.ts",
  "scripts/desktop-release-manifest.test.mjs",
  "scripts/desktop-release-portable-launch.test.mjs",
  "scripts/provenance/provenance.test.mjs",
  "scripts/provenance/retained-review.test.mjs",
  "scripts/provenance/third-party-audit.test.mjs",
  "scripts/provenance/patch-inventory.test.mjs",
  "scripts/provenance/material-icon-references.test.mjs",
  "scripts/provenance/third-party-platform.test.mjs",
  "scripts/provenance/retained-npm-notices.test.mjs",
  "scripts/provenance/dependency-platform-qa-regressions.test.mjs",
  "scripts/provenance/dependency-history-qa-regressions.test.mjs",
  "scripts/provenance/ui-alias-lineage.test.mjs",
  "packages/cua/test/stage-windows-driver.test.mjs",
  "apps/cli/packages/bootstrap/test/windows-computer-use-config.test.ts",
  "apps/cli/packages/bootstrap/test/message-mapper-contract.test.ts",
  "apps/cli/packages/bootstrap/test/session-projection-contract.test.ts",
  "apps/cli/packages/bootstrap/test/session-snapshot-images-contract.test.ts",
  "apps/cli/packages/bootstrap/test/session-snapshot-contract.test.ts",
  "apps/cli/packages/cli/test/argument-admission-contract.test.ts",
  "apps/cli/packages/bootstrap/test/resident-pool-contract.test.ts",
  "apps/cli/packages/bootstrap/test/script-child-contract.test.ts",
  "apps/cli/packages/bootstrap/test/script-child-consumer.test.ts",
  "apps/cli/packages/cli/test/custom-command-expansion-contract.test.ts",
  "apps/cli/packages/cli/test/custom-command-expansion-consumer.test.ts",
  "apps/cli/packages/cli/test/sea-runtime-surface.test.mjs",
  "apps/cli/packages/tui/test/build-commonjs-esm-contract.test.mjs",
  "apps/cli/packages/dynamic-workflow/test/ask-scheduler-contract.test.ts",
  "apps/cli/packages/bootstrap/test/browser-protocol-broker.test.ts",
  "apps/cli/packages/bootstrap/test/browser-local-broker.test.ts",
  "apps/cli/packages/bootstrap/test/interaction-preparation.test.ts",
  "apps/cli/packages/bootstrap/test/permission-readiness.test.ts",
  "apps/cli/packages/bootstrap/test/permission-hook-recheck.test.ts",
  "apps/cli/packages/bootstrap/test/prepared-interaction-race.test.ts",
];
const tests = [...explicitTests];

for (const directory of testDirectories) {
  const absoluteDirectory = resolve(repoRoot, directory);
  const names = (await readdir(absoluteDirectory))
    .filter((name) => /\.test\.(?:ts|mjs)$/u.test(name))
    .sort();
  if (names.length === 0) {
    throw new Error(`No offline studio tests found in ${directory}`);
  }
  tests.push(
    ...names.map((name) => relative(repoRoot, join(absoluteDirectory, name)).split(sep).join("/")),
  );
}

const testArguments = await compactStudioTestArguments({
  repoRoot,
  explicitTests,
  testDirectories,
  discoveredTests: tests,
});

const testHome = await mkdtemp(join(tmpdir(), "knorvia-studio-test-"));
const env = {
  ...process.env,
  KNORVIA_ENV: "test",
  KNORVIA_DATA_BASE_DIR: testHome,
  KNORVIA_STORAGE_DIR: join(testHome, "cli"),
  // 根目录没有 tsconfig；UI 的 @/ 别名需显式使用其已有配置。
  TSX_TSCONFIG_PATH: resolve(repoRoot, "packages/ui/tsconfig.json"),
};
// 离线回归使用模拟服务和本机回环端点，避免意外继承本机模型凭据。
for (const key of Object.keys(env)) {
  if (/(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|_KEY)$/iu.test(key)) {
    delete env[key];
  }
}

// 每个用例的挂起上限：用 Node 测试运行器自带的 --test-timeout 让挂起的用例以超时失败，
// 而不是让整轮回归无限等待。刻意不做子进程强杀：Windows 上杀进程树容易误伤或静默失效。
// 默认 120 秒远高于当前最慢用例；可用 KNORVIA_TEST_TIMEOUT_MS 覆盖。
const DEFAULT_TEST_TIMEOUT_MS = 120_000;
const configuredTimeout = Number(process.env.KNORVIA_TEST_TIMEOUT_MS ?? DEFAULT_TEST_TIMEOUT_MS);
const testTimeoutMs =
  Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TEST_TIMEOUT_MS;
if (testTimeoutMs !== configuredTimeout) {
  console.warn(
    `[test:studio] 忽略无效的 KNORVIA_TEST_TIMEOUT_MS=${process.env.KNORVIA_TEST_TIMEOUT_MS}，改用 ${DEFAULT_TEST_TIMEOUT_MS}`,
  );
}

console.log(
  `[test:studio] ${tests.length} offline test files, Node ${process.version}, per-test timeout ${testTimeoutMs}ms`,
);
try {
  const child = spawn(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=2",
      `--test-timeout=${testTimeoutMs}`,
      ...testArguments,
    ],
    { cwd: repoRoot, env, stdio: "inherit" },
  );
  const result = await new Promise((resolveResult, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveResult({ code, signal }));
  });
  if (result.signal) {
    console.error(`[test:studio] runner terminated by ${result.signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.code ?? 1;
  }
} finally {
  await rm(testHome, { recursive: true, force: true });
}
