// 合并 main 后的仓库卫生检查。
//
// 起因：一次 merge main 后，main 上新加的文件（另一个 PR 加的）被静默丢掉，
// 而 `git diff origin/main --name-only` 把它算成「本分支的删除」，混在正常改动里看不出来。
// 因此删除项必须单独检查：只要出现「本分支没有有意删除」的文件，就是 merge 丢了东西。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** 本分支有意删除的文件（附依据）。新增删除项时必须在这里登记理由。 */
const INTENTIONAL_DELETIONS = new Map([
  [
    "apps/cli/packages/node-repl-host/test/runtime.test.mjs",
    "licensing/current-files.json 登记为 unreviewed；合同 known-differences 二.2 允许删除；旧门不运行它",
  ],
]);

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`FAIL  ${message}`);
};
const ok = (message) => console.log(`ok    ${message}`);

// 1. 删除项专项检查：本脚本存在的主要理由。
const deleted = git(["diff", "origin/main", "--diff-filter=D", "--name-only"])
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const unexpected = deleted.filter((path) => !INTENTIONAL_DELETIONS.has(path));
const missingIntentional = [...INTENTIONAL_DELETIONS.keys()].filter(
  (path) => !deleted.includes(path),
);
if (unexpected.length > 0) {
  fail(`出现未登记的删除（可能是 merge 丢了 main 的新文件）：${unexpected.join(", ")}`);
} else {
  ok(`删除项只有已登记的 ${deleted.length} 个`);
}
if (missingIntentional.length > 0) {
  fail(`登记的删除项已不存在，请更新本脚本：${missingIntentional.join(", ")}`);
}

// 2. 净改动概览：数量不是判据，只供人工核对。
const changed = git(["diff", "origin/main", "--name-only"]).split("\n").filter(Boolean);
console.log(`     净改动 ${changed.length} 项`);

// 3. licensing 下不得有冲突标记。
let markerTotal = 0;
try {
  const raw = execFileSync("git", ["grep", "-c", "-e", "^<<<<<<<", "--", "licensing/"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  for (const line of raw.split("\n").filter(Boolean)) {
    markerTotal += Number(line.slice(line.lastIndexOf(":") + 1));
  }
} catch {
  // git grep 无匹配时退出码为 1，属正常情形。
  markerTotal = 0;
}
if (markerTotal > 0) fail(`licensing/ 有 ${markerTotal} 处冲突标记`);
else ok("licensing/ 无冲突标记");

// 4. reviews.json 必须可解析。
const reviews = JSON.parse(readFileSync("licensing/reviews.json", "utf8"));
if (!Array.isArray(reviews.files)) fail("licensing/reviews.json 结构异常");
else ok(`reviews.json 可解析，${reviews.files.length} 条记录`);

// 5. 反斜杠路径：Windows 本地登记容易带进来。
const backslash = reviews.files.filter((entry) => String(entry.path ?? "").includes("\\"));
if (backslash.length > 0) fail(`reviews.json 含 ${backslash.length} 条反斜杠路径`);
else ok("reviews.json 无反斜杠路径");

console.log(failures === 0 ? "\n卫生检查通过" : `\n卫生检查失败：${failures} 项`);
process.exitCode = failures === 0 ? 0 : 1;
