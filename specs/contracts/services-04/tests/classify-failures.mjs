// SPDX-License-Identifier: Apache-2.0
// 失败类型分类：跑一次桩替换，把「每个失败用例」按首个错误类型归类。
//
// 背景（见 known-differences.md §4.4）：
// `services-04` 有 2 个包级聚合桶（`index.ts` / `node.ts`）不在桩替换范围，
// 但它们的转发目标被桩替换后会连带失效 → 桩替换后的失败有两种合规形态：
//   A. 断言失败（测试跑完，断言不成立）
//   B. 加载失败（模块或其引用的聚合桶在 import 阶段抛错）
//
// ⚠️ 为什么不直接读 gate-old.json 的 outputTail：
//    那个字段只保留**尾部 14 行**（截断的），不含完整用例列表。
//    所以本脚本自行跑一次桩替换，拿到**完整输出**后再分类。
//    跑完必须还原源码（用 try/finally 保证）。
//
// 用法：node --import tsx specs/contracts/services-04/tests/classify-failures.mjs
// 输出：写回 gate-old.json 的 `failureKinds` 字段（不改动既有字段）
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const contractDir = join(here, "..");
const repoRoot = join(contractDir, "../../..");
const stubsDir = join(contractDir, "stubs");
const targetsFile = join(stubsDir, "targets.txt");
const gatePath = join(contractDir, "gate-old.json");

const STUB_MARKERS = {
  loadFailure: ["not implemented: services-04", "ERR_MODULE_NOT_FOUND", "Cannot find module"],
  assertionFailure: ["AssertionError", "ERR_ASSERTION"],
};

function classify(errorText) {
  for (const marker of STUB_MARKERS.loadFailure) {
    if (errorText.includes(marker)) return "loadFailure";
  }
  for (const marker of STUB_MARKERS.assertionFailure) {
    if (errorText.includes(marker)) return "assertionFailure";
  }
  return "other";
}

const targets = readFileSync(targetsFile, "utf8").trim().split("\n").filter(Boolean);

/** 与 `scripts/contract-gate.mjs` 的 `runTests` 保持一致的测试文件清单与顺序。 */
const TEST_FILES = [
  "specs/contracts/services-04/tests/surface.test.mjs",
  "specs/contracts/services-04/tests/purity.test.mjs",
  "specs/contracts/services-04/tests/dependencies.test.mjs",
  "specs/contracts/services-04/tests/typecheck.test.mjs",
];

// ── 1. 备份 → 桩替换 → 跑测试 → 还原
const backup = join(repoRoot, ".tmp-classify-backup");
rmSync(backup, { recursive: true, force: true });
mkdirSync(backup, { recursive: true });

let output = "";
try {
  for (const rel of targets) {
    const dst = join(backup, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(repoRoot, rel), dst);
  }
  for (const rel of targets) {
    copyFileSync(join(stubsDir, rel), join(repoRoot, rel));
  }

  // ── 自检：确认桩真的替换进去了（否则跑出来是假绿）
  const probe = readFileSync(join(repoRoot, targets[0]), "utf8");
  if (!probe.includes("not implemented: services-04")) {
    throw new Error(`桩替换自检失败：${targets[0]} 里没有桩标记（替换未生效）`);
  }

  try {
    output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=60000", ...TEST_FILES],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 256 * 1024 * 1024,
      },
    );
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
} finally {
  // 无论成败都还原
  if (existsSync(backup)) {
    for (const rel of targets) {
      const src = join(backup, rel);
      if (existsSync(src)) copyFileSync(src, join(repoRoot, rel));
    }
    rmSync(backup, { recursive: true, force: true });
  }
}

