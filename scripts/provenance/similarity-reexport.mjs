// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 反刷分：纯再导出桩顺着追到实际实现再计分；外部包追不到则判失败。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const FROM_SPEC = /\bfrom\s*["']([^"']+)["']/gu;

/** 去掉块注释与行注释（字符串内不处理，够用做再导出判定）。 */
export function stripCommentsRough(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "\n").replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

/**
 * 去掉注释与 license 后，若再去掉全部 import / `export … from` 后为空，
 * 且原文确实含有带 from 的 export，则视为纯再导出桩。
 */
export function isPureReExport(text) {
  const raw = stripCommentsRough(text);
  if (!/\bexport\s+[\s\S]*?\bfrom\s*["']/u.test(raw)) return false;
  let rest = raw.replace(/^.*SPDX-License-Identifier.*$/gmu, "").replace(/^.*copyright.*$/gimu, "");
  rest = rest.replace(/\bimport\s+[\s\S]*?from\s*["'][^"']+["']\s*;?/gu, "");
  rest = rest.replace(/\bimport\s*["'][^"']+["']\s*;?/gu, "");
  rest = rest.replace(/\bexport\s+\*\s*(?:as\s+\w+\s+)?from\s*["'][^"']+["']\s*;?/gu, "");
  rest = rest.replace(/\bexport\s+(?:type\s+)?\{[\s\S]*?\}\s*from\s*["'][^"']+["']\s*;?/gu, "");
  return rest.trim() === "";
}

/** 抽出所有 from "..." 说明符（相对路径或包名）。 */
export function collectFromSpecifiers(text) {
  const specs = [];
  for (const match of stripCommentsRough(text).matchAll(FROM_SPEC)) {
    specs.push(match[1]);
  }
  return [...new Set(specs)];
}

function resolveLocal(repo, fromFile, spec) {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const base = resolve(dirname(resolve(repo, fromFile)), spec);
  const noExt = base.replace(/\.(?:[cm]?[jt]sx?)$/u, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.mjs`,
    `${noExt}.ts`,
    `${noExt}.tsx`,
    `${noExt}.mts`,
    `${noExt}.cts`,
    `${noExt}.js`,
    `${noExt}.mjs`,
    join(noExt, "index.ts"),
    join(noExt, "index.js"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return relative(repo, path).replaceAll("\\", "/");
  }
  return null;
}

/**
 * 顺着本仓库内相对路径追到非纯再导出的实现。
 * @returns {{ ok: true, path: string, text: string, chain: string[] } | { ok: false, reason: string, chain: string[] }}
 */
export function traceImplementation(repo, givenPath, text, { maxDepth = 8 } = {}) {
  const chain = [givenPath.replaceAll("\\", "/")];
  let currentPath = chain[0];
  let currentText = text;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!isPureReExport(currentText)) {
      return { ok: true, path: currentPath, text: currentText, chain };
    }
    const specs = collectFromSpecifiers(currentText);
    const locals = [];
    for (const spec of specs) {
      const resolved = resolveLocal(repo, currentPath, spec);
      if (resolved) locals.push(resolved);
      else if (!spec.startsWith("./") && !spec.startsWith("../")) {
        return {
          ok: false,
          reason: `re-export 指向外部包 ${spec}，无法展开实现`,
          chain,
        };
      }
    }
    if (locals.length === 0) {
      return { ok: false, reason: "纯再导出但未解析到本仓库内目标", chain };
    }
    // 多目标时任选第一个继续；桶文件会在调用方分别计分或对每个目标比对
    const next = locals.find((path) => !chain.includes(path)) ?? locals[0];
    if (chain.includes(next)) {
      return { ok: false, reason: "再导出形成环", chain };
    }
    chain.push(next);
    currentPath = next;
    currentText = readFileSync(resolve(repo, next), "utf8");
  }
  return { ok: false, reason: "再导出链过深", chain };
}

/**
 * 列出 --old-rev 下与候选同目录的脚本路径（相对 repo）。
 * 用于新增文件兜底比对。
 */
export function listOldRevSiblingScripts(repo, revision, candidatePath) {
  if (!revision) return [];
  const dir = dirname(candidatePath).replaceAll("\\", "/");
  const prefix = dir === "." ? "" : `${dir}/`;
  let listing;
  try {
    listing = execFileSync(
      "git",
      ["-C", repo, "ls-tree", "-r", "--name-only", revision, prefix || "."],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  } catch {
    return [];
  }
  const SCRIPT = /\.(?:[cm]?[jt]sx?)$/u;
  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && SCRIPT.test(line) && dirname(line).replaceAll("\\", "/") === dir);
}

export function pathExistsInRev(repo, revision, path) {
  if (!revision) return existsSync(resolve(repo, path));
  try {
    execFileSync("git", ["-C", repo, "cat-file", "-e", `${revision}:${path}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 展开纯再导出桩到全部叶子实现路径（本仓库内）。
 * 多目标桶文件返回多个叶子，供调用方取最大相似度。
 */
export function traceAllImplementations(repo, givenPath, text, { maxDepth = 8 } = {}) {
  const leaves = [];
  const unresolved = [];
  const visit = (path, body, chain) => {
    if (chain.length > maxDepth) {
      unresolved.push({ reason: "再导出链过深", chain });
      return;
    }
    if (!isPureReExport(body)) {
      leaves.push({ path, text: body, chain: [...chain] });
      return;
    }
    const specs = collectFromSpecifiers(body);
    let localCount = 0;
    for (const spec of specs) {
      const resolved = resolveLocal(repo, path, spec);
      if (!resolved) {
        if (!spec.startsWith("./") && !spec.startsWith("../")) {
          unresolved.push({ reason: `re-export 指向外部包 ${spec}`, chain });
        }
        continue;
      }
      localCount += 1;
      if (chain.includes(resolved)) {
        unresolved.push({ reason: "再导出形成环", chain: [...chain, resolved] });
        continue;
      }
      const nextText = readFileSync(resolve(repo, resolved), "utf8");
      visit(resolved, nextText, [...chain, resolved]);
    }
    if (localCount === 0 && unresolved.length === 0) {
      unresolved.push({ reason: "纯再导出但未解析到本仓库内目标", chain });
    }
  };
  visit(givenPath.replaceAll("\\", "/"), text, [givenPath.replaceAll("\\", "/")]);
  return { leaves, unresolved };
}

/** 候选在 --old-rev 中不存在时，把同目录旧脚本并入比较集。 */
export async function appendSiblingOldFiles({
  repo,
  oldRev,
  candidatePath,
  candidateKind,
  comparedOld,
  oxfmtOptions,
  readOldFile,
}) {
  if (!oldRev || pathExistsInRev(repo, oldRev, candidatePath)) return comparedOld;
  const siblings = listOldRevSiblingScripts(repo, oldRev, candidatePath);
  const missing = siblings.filter(
    (path) => !comparedOld.some((file) => file.path === path || file.path.endsWith(path)),
  );
  if (missing.length === 0) return comparedOld;
  const extras = await Promise.all(
    missing.map((givenPath) => readOldFile({ repo, givenPath, revision: oldRev, oxfmtOptions })),
  );
  return [...comparedOld, ...extras.filter((file) => !file.binary && file.kind === candidateKind)];
}
