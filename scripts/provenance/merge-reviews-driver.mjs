// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// `licensing/reviews.json` 的 git merge driver（union by path）。
//
// 为什么需要它：reviews.json 是「人工登记的真源」，每个新增文件的 PR 都会往里
// 追加记录。两个 PR 并行时它们改的是同一个 JSON 数组的不同位置，但 git 的行级
// 三方合并会把整个数组当作一个冲突块（数组元素之间只隔逗号），于是每次
// `merge main` 都要手工结构化合并一遍。实测这类冲突在一天内出现十余次，
// 每次约 5 分钟外加一轮 20-30 分钟的 CI。
//
// **不能用 `merge=ours`**：那会让本分支的 reviews.json 整体覆盖 main 的版本，
// 从而静默丢掉别人刚合入的登记——比冲突危险得多，因为它不报错。
//
// 所以这里用「按 path 取并集」：
//   · 两侧都有的 path → 保留 ours（本分支）那条：合并方要为自己刚改的文件重新
//     登记，而 main 侧那条针对的是同一文件的旧状态
//   · 只有一边有的 path → 直接保留
//
// 合并后仍**必须**跑 `provenance:report`：
//   · 清单（current-files.json）会据此重建
//   · 已删除文件的悬空登记由 report 的 missingReviews 检查兜底
//   · 被 merge 覆盖的旧指纹由 report 重新计算（reviewProblems 会先暴露 stale）
//
// 用法（由 .gitattributes 的 `merge=union-reviews` 触发，git 传 4-5 个参数）：
//   %O = base 版本临时文件   %A = ours（结果写回这里）   %B = theirs
//   %L = 冲突标记长度        %P = 该文件在仓库里的路径

import { readFileSync, writeFileSync } from "node:fs";

/** 读取 JSON；文件不存在或为空时返回 undefined（git 在「新增文件」场景会传空文件）。 */
function readJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  if (text.trim() === "") return undefined;
  return JSON.parse(text);
}

/**
 * 把两侧的 `files` 数组合并成「按 path 取并集」。
 *
 * 顺序：先按 ours 的原始顺序输出 ours 的条目，再按 theirs 的原始顺序追加仅
 * theirs 才有的条目。这样在「无冲突合并」时 ours 的 diff 最小，便于 review。
 */
function unionFiles(oursFiles, theirsFiles) {
  const seen = new Set(oursFiles.map((record) => record.path));
  const merged = [...oursFiles];
  for (const record of theirsFiles) {
    if (seen.has(record.path)) continue;
    seen.add(record.path);
    merged.push(record);
  }
  return merged;
}

/**
 * 合并顶层对象：以 ours 的键为骨架，缺失的键从 theirs 补。
 * reviews.json 的顶层除 `files` 外只有 schema 版本之类的常量，两边应一致；
 * 若不一致保留 ours（本分支基于较新的 report 生成）。
 */
function mergeTopLevel(ours, theirs) {
  const merged = { ...ours };
  for (const [key, value] of Object.entries(theirs)) {
    if (key === "files") continue;
    if (!(key in merged)) merged[key] = value;
  }
  return merged;
}

function main() {
  const [, , basePath, oursPath, theirsPath] = process.argv;
  if (!oursPath) {
    process.stderr.write("merge-reviews-driver: 缺少 %A 参数\n");
    process.exit(1);
  }

  const ours = readJson(oursPath);
  const theirs = readJson(theirsPath);

  // 一侧缺失（新增文件场景）→ 直接取另一侧。
  if (theirs === undefined) process.exit(0); // 保留 ours
  if (ours === undefined) {
    writeFileSync(oursPath, readFileSync(theirsPath, "utf8"), "utf8");
    process.exit(0);
  }

  const oursFiles = Array.isArray(ours.files) ? ours.files : [];
  const theirsFiles = Array.isArray(theirs.files) ? theirs.files : [];

  // base 只用于诊断输出：区分「theirs 新增」与「base 里就有」。
  const base = readJson(basePath);
  const basePaths = new Set(
    Array.isArray(base?.files) ? base.files.map((record) => record.path) : [],
  );

  const merged = mergeTopLevel(ours, theirs);
  merged.files = unionFiles(oursFiles, theirsFiles);

  const oursPaths = new Set(oursFiles.map((record) => record.path));
  const addedFromTheirs = merged.files.filter(
    (record) => !oursPaths.has(record.path) && !basePaths.has(record.path),
  ).length;

  // 按 2 空格缩进 + 末尾换行序列化，与 provenance:report 的输出格式一致，
  // 这样合并后紧接着跑 report 不会产生额外 diff。
  writeFileSync(oursPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  process.stderr.write(
    `merge-reviews-driver: ours ${oursFiles.length} + theirs ${theirsFiles.length} ` +
      `→ ${merged.files.length}（从 theirs 新增 ${addedFromTheirs} 条）\n`,
  );
  process.exit(0);
}

main();
