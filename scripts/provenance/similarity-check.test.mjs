// similarity-check.mjs 的防护测试。
//
// 本脚本存在的理由是「双重口径的两个比较对象必须都在场」，
// 而 similarity.mjs 在 `--old` 缺失时会静默退化成只比上游。
// 因此这里重点验证两类静默失效都变成显式错误。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const tool = join(repoRoot, "scripts/provenance/similarity-check.mjs");

/** 跑本脚本，返回 { status, stderr, stdout }。 */
function run(args) {
  try {
    return {
      status: 0,
      stderr: "",
      stdout: execFileSync(process.execPath, [tool, ...args], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return { status: error.status, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  }
}

test("拒绝「自己比自己」：--base-rev 里的内容与工作区完全相同时报错退出", () => {
  // 取一个已提交且工作区无改动的文件；用 HEAD 作为 base-rev 必然与工作区相同。
  const tracked = execFileSync(
    "git",
    ["ls-files", "--", "apps/cli/packages/core/src/tool/executor/deadline/handler-settlement.ts"],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  assert.ok(tracked, "需要该文件被跟踪");
  const dirty = execFileSync("git", ["status", "--porcelain", "--", tracked], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  // 工作区若已改动，本用例的前提（未改动）不成立，跳过。
  if (dirty) return;

  const result = run([
    "--repo",
    repoRoot,
    "--base-rev",
    "HEAD",
    "--upstream-dir",
    join(repoRoot, "apps/cli/packages"),
    "--candidate",
    tracked,
  ]);
  // 「自基线未改动」不是配置错误：它表示该文件未重写 → 与旧文件相似度恒 1.000 → 不达标。
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /自基线未改动/u);
  assert.match(result.stdout, /未重写，不达标/u);
});

test("缺少 --base-rev 时直接报错，不猜基点", () => {
  const result = run([
    "--repo",
    repoRoot,
    "--upstream-dir",
    join(repoRoot, "apps/cli/packages"),
    "--candidate",
    "apps/cli/packages/core/src/tool/executor/deadline/handler-settlement.ts",
  ]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /--base-rev is required/u);
});

test("候选在 base-rev 上不存在时报错，不静默退化成只比上游", () => {
  const dir = mkdtempSync(join(tmpdir(), "knorvia-similarity-check-"));
  try {
    // 造一个「只在工作区存在、base-rev 里没有」的候选。
    const relative = "apps/cli/packages/core/src/tool/executor/deadline/__check_probe__.ts";
    const absolute = join(repoRoot, relative);
    mkdirSync(join(repoRoot, "apps/cli/packages/core/src/tool/executor/deadline"), {
      recursive: true,
    });
    writeFileSync(absolute, "export const probe = 1;\n", "utf8");
    try {
      const result = run([
        "--repo",
        repoRoot,
        "--base-rev",
        "HEAD",
        "--upstream-dir",
        join(repoRoot, "apps/cli/packages"),
        "--candidate",
        relative,
      ]);
      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, /不存在/u);
      assert.match(result.stderr, /双重口径不成立/u);
    } finally {
      rmSync(absolute, { force: true });
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
