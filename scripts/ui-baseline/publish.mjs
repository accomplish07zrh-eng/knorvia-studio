#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// 把截图产物发布到主仓孤立分支 ui-baseline：不进 main，每张图带生成时的提交。
// 用法：node scripts/ui-baseline/publish.mjs --from <截图目录> [--branch ui-baseline] [--message <附加说明>]
//       [--push|--no-push]
// 实现：在临时目录做一次本地 clone，checkout 孤立分支，覆盖内容后提交并推送；
// 不触碰当前工作树，也不动 main。
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const USAGE = `用法：node scripts/ui-baseline/publish.mjs --from <截图目录> [选项]
  --from <目录>       capture.mjs 的输出目录
  --branch <名称>     目标分支，默认 ui-baseline
  --message <说明>    追加到提交信息里的说明
  --no-push           只提交到本地临时 clone，不推送（用于演练）
  --help              显示本说明`;

function parseArguments(argv) {
  const options = { from: null, branch: "ui-baseline", message: null, push: true };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${argument} 需要一个取值`);
      return next;
    };
    if (argument === "--from") options.from = resolve(value());
    else if (argument === "--branch") options.branch = value();
    else if (argument === "--message") options.message = value();
    else if (argument === "--no-push") options.push = false;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  result.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  result.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolvePromise, rejectPromise) => {
    result.once("error", rejectPromise);
    result.once("exit", (code) => {
      if (code !== 0 && !allowFailure) {
        rejectPromise(new Error(`git ${args.join(" ")} 失败（退出码 ${code}）：${stderr.trim()}`));
        return;
      }
      resolvePromise({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!options.from) throw new Error(`--from 是必填\n\n${USAGE}`);
  const manifest = JSON.parse(await readFile(join(options.from, "manifest.json"), "utf8"));
  if (manifest.schema !== 1) throw new Error(`不支持的清单 schema：${manifest.schema}`);
  const commit = manifest.commit?.head ?? "unknown";
  const workspace = await mkdtemp(join(tmpdir(), "ui-baseline-publish-"));
  try {
    // 从本地仓库 clone 拿到对象，再把 origin 指回真正的远端：
    // 本地 clone 的 origin 是文件路径，直接推送只会写进本地仓库，不会到 GitHub。
    const remoteUrl = (await git(repoRoot, ["remote", "get-url", "origin"])).stdout;
    if (!remoteUrl) throw new Error("当前仓库没有 origin 远端，无法发布基线分支");
    await git(tmpdir(), ["clone", "--no-checkout", "--quiet", repoRoot, workspace]);
    await git(workspace, ["remote", "set-url", "origin", remoteUrl]);
    const remoteHasBranch =
      (await git(workspace, ["ls-remote", "--heads", "origin", options.branch])).stdout.length > 0;
    if (remoteHasBranch) {
      await git(workspace, ["fetch", "--quiet", "origin", options.branch]);
      await git(workspace, ["checkout", "--quiet", "-B", options.branch, "FETCH_HEAD"]);
    } else {
      await git(workspace, ["checkout", "--quiet", "--orphan", options.branch]);
      await git(workspace, ["rm", "--quiet", "-rf", "--ignore-unmatch", "."]);
    }
    // 只保留截图相关的产物：读原始目录内容而不是让 git 决定。
    const target = join(workspace, "ui-baseline");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(options.from, target, { recursive: true });
    await writeFile(
      join(workspace, "README.md"),
      [
        "# ui-baseline",
        "",
        "UI 截图基线（孤立分支，不进 main）。",
        "",
        `- 最近一次写入来自提交：\`${commit}\`（${manifest.commit?.headSubject ?? "无说明"}）`,
        `- 生成时间：${manifest.generatedAt}`,
        `- 页面清单：\`${manifest.pagesFile}\`（sha256 \`${manifest.pagesSha256}\`）`,
        `- 渲染环境：${manifest.environment?.platform}/${manifest.environment?.arch}，Chromium ${manifest.environment?.chromium?.version}`,
        "",
        "每张图旁边有一份同名 JSON：记录生成时的提交、几何快照与页面信号。",
        "比较方式：`node scripts/ui-baseline/compare.mjs --baseline <本目录>/ui-baseline --current <新截图目录>`。",
        "",
      ].join("\n"),
      "utf8",
    );
    await git(workspace, ["add", "-A"]);
    const status = await git(workspace, ["status", "--porcelain"]);
    if (status.stdout.length === 0) {
      console.log("[ui-baseline] 内容无变化，未产生新提交");
      return;
    }
    const message = [
      `chore(ui-baseline): 截图基线 @ ${commit.slice(0, 12)}`,
      "",
      `main 提交：${manifest.commit?.mainBase ?? "unknown"}`,
      `工作树提交：${commit}（${manifest.commit?.headSubject ?? ""}）`,
      `图片：${manifest.images?.length ?? 0} 张，主题 ${manifest.themes?.join("/")}，宽度 ${manifest.viewports?.map((viewport) => viewport.width).join("/")}`,
      options.message ? `\n${options.message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await git(workspace, [
      "-c",
      "user.name=knorvia-ui-baseline",
      "-c",
      "user.email=knorvia-ui-baseline@users.noreply.github.com",
      "commit",
      "--quiet",
      "-m",
      message,
    ]);
    const head = (await git(workspace, ["rev-parse", "HEAD"])).stdout;
    console.log(`[ui-baseline] 已在 ${options.branch} 生成提交 ${head}`);
    if (options.push) {
      await git(workspace, ["push", "--quiet", "origin", `HEAD:refs/heads/${options.branch}`]);
      console.log(`[ui-baseline] 已推送到 origin/${options.branch}`);
    } else {
      console.log("[ui-baseline] 跳过推送（--no-push）");
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
