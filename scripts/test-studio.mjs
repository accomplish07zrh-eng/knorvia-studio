#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { explicitTests, testDirectories } from "./studio-test-manifest.mjs";
import { CONTRACT_TESTS_ROOT, selectStudioTests } from "./studio-test-selection.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 契约测试要对源码入口与 dist 入口分别运行（计划书二.合同）。入口由收集器唯一决定并传导给测试进程，
// 取值不合法时在启动任何用例前失败，避免把错误配置静默当成源码入口跑出一片绿（规格 R9）。
const CONTRACT_ENTRY_ENV = "KNORVIA_CONTRACT_ENTRY";
const CONTRACT_ENTRY_VALUES = ["source", "dist"];
const DEFAULT_CONTRACT_ENTRY = "source";
function resolveContractEntry(value) {
  if (value === undefined || value === "") return DEFAULT_CONTRACT_ENTRY;
  if (!CONTRACT_ENTRY_VALUES.includes(value)) {
    throw new Error(
      `[test:studio] 无效的 ${CONTRACT_ENTRY_ENV}=${JSON.stringify(value)}；只接受 ${CONTRACT_ENTRY_VALUES.join(" | ")}`,
    );
  }
  return value;
}
let contractEntry;
try {
  contractEntry = resolveContractEntry(process.env[CONTRACT_ENTRY_ENV]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
// 收录范围 = 清单 + specs/contracts/*/tests 扫描；对账不一致会在启动测试前抛错，不静默少跑。
const { tests, argumentsList, contractTests } = await selectStudioTests({
  repoRoot,
  explicitTests,
  testDirectories,
});

const testHome = await mkdtemp(join(tmpdir(), "knorvia-studio-test-"));
const env = {
  ...process.env,
  KNORVIA_ENV: "test",
  KNORVIA_DATA_BASE_DIR: testHome,
  KNORVIA_STORAGE_DIR: join(testHome, "cli"),
  // 契约测试据此选择被测实现来自源码入口还是 dist 入口；未设置时按默认入口显式写入。
  [CONTRACT_ENTRY_ENV]: contractEntry,
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
if (contractTests.length > 0) {
  // 已合并的合同是否真的被跑到、按哪个入口跑，只能从这里看出来；没有合同时不打这一行（规格 R2、R8、R9）。
  console.log(
    `[test:studio] ${contractTests.length} contract test files from ${CONTRACT_TESTS_ROOT} (entry: ${contractEntry})`,
  );
}
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
      ...argumentsList,
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
