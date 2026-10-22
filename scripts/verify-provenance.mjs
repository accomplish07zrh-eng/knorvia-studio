// Provenance 增量检查：只核对「本次分支改动过的文件」是否已登记且 sha256 匹配。
//
// 为什么需要它：CI 的 `Check file provenance inventory` 用全量比对（约 63 秒，
// 要遍历 1.8 万个文件），所以本地 push 前几乎没人跑。结果是「改了文件但忘了
// 重新生成清单」这类错误要等 20–30 分钟的 CI 才暴露。
//
// 本脚本只做增量：把 `origin/main...HEAD` 的改动文件逐个重算 sha256 并与
// `licensing/current-files.json` 里的登记比对 —— 单个文件是毫秒级，整批通常 < 1 秒。
//
// 它不替代 `pnpm provenance:check`：全量检查还能发现「未改动文件被外部改了」
// 这类问题，而增量检查只覆盖本次改动。提交前跑全量仍然是权威做法。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repo = process.argv[2] ?? process.cwd();
const INVENTORY = "licensing/current-files.json";
const BASE = "origin/main";

/**
 * 跑一条 git 命令并返回标准输出。
 *
 * @param args - git 子命令与参数。
 * @returns 标准输出（已去掉末尾换行）。
 */
function git(args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();
}

/**
 * 计算文件的 sha256。
 *
 * @param absolutePath - 文件的绝对路径。
 * @returns 十六进制摘要。
 */
function sha256Of(absolutePath) {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

const inventoryPath = join(repo, INVENTORY);
if (!existsSync(inventoryPath)) {
  console.error(`找不到 ${INVENTORY}；先运行 pnpm provenance:report`);
  process.exit(1);
}
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const byPath = new Map((inventory.files ?? []).map((entry) => [entry.path, entry]));

// 只取 Added / Copied / Modified / Renamed：删除的文件不需要 sha 比对。
let changed = [];
try {
  const raw = git(["diff", "--name-only", "--diff-filter=ACMR", `${BASE}...HEAD`]);
  changed = raw === "" ? [] : raw.split("\n").filter((line) => line !== "");
} catch (error) {
  console.error(`无法计算 ${BASE}...HEAD 的改动：${error.message}`);
  console.error("（若远端 main 尚未取回，先运行 git fetch origin）");
  process.exit(1);
}

// 工作区里还有未提交改动时，逐个也纳入检查 —— 那些才是最容易忘记登记的部分。
const workingTree = git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])
  .split("\n")
  .filter(Boolean);
const staged = git(["diff", "--name-only", "--diff-filter=ACMR", "--cached"])
  .split("\n")
  .filter(Boolean);
const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
const candidates = [...new Set([...changed, ...workingTree, ...staged, ...untracked])];

if (candidates.length === 0) {
  console.log("provenance 增量检查：本次没有文件改动，跳过。");
  process.exit(0);
}

const problems = [];
for (const path of candidates) {
  const record = byPath.get(path);
  if (record === undefined) {
    problems.push(`${path}：未在清单中登记`);
    continue;
  }
  // 清单自己与 reviews.json 的条目按设计不带 sha256（无法记录自身哈希，
  // 或由专门的自引用检查负责），比对它们的 sha 只会产生噪声。
  const selfDescribing = record.sha256 === undefined || record.sha256 === null;
  if (selfDescribing) continue;
  const absolute = join(repo, path);
  if (!existsSync(absolute)) continue; // 已删除的文件由全量 check 处理
  const actual = sha256Of(absolute);
  if (record.sha256 !== actual) {
    problems.push(
      `${path}：sha256 不匹配（磁盘 ${actual.slice(0, 12)}… ≠ 登记 ${String(record.sha256).slice(0, 12)}…）`,
    );
  }
  if (record.classification === undefined) {
    problems.push(`${path}：清单里缺 classification`);
  }
}

if (problems.length > 0) {
  console.error(`provenance 增量检查失败（${problems.length} 个问题）：`);
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error("\n运行 pnpm provenance:report 重新生成清单后重试。");
  process.exit(1);
}

console.log(`provenance 增量检查通过：${candidates.length} 个改动文件均已登记且 sha256 匹配。`);
console.log("（完整校验仍以 pnpm provenance:check 为准。）");
