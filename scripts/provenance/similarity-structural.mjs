// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 结构相似度：专抓改名照搬与逐行翻写。
//
// 用仓库已有的 TypeScript 词法分析器切 token：标识符换成同一占位符，字符串、数字、
// 模板字面量各自换成同一占位符，去掉注释（scanner skipTrivia）与 import/export 声明
// （AST 范围剔除）。再用 winnowing 取指纹：每 25 个 token 一个哈希，窗口 20。
// 指标：新文件指纹落在同一个比较文件里的比例，取最大值。
import { createHash } from "node:crypto";
import ts from "typescript";

const GRAM = 25;
const WINDOW = 20;

const IDENTIFIER = "I";
const STRING = "S";
const NUMBER = "N";
const TEMPLATE = "T";

export function structuralTokens(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const skipped = [];
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isExportDeclaration(node)
    )
      skipped.push([node.getStart(source), node.end]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const tokens = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const start = scanner.getTokenPos();
    if (skipped.some(([from, to]) => start >= from && start < to)) continue;
    tokens.push(placeholder(kind, scanner));
  }
  return tokens;
}

function placeholder(kind, scanner) {
  switch (kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
      return IDENTIFIER;
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.RegularExpressionLiteral:
      return STRING;
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
    case ts.SyntaxKind.TemplateTail:
      return TEMPLATE;
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
      return NUMBER;
    default:
      return scanner.getTokenText();
  }
}

export function structuralFingerprints(tokens, { gram = GRAM, window = WINDOW } = {}) {
  const fingerprints = new Set();
  if (tokens.length < gram) return fingerprints;
  const hashes = [];
  for (let index = 0; index + gram <= tokens.length; index += 1) {
    hashes.push(hash(tokens, index, gram));
  }
  if (hashes.length <= window) {
    fingerprints.add(minimum(hashes, 0, hashes.length));
    return fingerprints;
  }
  for (let index = 0; index + window <= hashes.length; index += 1) {
    fingerprints.add(minimum(hashes, index, index + window));
  }
  return fingerprints;
}

function hash(tokens, start, gram) {
  const digest = createHash("sha1");
  for (let index = start; index < start + gram; index += 1)
    digest.update(tokens[index]).update("\0");
  return digest.digest("hex").slice(0, 16);
}

function minimum(values, from, to) {
  let best = values[from];
  for (let index = from + 1; index < to; index += 1) if (values[index] < best) best = values[index];
  return best;
}

/** 新文件指纹落在同一比较文件里的比例。 */
export function structuralOverlap(candidateFingerprints, comparedFingerprints) {
  if (candidateFingerprints.size === 0) return 0;
  let shared = 0;
  for (const fingerprint of candidateFingerprints)
    if (comparedFingerprints.has(fingerprint)) shared += 1;
  return shared / candidateFingerprints.size;
}
