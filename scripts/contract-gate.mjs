#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// 合同旧门的通用跑法：在**旧实现**上分别用「源码入口」与「dist 入口」跑契约测试，并把结果写成
// 统一的 gate-old.json。目的是让每个包的旧门做法与记录格式一致，避免每个包各写一遍跑测脚本。
//
// 用法（仓库根目录，Node 24）：
//   node scripts/contract-gate.mjs --contract specs/contracts/core-hooks \
//     [--env KEY=VALUE]... [--dist-loader <相对路径>] [--json <输出文件>] \
//     [--source-from dist|src] [--build] [--stub-root <目录>] [--stub-map <映射文件>] [--stub-targets <清单文件>]
//
// 说明：
// - 测试文件默认取 `<合同目录>/tests/*.test.ts`（也可 `--tests` 指定 glob 文本，支持 `*`）。
// - `--dist-loader` 给出一个 ESM loader（相对仓库根），dist 入口会用 `--import <loader>` 跑同一份测试；
//   没有给时只跑源码入口并在报告里注明 `distSkipped: true`。
// - `--stub-root` + `--stub-map`/`--stub-targets` 用于「桩替换后契约测试必须全失败」的验证：
//   桩目录里的文件按相对路径覆盖目标文件（映射文件每行 `<桩内相对路径> -> <仓库相对路径>`；缺省按同名覆盖）。
// - 结果写进 `--json`（默认 `<合同目录>/gate-old.json`），字段见脚本末尾 buildReport()。
// - 退出码：0 = 两种入口都通过（且桩替换验证通过，若启用）；1 = 有失败；2 = 用法错误。
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const argv = process.argv.slice(2);
const options = {
  env: [],
  distEnv: [],
  tests: null,
  distLoader: null,
  json: null,
  sourceFrom: "src",
  build: false,
  stubRoot: null,
  stubMap: null,
  stubTargets: null,
  contract: null,
};
for (let index = 0; index < argv.length; index += 1) {
  const flag = argv[index];
  const value = () => {
    const next = argv[++index];
    if (next === undefined) {
      console.error(`contract-gate: ${flag} 需要一个值`);
      process.exit(2);
    }
    return next;
  };
  if (flag === "--contract") options.contract = value();
  else if (flag === "--env") options.env.push(value());
  else if (flag === "--dist-env") options.distEnv.push(value());
  else if (flag === "--tests") options.tests = value();
  else if (flag === "--dist-loader") options.distLoader = value();
  else if (flag === "--json") options.json = value();
  else if (flag === "--source-from") options.sourceFrom = value();
  else if (flag === "--build") options.build = true;
  else if (flag === "--stub-root") options.stubRoot = value();
  else if (flag === "--stub-map") options.stubMap = value();
  else if (flag === "--stub-targets") options.stubTargets = value();
  else if (flag === "--help" || flag === "-h") {
    console.log(
      readFileSync(new URL(import.meta.url))
        .toString()
        .split("\n")
        .slice(0, 22)
        .join("\n"),
    );
    process.exit(0);
  } else {
    console.error(`contract-gate: 未知参数 ${flag}`);
    process.exit(2);
  }
}
if (!options.contract) {
  console.error("contract-gate: 需要 --contract <合同目录>");
  process.exit(2);
}
const contractDir = resolve(repoRoot, options.contract);
if (!existsSync(contractDir)) {
  console.error(`contract-gate: 合同目录不存在：${options.contract}`);
  process.exit(2);
}
const testsDir = join(contractDir, "tests");
const testsPattern = options.tests ?? "*.test.ts";
const testFiles = existsSync(testsDir)
  ? readdirSync(testsDir)
      .filter((name) =>
        new RegExp(
          `^${testsPattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*")}$`,
          "u",
        ).test(name),
      )
      .sort()
      .map((name) => join(testsDir, name))
  : [];
if (testFiles.length === 0) {
  console.error(
    `contract-gate: 在 ${options.contract}/tests 下没有匹配 ${testsPattern} 的测试文件`,
  );
  process.exit(2);
}

const parseEnvironment = (items) => {
  const env = { ...process.env };
  // 若本工具自身是被 node --test 拉起的（例如自测），子进程会继承 NODE_TEST_CONTEXT，
  // 导致内层测试运行器不打印汇总行（tests/pass/fail 全部解析不到）。这里清掉它。
  delete env.NODE_TEST_CONTEXT;
  for (const item of items) {
    const separator = item.indexOf("=");
    env[item.slice(0, separator)] = item.slice(separator + 1);
  }
  return env;
};

