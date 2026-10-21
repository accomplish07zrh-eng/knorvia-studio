#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 双重口径的相似度检查入口。
//
// 计划书 L509：「两道相似度对被替换的旧文件与上游固定提交都通过」——
// 也就是说 containment 是 `max(与旧文件, 与上游)`，两个比较对象缺一不可。
//
// 但直接用 similarity.mjs 时有三条路径组合，各有不同的静默失效方式：
//
//   | 写法                                        | 失效方式                              |
//   | ------------------------------------------- | ------------------------------------- |
//   | `--old apps/zcode-cli/... --old-rev main`   | 路径在 main 不存在 → 只算了上游       |
//   | `--old apps/cli/... --old-rev main`         | 改动已合并 → 自己比自己 → 恒为 1.000  |
//   | `--old apps/cli/... --old-rev <旧基点>`     | 正确                                  |
//
// 前两种都不会报错 —— 工具会沉默地退化成单比较。本脚本的职责就是把这两类静默失效
// 变成显式错误：
//
//   1. `--old` 必须在该 rev 存在，否则 error 退出（不静默回退）；
//   2. `--old` 的 blob 不能与候选文件相同，否则 error 退出（否则等于自己比自己）；
//   3. 必须显式给出 `--base-rev`（改动前的旧实现所在提交），不猜。
//
// 用法：
//   node scripts/provenance/similarity-check.mjs \
//     --base-rev <改动前基点> \
//     --upstream-dir <上游树> [--upstream-rev <rev>] \
//     --candidate <path> [--candidate <path> ...] | --candidate-list <file> \
//     [--json <file>] [--explain]
//
// 输出三组值：与旧文件 / 与上游 / 判定值（max）。

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

function usageError(message) {
  process.stderr.write(`similarity-check: ${message}\n`);
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    candidate: { type: "string", multiple: true },
    "candidate-list": { type: "string" },
    "base-rev": { type: "string" },
    "upstream-dir": { type: "string" },
    "upstream-rev": { type: "string" },
    repo: { type: "string" },
    gates: { type: "string" },
    json: { type: "string" },
    explain: { type: "boolean" },
    help: { type: "boolean" },
  },
});

