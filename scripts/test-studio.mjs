#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDirectories = [
  "packages/services/test",
  "packages/ui/test",
  "packages/desktop/test",
  "packages/shared/test",
  "packages/rpc/test",
  "apps/cli/packages/core/test",
  "apps/cli/packages/adapters/test",
  "apps/cli/packages/plugin-creator-plugin/test",
  "apps/cli/packages/node-repl-host/test",
];
const tests = ["scripts/knorvia-agent-base.test.ts"];

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

console.log(`[test:studio] ${tests.length} offline test files, Node ${process.version}`);
try {
  const child = spawn(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=2",
      ...tests,
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
