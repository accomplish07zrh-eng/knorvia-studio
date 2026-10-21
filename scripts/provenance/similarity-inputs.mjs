// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度工具的输入装载：上游树、候选文件与被替换的旧文件。
// 门禁口径（2026-10-19 防刷）：所有参与行比较的文件先按仓库配置格式化并去注释，
// 见 similarity-normalize.mjs；记账路径不经过这里。
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { isPureReExport, traceAllImplementations } from "./similarity-reexport.mjs";
import { join, relative, resolve } from "node:path";
import {
  stripContractLines,
  stripDeclarationBlocks,
  stripDeclarationLines,
} from "./similarity-declarations.mjs";
import { fileKind, isBinary, normalizeLines } from "./similarity-lines.mjs";
import { FORMAT_CONCURRENCY, mapConcurrent, prepareGateText } from "./similarity-normalize.mjs";

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
export async function loadUpstream(root, { oxfmtOptions = {} } = {}) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile())
        entries.push({ path: relative(root, full).split("\\").join("/"), absolutePath: full });
    }
  };
  visit(root);
  let binary = 0;
  let formatFallbacks = 0;
  const files = await mapConcurrent(entries, FORMAT_CONCURRENCY, async (entry) => {
    const bytes = readFileSync(entry.absolutePath);
    const kind = fileKind(entry.path);
    if (isBinary(bytes)) {
      binary += 1;
      return {
        ...entry,
        kind,
        binary: true,
        text: null,
        lines: [],
        formatted: false,
        formatError: null,
      };
    }
    const source = bytes.toString("utf8");
    const prepared = await prepareGateText({
      fileName: entry.absolutePath,
      text: source,
      oxfmtOptions,
    });
    if (!prepared.formatted) formatFallbacks += 1;
    return {
      ...entry,
      kind,
      binary: false,
      // 结构相似度继续使用原文 token（忽略空白/注释）；lines 使用格式化、去注释后的代码行。
      text: source,
      lines: normalizeLines(prepared.text),
      formatted: prepared.formatted,
      formatError: prepared.formatError,
    };
  });
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
  return { files, binary, kindCounts, byKind, formatFallbacks };
}

/**
 * 候选文件：`--declaration --interface` 模式下先按 interface.md 剔除整块声明
 * （interface/type/class/enum/const，含成员与嵌套），再剔除剩余含兼容名字的行；
 * 普通模式不做任何剔除。
 * 注意 text 与 lines 的来源不同：text 保留原文（或原文的声明剔除结果），供结构相似度
 * 使用——结构口径本来就忽略空白和注释，不能因为 oxfmt 补箭头参数括号等语法细节而漂移；
 * lines 用格式化、去注释后的文本，供防刷行门槛使用。声明剔除分别对两份文本执行，
 * 避免注释里的兼容名字误删代码行。
 */