if (values.help) {
  process.stdout.write(
    [
      "用法: node scripts/provenance/similarity-check.mjs [选项]",
      "",
      "  --base-rev <rev>          必需：改动前旧实现所在的提交（不猜，显式给）",
      "  --upstream-dir <dir>      必需：上游固定提交的树",
      "  --upstream-rev <rev>      可选：上游提交号，仅用于报告",
      "  --candidate <path>        候选文件，可重复；相对路径按 --repo 解析",
      "  --candidate-list <file>   每行一个候选路径",
      "  --repo <dir>              仓库根，默认当前目录",
      "  --gates <all|line|structural>",
      "  --json <file>             输出 JSON 报告",
      "  --explain                 透传 similarity 的逐行命中说明",
      "",
      "本脚本保证「旧文件」与「上游」两个比较对象都在场：",
      "  · --old 在该 rev 不存在        → 报错退出（不静默回退到只比上游）",
      "  · --old 的内容与候选完全相同   → 报错退出（否则等于自己比自己，恒为 1.000）",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

const repo = resolve(values.repo ?? process.cwd());
if (!values["base-rev"])
  usageError("--base-rev is required (the commit holding the pre-rework file)");
if (!values["upstream-dir"]) usageError("--upstream-dir is required");

const candidates = [...(values.candidate ?? [])];
if (values["candidate-list"]) {
  candidates.push(
    ...readFileSync(resolve(values["candidate-list"]), "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}
if (candidates.length === 0) usageError("no candidates: pass --candidate or --candidate-list");

/** 该路径在指定 rev 上是否存在。 */
function existsInRev(path, rev) {
  try {
    execFileSync("git", ["cat-file", "-e", `${rev}:${path}`], { cwd: repo, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 该路径在指定 rev 上的内容。 */
function contentInRev(path, rev) {
  return execFileSync("git", ["show", `${rev}:${path}`], { cwd: repo, encoding: "utf8" });
}

/** 该 rev 的提交日期，供报告核对基点是否正确。 */
function commitDate(rev) {
  try {
    return execFileSync("git", ["show", "-s", "--format=%cI", rev], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  } catch {
    return "(unknown)";
  }
}

// 先做全量前置校验：任何一项不成立就整体退出，避免「部分文件测了、部分静默退化」。
const resolvedBase = execFileSync("git", ["rev-parse", values["base-rev"]], {
  cwd: repo,
  encoding: "utf8",
}).trim();
const failures = [];
for (const candidate of candidates) {
  if (!existsSync(resolve(repo, candidate))) {
    failures.push(`${candidate}: 候选文件在工作区不存在`);
    continue;
  }
  if (!existsInRev(candidate, resolvedBase)) {
    failures.push(
      `${candidate}: 在 --base-rev ${values["base-rev"]} (${resolvedBase.slice(0, 8)}) 上不存在 —— ` +
        `无法取得「被替换的旧文件」，双重口径不成立`,
    );
    continue;
  }
  const oldText = contentInRev(candidate, resolvedBase);
  const currentText = readFileSync(resolve(repo, candidate), "utf8");
  if (oldText === currentText) {
    failures.push(
      `${candidate}: 工作区内容与 base-rev 完全相同 —— ` +
        `这是「自己比自己」，会恒得出 1.000，请确认 --base-rev 是否选在改动之前`,
    );
  }
}
if (failures.length > 0) {
  process.stderr.write("similarity-check: 前置校验失败，未执行任何测量：\n");
  for (const failure of failures) process.stderr.write(`  · ${failure}\n`);
  process.exit(2);
}

process.stdout.write(
  `similarity-check: base-rev ${values["base-rev"]} (${resolvedBase.slice(0, 8)}, ${commitDate(resolvedBase)})\n`,
);
process.stdout.write(
  `                 候选 ${candidates.length} 个；两个比较对象（旧文件 + 上游）均在位\n\n`,
);

/** 跑一次 similarity.mjs，返回其 stdout。 */
function runSimilarity(extraArgs) {
  const args = [
    "scripts/provenance/similarity.mjs",
    "--repo",
    repo,
    ...extraArgs,
    "--upstream-dir",
    resolve(values["upstream-dir"]),
    ...(values["upstream-rev"] ? ["--upstream-rev", values["upstream-rev"]] : []),
    "--gates",
    values.gates ?? "all",
  ];
  try {
    return execFileSync(process.execPath, args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

/** 从 similarity 的输出里取某个候选的结论行。 */
function verdictFor(output, candidate) {
  const line = output
    .split("\n")
    .find((row) => row.includes(candidate) && /^(PASS|FAIL)/u.test(row));
  if (!line) return null;
  const number = (pattern) => {
    const match = pattern.exec(line);
    return match ? Number(match[1]) : null;
  };
  return {
    containment: number(/containment=([\d.]+)/u),
    pass: line.startsWith("PASS"),
    raw: line,
    run: number(/run=(\d+)/u),
    structural: number(/structural=([\d.]+)/u),
    verdict: line.startsWith("PASS") ? "PASS" : "FAIL",
  };
}

const rows = [];
for (const candidate of candidates) {
  // 只比旧文件：把上游换成同一份旧文件树不可行，所以用 --old 单侧 + 空上游成本高；
  // 这里改为两次调用：双重（旧+上游）与仅上游，差值即可看出旧文件的影响。
  const dual = runSimilarity([
    "--candidate",
    candidate,
    "--old",
    candidate,
    "--old-rev",
    values["base-rev"],
    ...(values.explain ? ["--explain"] : []),
  ]);
  const upstreamOnly = runSimilarity([
    "--candidate",
    candidate,
    ...(values.explain ? ["--explain"] : []),
  ]);
  const dualVerdict = verdictFor(dual, candidate);
  const upstreamVerdict = verdictFor(upstreamOnly, candidate);
  rows.push({ candidate, dual: dualVerdict, dualOutput: dual, upstreamOnly: upstreamVerdict });
}

process.stdout.write("=== 判定（双重口径 = max(旧文件, 上游)）===\n");
for (const row of rows) {
  const dual = row.dual;
  const upstream = row.upstreamOnly;
  const verdict = dual?.verdict ?? "(no verdict)";
  const containment = dual?.containment == null ? "n/a" : dual.containment.toFixed(3);
  const run = dual?.run ?? "n/a";
  const upstreamContainment =
    upstream?.containment == null ? "n/a" : upstream.containment.toFixed(3);
  process.stdout.write(
    `${verdict.padEnd(5)} ${row.candidate}\n` +
      `        双重 containment=${containment} run=${run}` +
      `   仅上游 containment=${upstreamContainment} run=${upstream?.run ?? "n/a"}\n`,
  );
}

const failed = rows.filter((row) => row.dual?.verdict !== "PASS");
if (values.json) {
  writeFileSync(
    resolve(values.json),
    `${JSON.stringify(
      {
        baseRev: values["base-rev"],
        baseRevResolved: resolvedBase,
        failed: failed.length,
        passed: rows.length - failed.length,
        rows: rows.map((row) => ({
          candidate: row.candidate,
          dual: row.dual
            ? {
                containment: row.dual.containment,
                pass: row.dual.pass,
                run: row.dual.run,
                structural: row.dual.structural,
              }
            : null,
          upstreamOnly: row.upstreamOnly
            ? {
                containment: row.upstreamOnly.containment,
                pass: row.upstreamOnly.pass,
                run: row.upstreamOnly.run,
              }
            : null,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

process.stdout.write(
  `\nsimilarity-check: ${rows.length - failed.length} passed, ${failed.length} failed（双重口径）\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
