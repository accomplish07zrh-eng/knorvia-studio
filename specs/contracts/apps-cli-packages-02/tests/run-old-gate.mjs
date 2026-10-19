// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-02 旧门：在旧实现（源码入口与 dist 入口）上跑契约测试，生成 gate-old.json。
//
// 用法（仓库根目录，先跑 pnpm build:cli-packages 生成 dist）：
//   node specs/contracts/apps-cli-packages-02/tests/run-old-gate.mjs                 # 旧门（两种入口）
//   node specs/contracts/apps-cli-packages-02/tests/run-old-gate.mjs --with-stubs    # 附带桩替换验证
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const testsDir = join(contractDir, "tests");
const distEntries = [
  "apps/cli/packages/dynamic-workflow-runtime/dist/index.js",
  "apps/cli/packages/i18n/dist/index.js",
  "apps/cli/packages/shared-types/dist/index.js",
  "apps/cli/packages/telemetry/dist/index.js",
];

const contractVersion = "v1";
const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(testsDir, name));

function runContractTests(entry) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=120000", ...testFiles],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        KNORVIA_ACP02_ENTRY: entry === "dist" ? "dist" : "source",
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
    entry,
    exitCode: result.status,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
    outputTail: output.trim().split(/\r?\n/).slice(-16).join("\n"),
  };
}

for (const entry of distEntries) {
  const absolute = resolve(repoRoot, entry);
  if (!existsSync(absolute)) {
    throw new Error(`dist 入口不存在：${entry}（先跑 pnpm build:cli-packages）`);
  }
}

const source = runContractTests("source");
const dist = runContractTests("dist");
const gate = {
  contract: "apps-cli-packages-02",
  version: contractVersion,
  commit: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  generatedAt: new Date().toISOString(),
  testFiles: testFiles.map((file) => file.replace(`${repoRoot}/`, "").replace(/\\/gu, "/")),
  caseCount: source.tests,
  pass: source.pass,
  fail: source.fail,
  preRegisteredDifferences: [
    "node-repl-host/src/broker-transaction.ts 的相似度返工归 #197，不在本包合同与重写范围（known-differences.md §一.4、§五.1）",
    "node-repl-host 的 dist 模式仍加载 src/tool-contract.ts：该包 exports 指向 src，构建只产出 dist/mcp/server.js（known-differences.md §四）",
    "node-repl-host/test/runtime.test.mjs 为 unreviewed 继承测试，本包不在旧门中运行（known-differences.md §二）",
  ],
  assertionsRelaxed: false,
  entries: { source, dist },
  stubReplacement: null,
};

if (process.argv.includes("--with-stubs")) {
  execFileSync(process.execPath, [join(contractDir, "stubs/apply.mjs"), "--apply"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  try {
    const stubbed = runContractTests("source");
    gate.stubReplacement = {
      tests: stubbed.tests,
      pass: stubbed.pass,
      fail: stubbed.fail,
      skipped: stubbed.skipped,
      allFail:
        stubbed.tests !== null &&
        stubbed.pass === 0 &&
        stubbed.fail === stubbed.tests &&
        stubbed.tests > 0,
      outputTail: stubbed.outputTail,
    };
    writeFileSync(
      join(contractDir, "stub-gate.json"),
      `${JSON.stringify(
        {
          contract: "apps-cli-packages-02",
          version: contractVersion,
          mode: "source",
          command:
            "node stubs/apply.mjs --apply; node --import tsx --test --test-concurrency=1 --test-timeout=120000 tests/*.test.mjs; node stubs/apply.mjs --restore",
          node: process.version,
          generatedAt: new Date().toISOString(),
          ...gate.stubReplacement,
          note: "桩门只跑 source 模式：桩安装在 src/，替换 dist 没有意义（known-differences.md §四）。",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } finally {
    execFileSync(process.execPath, [join(contractDir, "stubs/apply.mjs"), "--restore"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

writeFileSync(join(contractDir, "gate-old.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");

const oldGateOk =
  source.tests !== null &&
  source.fail === 0 &&
  source.pass === source.tests &&
  source.skipped === 0 &&
  dist.tests !== null &&
  dist.fail === 0 &&
  dist.pass === dist.tests &&
  dist.skipped === 0 &&
  (gate.stubReplacement === null || gate.stubReplacement.allFail);

console.log(
  `contract source ${source.pass}/${source.tests} fail ${source.fail} skipped ${source.skipped}`,
);
console.log(`contract dist ${dist.pass}/${dist.tests} fail ${dist.fail} skipped ${dist.skipped}`);
if (gate.stubReplacement) {
  console.log(
    `contract stubs ${gate.stubReplacement.pass}/${gate.stubReplacement.tests} fail ${gate.stubReplacement.fail} allFail ${gate.stubReplacement.allFail}`,
  );
}
console.log(oldGateOk ? "old-gate PASS" : "old-gate FAIL");
process.exit(oldGateOk ? 0 : 1);