// ── 2. 解析完整输出，按用例切分
//
// node:test 的输出分两段（实测确认）：
//   ① 执行段：`  ✖ <用例名> (123.4ms)` —— 只有名字和耗时，没有错误详情
//   ② 详情段：`✖ failing tests:` 之后，每个用例形如
//        test at specs\...\xxx.test.mjs:65:3
//        ✖ <用例名> (2563.0787ms)
//          AssertionError [ERR_ASSERTION]: ...     ← 这里才是错误类型
//
// 所以必须从**详情段**解析，不能从执行段。
const clean = output.replace(/\u001b\[[0-9;]*m/gu, "");
const lines = clean.split("\n");

const summary = {};
for (const line of lines) {
  const m = /^\s*ℹ\s+(tests|pass|fail|suites)\s+(\d+)/u.exec(line);
  if (m) summary[m[1]] = Number(m[2]);
}

// 找「failing tests」段的起点
const failingHeaderIndex = lines.findIndex((line) => /^✖\s+failing tests:/u.test(line.trim()));
const detailLines = failingHeaderIndex >= 0 ? lines.slice(failingHeaderIndex + 1) : [];

const CASE_RE = /^\s*✖\s+(.+?)\s+\(\d+(?:\.\d+)?ms\)\s*$/u;
const AT_RE = /^\s*test at\s+(.+?):\d+:\d+\s*$/u;

const perCase = [];
for (let i = 0; i < detailLines.length; i += 1) {
  const match = CASE_RE.exec(detailLines[i]);
  if (match === null) continue;
  const title = match[1].trim();

  // ⚠️ 去重键必须是「用例所在文件 + 标题」，不能只用标题：
  //    `B0 全部 46 个实现文件必须可加载（运行期守卫前置）` 在 surface / purity /
  //    dependencies 三个文件里同名，只用标题去重会丢掉 2 个用例（35 → 33）。
  const atLine = detailLines
    .slice(Math.max(0, i - 3), i)
    .find((line) => AT_RE.test(line.trim()))
    ?.trim();
  const atFile =
    atLine !== undefined ? AT_RE.exec(atLine)?.[1]?.replace(/^\.\/|[\\/]/gu, "/") : "(unknown)";
  const key = `${atFile}::${title}`;
  if (perCase.some((entry) => entry.key === key)) continue;

  // 该用例的错误块：从下一行到下一个 `test at` 或下一个 `✖ …ms`
  const blockLines = [];
  for (let j = i + 1; j < detailLines.length; j += 1) {
    if (AT_RE.test(detailLines[j].trim()) || CASE_RE.test(detailLines[j])) break;
    blockLines.push(detailLines[j]);
  }
  const blockText = blockLines.join("\n");
  const firstErrorLine =
    blockLines
      .find((line) => /\S/u.test(line) && !/^\s*at\s/u.test(line))
      ?.trim()
      .slice(0, 200) ?? "(无错误行)";

  perCase.push({
    key,
    file: atFile,
    title,
    kind: classify(blockText),
    firstErrorLine,
    atLine: atLine ?? null,
  });
}

// 收集所有用例名（从测试文件），用于区分「用例」与「套件名」
const TEST_SOURCES = {
  "surface.test.mjs": "specs/contracts/services-04/tests/surface.test.mjs",
  "purity.test.mjs": "specs/contracts/services-04/tests/purity.test.mjs",
  "dependencies.test.mjs": "specs/contracts/services-04/tests/dependencies.test.mjs",
  "typecheck.test.mjs": "specs/contracts/services-04/tests/typecheck.test.mjs",
};
const knownCases = new Set();
for (const rel of Object.values(TEST_SOURCES)) {
  const text = readFileSync(join(repoRoot, rel), "utf8");
  for (const m of text.matchAll(/test\("([^"]+)"/gu)) knownCases.add(m[1]);
}

const casesOnly = perCase.filter((entry) => knownCases.has(entry.title));
const suitesOnly = perCase.filter((entry) => !knownCases.has(entry.title));

const counts = { loadFailure: 0, assertionFailure: 0, other: 0 };
for (const entry of casesOnly) counts[entry.kind] += 1;

const report = {
  ranAt: new Date().toISOString(),
  gateSummary: {
    replacedFiles: targets.length,
    tests: summary.tests ?? null,
    pass: summary.pass ?? null,
    fail: summary.fail ?? null,
    allFail: summary.fail !== undefined && summary.pass === 0,
  },
  classifiedCases: casesOnly.length,
  loadFailures: counts.loadFailure,
  assertionFailures: counts.assertionFailure,
  other: counts.other,
  // 用例（35 个）与套件名（4 个）分开记录 —— 套件名失败不算「用例失败」
  perCase: casesOnly,
  suiteEntries: suitesOnly.map((entry) => entry.title),
  limitation:
    "本脚本按「每个失败用例的首个错误行」归类；一个用例若同时含加载失败与断言失败，按加载失败计。" +
    '`other` 类需人工复核。用例名从测试文件里提取（`test("...")`），' +
    "用于把 node:test 输出里的套件名（如 `surface（source 入口）`）从用例计数中排除。",
};

// ── 3. 写回 gate-old.json
if (existsSync(gatePath)) {
  const raw = JSON.parse(readFileSync(gatePath, "utf8"));
  raw.failureKinds = report;
  writeFileSync(gatePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  console.log(`已写回 ${gatePath} 的 failureKinds 字段`);
} else {
  console.log("gate-old.json 不存在，未写回（请先跑一次 contract-gate）");
}

// ── 4. 打印
console.log("");
console.log("=== 失败类型分类（桩替换 46 个文件）===");
console.log(`测试汇总: ${JSON.stringify(summary)}`);
console.log(`分类到的用例: ${report.classifiedCases}`);
console.log(`  B 类 加载失败:     ${report.loadFailures}`);
console.log(`  A 类 断言失败:     ${report.assertionFailures}`);
console.log(`  other（需复核）:   ${report.other}`);
console.log("");
for (const entry of perCase) console.log(`  [${entry.kind}] ${entry.title}`);
if (summary.fail !== undefined && report.classifiedCases !== summary.fail) {
  console.log("");
  console.log(
    `⚠️ 分类数 ${report.classifiedCases} ≠ 门禁 fail ${summary.fail}（输出解析可能漏了用例）`,
  );
}
