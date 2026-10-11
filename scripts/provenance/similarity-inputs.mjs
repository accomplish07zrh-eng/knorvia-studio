// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度工具的输入装载：上游树、候选文件与被替换的旧文件。
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { stripDeclarationLines } from "./similarity-declarations.mjs";
import { fileKind, isBinary, normalizeLines } from "./similarity-lines.mjs";

export function readPathList(file) {
  return readFileSync(resolve(file), "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 读取上游固定提交的完整树（仓库外缓存目录）。二进制文件按计划书跳过两道门槛。
 * byKind 为同类文件的倒排索引：规范化行 → 组内文件序号（每个文件只记一次）。
 */
export function loadUpstream(root) {
  const files = [];
  let binary = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const bytes = readFileSync(full);
        const path = relative(root, full).split("\\").join("/");
        if (isBinary(bytes)) {
          files.push({
            path,
            absolutePath: full,
            kind: fileKind(path),
            binary: true,
            text: null,
            lines: [],
          });
          binary += 1;
          continue;
        }
        const text = bytes.toString("utf8");
        files.push({
          path,
          absolutePath: full,
          kind: fileKind(path),
          binary: false,
          text,
          lines: normalizeLines(text),
        });
      }
    }
  };
  visit(root);
  const byKind = new Map();
  const kindCounts = {};
  files.forEach((file, index) => {
    kindCounts[file.kind] = (kindCounts[file.kind] ?? 0) + 1;
    if (file.binary) return;
    const group = byKind.get(file.kind) ?? { index: new Map(), files: [] };
    group.files.push(index);
    for (const line of new Set(file.lines)) {
      const list = group.index.get(line);
      if (list) list.push(group.files.length - 1);
      else group.index.set(line, [group.files.length - 1]);
    }
    byKind.set(file.kind, group);
  });
  return { files, binary, kindCounts, byKind };
}

/** 候选文件：可选先按 interface.md 剔除兼容行。 */
export function loadCandidate({ repo, givenPath, declarationNames }) {
  const path = resolve(repo, givenPath);
  const bytes = readFileSync(path);
  const kind = fileKind(path);
  if (isBinary(bytes))
    return { path, givenPath, kind, binary: true, text: null, lines: [], declarationLines: 0 };
  const original = bytes.toString("utf8");
  const stripped = declarationNames.length
    ? stripDeclarationLines(original, declarationNames)
    : { text: original, removed: 0 };
  return {
    path,
    givenPath,
    kind,
    binary: false,
    text: stripped.text,
    lines: normalizeLines(stripped.text),
    declarationLines: stripped.removed,
  };
}

/** 被替换的旧文件：默认取工作区，给了 --old-rev 就取该提交。 */
export function readOldFile({ repo, givenPath, revision }) {
  const bytes = revision
    ? execFileSync("git", ["-C", repo, "show", `${revision}:${givenPath}`], {
        maxBuffer: 64 * 1024 * 1024,
      })
    : readFileSync(resolve(repo, givenPath));
  const kind = fileKind(givenPath);
  if (isBinary(bytes)) return { path: givenPath, kind, binary: true, text: null, lines: [] };
  const text = bytes.toString("utf8");
  return { path: givenPath, kind, binary: false, text, lines: normalizeLines(text) };
}
