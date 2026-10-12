// SPDX-License-Identifier: Apache-2.0
// core-tool-01 旧门：在旧实现上分别用源码入口与 dist 入口跑同一套契约测试。
//
// 用法（仓库根目录，Node 24.14.0）：
//   pnpm build:cli-packages
//   node specs/contracts/core-tool-01/tests/run-old-gate.mjs
//   node specs/contracts/core-tool-01/tests/run-old-gate.mjs --entry dist
//   node specs/contracts/core-tool-01/tests/run-old-gate.mjs --json specs/contracts/core-tool-01/gate-old.json
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const loader = join(contractDir, "dist-entry-loader.mjs");
// Windows 上把绝对路径交给 node --test 会被当成 d: 协议；统一用相对仓库根的 POSIX 路径。
const toRepoPath = (absolute) => relative(repoRoot, absolute).split(sep).join("/");
const testFiles = readdirSync(here)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => toRepoPath(join(here, name)));
const loaderPath = toRepoPath(loader);

const entry =
  process.argv.includes("--entry") && process.argv[process.argv.indexOf("--entry") + 1] === "dist"
    ? "dist"
    : "source";
const jsonIndex = process.argv.indexOf("--json");
const jsonPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : null;

function runContractTests(selected) {
  const imports = ["--import", "tsx"];
  if (selected === "dist") imports.push("--import", `./${loaderPath}`);
  const result = spawnSync(
    process.execPath,
    [...imports, "--test", "--test-concurrency=1", "--test-timeout=60000", ...testFiles],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: join(repoRoot, "packages/ui/tsconfig.json"),
        KNORVIA_ENV: "test",
      },
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const count = (label) => {
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    entry: selected,
    exitCode: result.status,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    outputTail: output.trim().split(/\r?\n/).slice(-12).join("\n"),
  };
}

const result = runContractTests(entry);
console.log(JSON.stringify(result, null, 2));
if (jsonPath) {
  writeFileSync(resolve(repoRoot, jsonPath), `${JSON.stringify(result, null, 2)}\n`);
}
process.exitCode = result.fail === 0 && result.skipped === 0 ? 0 : 1;