export async function loadCandidate({
  repo,
  givenPath,
  declarationNames,
  contractNames = [],
  oxfmtOptions = {},
}) {
  const path = resolve(repo, givenPath);
  const bytes = readFileSync(path);
  const kind = fileKind(path);
  if (isBinary(bytes))
    return {
      path,
      givenPath,
      kind,
      binary: true,
      text: null,
      lines: [],
      declaration: false,
      linesBeforeStrip: 0,
      strippedBlocks: 0,
      formatted: false,
      formatError: null,
    };
  const original = bytes.toString("utf8");
  const prepared = await prepareGateText({ fileName: path, text: original, oxfmtOptions });
  const declaration = declarationNames.length > 0;
  const structuralText = declaration
    ? stripDeclarations(original, declarationNames).text
    : original;
  const lineText = declaration ? stripDeclarations(prepared.text, declarationNames) : null;
  let lines = normalizeLines(lineText?.text ?? prepared.text);
  let text = structuralText;
  // 契约行剔除（与声明模式互斥）：先记下未剔除的行数，供报告输出剔除前后两组值。
  let contractBaseline = null;
  if (contractNames.length > 0 && !declaration) {
    const stripped = stripContractLines(prepared.text, contractNames);
    const structuralStripped = stripContractLines(original, contractNames);
    contractBaseline = {
      names: [...contractNames],
      strippedLines: stripped.removed,
      suspiciousRatio: stripped.suspiciousRatio,
      tooManyNames: stripped.tooManyNames,
      totalLines: stripped.total,
    };
    lines = normalizeLines(stripped.text);
    text = structuralStripped.text;
  }
  let tracedFrom = null;
  let reexportUnresolved = null;
  // 纯再导出桩：丢弃 re-export 后 lines 常为 0 会误过门禁；顺着追到实现再计分。
  let tracedLeaves = null;
  if (!declaration && !contractBaseline && isPureReExport(original)) {
    const traced = traceAllImplementations(repo, givenPath, original);
    if (traced.leaves.length === 0) {
      reexportUnresolved = traced.unresolved[0]?.reason ?? "纯再导出无法展开";
    } else if (
      traced.leaves.length === 1 &&
      traced.leaves[0].path === givenPath.replaceAll("\\", "/")
    ) {
      // 自身即叶子
    } else if (traced.leaves.length === 1) {
      const leaf = traced.leaves[0];
      tracedFrom = leaf.path;
      const implPrepared = await prepareGateText({
        fileName: resolve(repo, leaf.path),
        text: leaf.text,
        oxfmtOptions,
      });
      text = leaf.text;
      lines = normalizeLines(implPrepared.text);
    } else {
      tracedFrom = traced.leaves.map((leaf) => leaf.path).join(",");
      tracedLeaves = [];
      for (const leaf of traced.leaves) {
        const implPrepared = await prepareGateText({
          fileName: resolve(repo, leaf.path),
          text: leaf.text,
          oxfmtOptions,
        });
        tracedLeaves.push({
          givenPath: leaf.path,
          path: resolve(repo, leaf.path),
          kind,
          binary: false,
          text: leaf.text,
          lines: normalizeLines(implPrepared.text),
          declaration: false,
          linesBeforeStrip: normalizeLines(implPrepared.text).length,
          strippedBlocks: 0,
          formatted: implPrepared.formatted,
          formatError: implPrepared.formatError,
        });
      }
    }
  }
  return {
    path,
    givenPath,
    kind,
    binary: false,
    text,
    lines,
    declaration,
    contractBaseline,
    linesBeforeStrip: declaration
      ? normalizeLines(prepared.text).length
      : contractBaseline
        ? normalizeLines(prepared.text).length
        : lines.length,
    strippedBlocks: lineText?.strippedBlocks ?? 0,
    formatted: prepared.formatted,
    formatError: prepared.formatError,
    tracedFrom,
    reexportUnresolved,
    tracedLeaves,
  };
}

function stripDeclarations(text, names) {
  const blocks = stripDeclarationBlocks(text, names);
  return {
    text: stripDeclarationLines(blocks.text, names).text,
    strippedBlocks: blocks.strippedBlocks,
  };
}

/** 被替换的旧文件：默认取工作区，给了 --old-rev 就取该提交。 */
export async function readOldFile({ repo, givenPath, revision, oxfmtOptions = {} }) {
  const bytes = revision
    ? execFileSync("git", ["-C", repo, "show", `${revision}:${givenPath}`], {
        maxBuffer: 64 * 1024 * 1024,
      })
    : readFileSync(resolve(repo, givenPath));
  const kind = fileKind(givenPath);
  if (isBinary(bytes))
    return {
      path: givenPath,
      kind,
      binary: true,
      text: null,
      lines: [],
      formatted: false,
      formatError: null,
    };
  const source = bytes.toString("utf8");
  const prepared = await prepareGateText({
    fileName: givenPath,
    text: source,
    oxfmtOptions,
  });
  return {
    path: givenPath,
    kind,
    binary: false,
    // 与上游树一致：结构相似度看原文，行门槛看格式化、去注释后的代码行。
    text: source,
    lines: normalizeLines(prepared.text),
    formatted: prepared.formatted,
    formatError: prepared.formatError,
  };
}
