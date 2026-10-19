// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度门禁的规范化：先用仓库配置（.oxfmtrc.json）的 oxfmt 统一格式，再剔除注释，最后
// 复用 similarity-lines.mjs 的行过滤。管线是「格式化 → 去注释（替换为单个空格）→ 再格式化」：
// 第二次格式化消除注释删除后留下的空格并按同一规则换行，保证同一段代码压行、拆行或增删
// 注释前后得到相同的代码行。
//
// 分工：记账路径（scripts/provenance/bookkeeping-round2-*）使用自己的 normalizeLines 旧口径，
// 保留注释；similarity-lines.mjs 的 normalizeLines 也保持原语义（直接测试与既有输出不变）。
// 只有本模块导出的 gateLines/prepareGateText 属于防刷门禁口径：注释行不计入包含率。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "oxfmt";
import ts from "typescript";
import { fileKind, normalizeLines } from "./similarity-lines.mjs";

// oxfmt CLI 的扫描范围不是格式化选项。门禁必须让候选与比较文件使用同一套格式化，
// 所以这里不按 ignorePatterns 跳过（否则那些路径会退回可被压行/凑注释绕过的原始比较）。
const NON_FORMAT_KEYS = new Set(["$schema", "ignorePatterns"]);
// 门禁在仓库配置之上固定 objectWrap=collapse：oxfmt 默认 preserve 会保留对象/类型字面量
// 原有的多行布局，同一段代码拆行后行数就变了；collapse 让布局只由宽度决定，拆行与压行
// 收敛到同一结果。它只影响比较用的文本，不修改仓库文件，也不改变 `pnpm fmt` 的行为。
const GATE_FORMAT_OVERRIDES = { objectWrap: "collapse" };
// 上游树有数千个文件；进程内调用 oxfmt（不落盘、不复制到临时目录）并限制并发即可。
// 实测完整上游树（4090 个脚本）约 14 秒，脚本全部格式化成功、无回退。
export const FORMAT_CONCURRENCY = 8;

export function loadOxfmtOptions(repo) {
  const configPath = join(repo, ".oxfmtrc.json");
  let source;
  try {
    source = readFileSync(configPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const config = JSON.parse(source);
  return Object.fromEntries(Object.entries(config).filter(([key]) => !NON_FORMAT_KEYS.has(key)));
}

/** 格式化单个文件；语法错误或格式不支持时回退原文并记录原因。 */
export async function formatSource(fileName, text, options) {
  try {
    const result = await format(fileName, text, options);
    if (result.errors.length > 0) {
      const message = result.errors[0]?.message ?? "format error";
      return { text, formatted: false, formatError: message };
    }
    return { text: result.code, formatted: true, formatError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { text, formatted: false, formatError: message };
  }
}

/**
 * 注释范围：用 TypeScript 语法树收集 trivia（底层即 TS scanner），由语法上下文保证
 * 字符串、模板字面量、正则与 JSX 文本里的 // 不会被当成注释。
 */
export function commentRanges(fileName, text) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const ranges = [];
  const seen = new Set();
  const add = (list) => {
    for (const range of list ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      ranges.push(range);
    }
  };
  const visit = (node) => {
    for (const child of node.getChildren(sourceFile)) {
      add(ts.getLeadingCommentRanges(text, child.getFullStart()));
      visit(child);
      add(ts.getTrailingCommentRanges(text, child.end));
    }
  };
  visit(sourceFile);
  return ranges.sort((left, right) => left.pos - right.pos);
}

/**
 * 去掉注释，每个注释替换为一个空格（保留 `return/*c*\/value` 这类 token 分隔），
 * 后续格式化再把多出来的空格收敛掉。
 */
export function stripComments(fileName, text) {
  const ranges = commentRanges(fileName, text);
  if (ranges.length === 0) return text;
  let stripped = "";
  let cursor = 0;
  for (const range of ranges) {
    stripped += `${text.slice(cursor, range.pos)} `;
    cursor = range.end;
  }
  return stripped + text.slice(cursor);
}

/**
 * 返回门禁用的代码文本（已格式化、脚本文件已去注释）以及格式化状态。
 * 非脚本文件（md/json 等）只格式化，不按 TypeScript 注释语法处理。
 */
export async function prepareGateText({ fileName, text, oxfmtOptions = {} }) {
  const options = { ...oxfmtOptions, ...GATE_FORMAT_OVERRIDES };
  const formatted = await formatSource(fileName, text, options);
  if (fileKind(fileName) !== "script") {
    return {
      text: formatted.text,
      formatted: formatted.formatted,
      formatError: formatted.formatError,
    };
  }
  const stripped = stripComments(fileName, formatted.text);
  if (stripped === formatted.text) {
    return {
      text: formatted.text,
      formatted: formatted.formatted,
      formatError: formatted.formatError,
    };
  }
  const refined = await formatSource(fileName, stripped, options);
  return {
    text: refined.text,
    formatted: formatted.formatted,
    formatError: formatted.formatError,
  };
}

/** 门禁口径的规范化行：格式化 + 去注释后，再按既有行过滤规则生成比较行。 */
export async function gateLines({ fileName, text, oxfmtOptions = {} }) {
  const prepared = await prepareGateText({ fileName, text, oxfmtOptions });
  return { ...prepared, lines: normalizeLines(prepared.text) };
}

/** 固定并发上限地处理大量文件，避免一次打开数千个上游文件。 */
export async function mapConcurrent(items, limit, run) {
  const results = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