function runTests(extraArgs, extraEnv) {
  // 兜底超时：用例级的 --test-timeout 只能判挂起的**用例**，抓不到「用例都过了但 runner
  // 退出阶段仍有活句柄」这一类挂死（合同测试的清理问题就属这一族）。所以外层再给一个
  // 远高于正常耗时的墙钟上限，且**超时一律判失败**（exitCode=1），不用 --test-force-exit
  // 掩盖——能自然退出就不该强杀；真挂死时夹具必须退回并修好清理。
  //
  // `KNORVIA_CONTRACT_GATE_TIMEOUT_MS` 只是本门禁脚本的**工具级**覆盖（默认 1800000ms），
  // 不是产品运行时变量，也不改变任何门禁通过条件；合同文档里的用途见 acceptance.md。
  const fallbackTimeoutMs = Number(process.env.KNORVIA_CONTRACT_GATE_TIMEOUT_MS ?? 1_800_000);
  const effectiveTimeoutMs =
    Number.isSafeInteger(fallbackTimeoutMs) && fallbackTimeoutMs > 0
      ? fallbackTimeoutMs
      : 1_800_000;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "--test-timeout=60000",
      ...extraArgs,
      ...testFiles,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...parseEnvironment(options.env), ...extraEnv },
      maxBuffer: 256 * 1024 * 1024,
      timeout: effectiveTimeoutMs,
      killSignal: "SIGKILL",
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  // 超时与被外部信号杀掉是两件事，必须分开记：都算失败（方向安全，绝不把失败写成通过），
  // 但混成一个 timedOut 会把「CI 取消 / OOM killer 发 SIGTERM」误报成「夹具挂死」，
  // 让后续排查抓错方向。timedOut 只认 spawnSync 自己的 ETIMEDOUT。
  const timedOut = result.error?.code === "ETIMEDOUT";
  const signaled = result.status === null && result.signal !== null;
  const count = (label) => {
    for (const line of output.split(/\r?\n/u)) {
      // node:test 的汇总行形如「ℹ tests 118」「ℹ pass 118」，取行内最后两个 token 即可。
      const match = /(\S+)\s+(\d+)$/u.exec(line.trim());
      if (match && match[1] === label) return Number(match[2]);
    }
    return null;
  };
  return {
    exitCode: timedOut || signaled ? 1 : (result.status ?? 1),
    timedOut,
    signaled,
    signal: result.signal ?? null,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
    outputTail: output.trim().split("\n").slice(-14).join("\n"),
  };
}

const commit = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const node = process.version;

