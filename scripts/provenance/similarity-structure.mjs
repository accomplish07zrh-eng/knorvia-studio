// SPDX-License-Identifier: Apache-2.0
// M0-8 相似度门槛：结构相似度（token 指纹 + winnowing）。
import { extname } from "node:path";
import ts from "typescript";
import { STRUCTURAL_KGRAM, STRUCTURAL_WINDOW } from "./similarity-text.mjs";

const HASH_BASE = 131;

const SCRIPT_KINDS = new Map([
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
]);

function placeholderFor(kind, text) {
  switch (kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
      return "ID";
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.JsxText:
    case ts.SyntaxKind.JsxTextAllWhiteSpaces:
      return "STR";
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
      return "NUM";
    case ts.SyntaxKind.RegularExpressionLiteral:
      return "REGEX";
    case ts.SyntaxKind.Unknown:
      return "";
    default:
      return text;
  }
}

// 词法单位取自 AST 的叶子节点，不用 createScanner：扫描器在模板占位符处会切换状态，
// 一次顺序扫描会把模板后面的 token 一起吃掉（实测 `` `a${b}c`; `` 丢掉 `;`）。
// 叶子节点天然跳过注释，模板表达式与无替换模板各合成一个 TPL。
export function tokenSequence(text, path) {
  const scriptKind = SCRIPT_KINDS.get(extname(path).toLowerCase()) ?? ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind);
  const tokens = [];
  const walk = (node) => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier)
    ) {
      return;
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // 整个模板字面量合成一个占位符：逐 token 展开会把表达式结构混进相似度。
      tokens.push("TPL");
      return;
    }
    const children = node.getChildren(source);
    if (children.length === 0) {
      if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
      const placeholder = placeholderFor(node.kind, node.getText(source));
      if (placeholder) tokens.push(placeholder);
      return;
    }
    for (const child of children) walk(child);
  };
  walk(source);
  return tokens;
}

export function structuralFingerprints(tokens) {
  const count = tokens.length;
  if (count < STRUCTURAL_KGRAM) return [];
  const ids = new Int32Array(count);
  const seen = new Map();
  let next = 1;
  for (let index = 0; index < count; index += 1) {
    let id = seen.get(tokens[index]);
    if (id === undefined) {
      id = next;
      next += 1;
      seen.set(tokens[index], id);
    }
    ids[index] = id;
  }
  let power = 1;
  for (let index = 1; index < STRUCTURAL_KGRAM; index += 1) {
    power = Math.imul(power, HASH_BASE) >>> 0;
  }
  const grams = new Uint32Array(count - STRUCTURAL_KGRAM + 1);
  let hash = 0;
  for (let index = 0; index < STRUCTURAL_KGRAM; index += 1) {
    hash = (Math.imul(hash, HASH_BASE) + ids[index]) >>> 0;
  }
  grams[0] = hash;
  for (let index = 1; index < grams.length; index += 1) {
    const dropped = Math.imul(ids[index - 1], power);
    hash = (Math.imul((hash - dropped) | 0, HASH_BASE) + ids[index + STRUCTURAL_KGRAM - 1]) >>> 0;
    grams[index] = hash;
  }
  // winnowing：每个长度 20 的窗口取最小哈希（并列取最右），指纹集合即新文件的比较单位。
  const selected = new Set();
  const window = [];
  for (let index = 0; index < grams.length; index += 1) {
    while (window.length && window[window.length - 1].hash >= grams[index]) window.pop();
    window.push({ index, hash: grams[index] });
    while (window[0].index <= index - STRUCTURAL_WINDOW) window.shift();
    if (index >= STRUCTURAL_WINDOW - 1) selected.add(window[0].hash);
  }
  if (selected.size === 0) {
    // 窗口不足时至少留下一个指纹，避免短文件被判成「零相似」而绕过比较。
    let minimum = grams[0];
    for (const gram of grams) if (gram < minimum) minimum = gram;
    selected.add(minimum);
  }
  return [...selected].sort((left, right) => left - right);
}

export function createFingerprintIndex(files = []) {
  const paths = [];
  const index = new Map();
  const addFile = (path, fingerprints) => {
    const fileIndex = paths.length;
    paths.push(path);
    for (const hash of fingerprints) {
      const list = index.get(hash);
      if (list) list.push(fileIndex);
      else index.set(hash, [fileIndex]);
    }
  };
  for (const file of files) addFile(file.path, file.fingerprints);
  return { paths, index, addFile };
}

export function structuralMetrics(index, fingerprints) {
  if (!fingerprints.length) return { score: 0, path: null };
  const counts = new Map();
  for (const hash of fingerprints) {
    const list = index.index.get(hash);
    if (!list) continue;
    for (const fileIndex of list) counts.set(fileIndex, (counts.get(fileIndex) ?? 0) + 1);
  }
  let best = 0;
  let topIndex = -1;
  for (const [fileIndex, score] of counts) {
    if (score > best) {
      best = score;
      topIndex = fileIndex;
    }
  }
  return {
    score: best / fingerprints.length,
    path: topIndex >= 0 ? index.paths[topIndex] : null,
  };
}