if (options.build) {
  console.log("contract-gate: 先构建 CLI 包（pnpm build:cli-packages）…");
  // 构建走仓库既有入口 scripts/mise-run.mjs：它按 mise.toml 把 Node 钉到 24 并处理
  // Windows 的 pnpm.cmd 外壳。早先这里硬编码了某台机器的包装器绝对路径——CI 与其它
  // 机器上不存在，且属 AGENTS.md 禁止的个人工作目录泄漏。能复用既有入口就不造新开关。
  execFileSync(process.execPath, ["scripts/mise-run.mjs", "pnpm", "build:cli-packages"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

console.log(`contract-gate: 源码入口（${testFiles.length} 个测试文件）…`);
const source = runTests([], {});
console.log(
  `  tests=${source.tests} pass=${source.pass} fail=${source.fail} skipped=${source.skipped} exit=${source.exitCode}`,
);
if (source.exitCode !== 0) console.log(source.outputTail);

let dist = { distSkipped: true, reason: "未提供 --dist-loader 或 --dist-env" };
if (options.distLoader || options.distEnv.length > 0) {
  const extraArgs = [];
  if (options.distLoader) {
    const loaderPath = isAbsolute(options.distLoader)
      ? options.distLoader
      : join(repoRoot, options.distLoader);
    if (!existsSync(loaderPath)) {
      console.error(`contract-gate: dist loader 不存在：${options.distLoader}`);
      process.exit(2);
    }
    // node --import 在 Windows 上要求绝对路径是 file:// URL（裸 "D:\\..." 会被当作裸包名）。
    extraArgs.push("--import", pathToFileURL(loaderPath).href);
  }
  const entries = Object.fromEntries(
    options.distEnv.map((item) => [
      item.slice(0, item.indexOf("=")),
      item.slice(item.indexOf("=") + 1),
    ]),
  );
  console.log("contract-gate: dist 入口…");
  dist = runTests(extraArgs, entries);
  dist.environment = entries;
  dist.loader = options.distLoader ?? null;
  console.log(
    `  tests=${dist.tests} pass=${dist.pass} fail=${dist.fail} skipped=${dist.skipped} exit=${dist.exitCode}`,
  );
  if (dist.exitCode !== 0) console.log(dist.outputTail);
}

let stubReplacement = null;
if (options.stubRoot) {
  const stubRoot = resolve(repoRoot, options.stubRoot);
  const targets = options.stubTargets
    ? readFileSync(resolve(repoRoot, options.stubTargets), "utf8")
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((item) => resolve(repoRoot, item).split("\\").join("/"))
    : null;
  const map = new Map();
  if (options.stubMap) {
    for (const line of readFileSync(resolve(repoRoot, options.stubMap), "utf8").split(/\r?\n/u)) {
      const match = /^\s*(\S+)\s*->\s*(\S+)\s*$/u.exec(line);
      if (match) map.set(match[1], match[2]);
    }
  }
  const backup = mkdtempSync(join(tmpdir(), "contract-gate-stubs-"));
  const replaced = [];
  const restore = () => {
    replaced.forEach((target, index) => {
      try {
        copyFileSync(join(backup, index.toString()), resolve(repoRoot, target));
      } catch (error) {
        console.error(`contract-gate: 还原失败 ${target}: ${String(error)}`);
      }
    });
    rmSync(backup, { recursive: true, force: true });
  };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else {
        const inside = relative(stubRoot, absolute).split("\\").join("/");
        const absoluteTarget = resolve(repoRoot, relative(repoRoot, absolute))
          .split("\\")
          .join("/");
        const target =
          map.get(inside) ??
          (targets
            ? targets.find(
                (item) => item.endsWith(`/${inside}`) || item === inside || item === absoluteTarget,
              )
            : null);
        if (!target) continue;
        const targetPath = resolve(repoRoot, target);
        // Windows 上 cpSync 遇到已存在目标会失败（unlink 竞态），一律用 copyFileSync（覆盖写）。
        copyFileSync(targetPath, join(backup, replaced.length.toString()));
        copyFileSync(absolute, targetPath);
        replaced.push(target);
      }
    }
  };
  let stubbed;
  try {
    walk(stubRoot);
    console.log(`contract-gate: 桩替换 ${replaced.length} 个目标文件后重跑源码入口…`);
    stubbed = runTests([], {});
  } finally {
    restore();
  }
  stubReplacement = {
    replacedFiles: replaced.length,
    tests: stubbed?.tests ?? null,
    pass: stubbed?.pass ?? null,
    fail: stubbed?.fail ?? null,
    allFail: stubbed?.pass === 0,
    exitCode: stubbed?.exitCode ?? 1,
    outputTail: stubbed?.outputTail ?? "",
  };
  console.log(
    `  tests=${stubbed?.tests} pass=${stubbed?.pass} fail=${stubbed?.fail} allFail=${stubReplacement.allFail}`,
  );
}

const jsonPath = resolve(repoRoot, options.json ?? join(options.contract, "gate-old.json"));
writeFileSync(
  jsonPath,
  `${JSON.stringify({ contract: options.contract.split("/").pop(), commit, node, generatedAt: new Date().toISOString(), runner: "scripts/contract-gate.mjs", testFiles: testFiles.map((file) => relative(repoRoot, file).split("\\").join("/")), sourceFrom: options.sourceFrom, entries: { source, dist }, stubReplacement, pass: source.exitCode === 0 && (dist.distSkipped ? true : dist.exitCode === 0) }, null, 2)}\n`,
);
console.log(`contract-gate: 报告写入 ${relative(repoRoot, jsonPath)}`);

const ok =
  source.exitCode === 0 &&
  (dist.distSkipped ? true : dist.exitCode === 0) &&
  (stubReplacement ? stubReplacement.allFail : true);
process.exit(ok ? 0 : 1);
