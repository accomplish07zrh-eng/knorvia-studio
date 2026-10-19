// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 反刷分：把一段文案压进空白分隔的字面量、运行时再 split 成列表，绕开逐行比较。
//
// 只拦「候选自己写死的字面量」：
// 1. 字符串/模板字面量直接 `.split(" ")` / `.split(/\s+/)`；
// 2. 绑定到 const 的字面量（字面量数组 / `join(" ")` 结果）再 split / flatMap；
// 3. 包装助手：函数体内对参数按空白 split，且以字符串字面量实参调用。
// 运行时数据（函数参数、文件/进程输出、解析 git/ps 行）不判失败，避免误报。
//
// 这里是轻量字面量传播，不是完整常量求值器：只认 const 初始化式与作用域内最近的
// 同名绑定，不追踪赋值、对象属性、条件表达式或跨文件导入。
import ts from "typescript";

// 字符串分隔符：只认空格/制表符，换行分隔不算「压词」。正则分隔符另按 /\s+/ 判定。
const SPACE_SEPARATOR = /^[ \t]+$/u;
const WHITESPACE_REGEX_SOURCE = /^(?:\\s)[+*]?$/u;

/**
 * 候选文件里的压行拆分点。
 * @returns {{ line: number, column: number, via: string }[]} 1 基行列号，便于报告
 */
export function packedLiteralSplits(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  // 非脚本（或语法错误）解析出的树不可信；没有 split 字样时直接跳过。
  if (!/\bsplit\s*\(/u.test(text)) return [];
  const state = { source, bindings: new Map(), helpers: new Map() };
  collectBindings(state);
  collectHelpers(state);
  const hits = [];
  const record = (node, via) => {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    hits.push({ line: position.line + 1, column: position.character + 1, via });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const split = splitOfLiteral(node, state);
      if (split) record(split.node, split.via);
      else {
        const flat = flatMapOfLiteral(node, state);
        if (flat) record(flat.node, flat.via);
        else {
          const helper = helperLiteralCall(node, state);
          if (helper) record(node, helper.via);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return dedupe(hits);
}

function dedupe(hits) {
  const seen = new Set();
  const unique = [];
  for (const hit of hits) {
    const key = `${hit.line}:${hit.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique.sort((left, right) => left.line - right.line || left.column - right.column);
}

/** 无插值模板/字符串的文本；含插值或非字面量返回 null（运行时才确定）。 */
function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function isWhitespaceRegexLiteral(node) {
  if (!ts.isRegularExpressionLiteral(node)) return false;
  const match = /^\/(.*)\/[a-z]*$/u.exec(node.getText());
  return match !== null && WHITESPACE_REGEX_SOURCE.test(match[1]);
}

function isWhitespaceRegExpConstructor(node) {
  if (!ts.isNewExpression(node) && !ts.isCallExpression(node)) return false;
  if (node.expression.getText() !== "RegExp") return false;
  const pattern = literalText(node.arguments?.[0]);
  if (pattern === null) return false;
  return WHITESPACE_REGEX_SOURCE.test(pattern);
}

/** split 的分隔符是否是「空白」：字符串空格、/\s+/、或指向它们的 const。 */
function isWhitespaceSeparator(node, state, depth = 0) {
  if (!node || depth > 4) return false;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return isWhitespaceSeparator(node.expression, state, depth + 1);
  const text = literalText(node);
  if (text !== null) return SPACE_SEPARATOR.test(text);
  if (isWhitespaceRegexLiteral(node) || isWhitespaceRegExpConstructor(node)) return true;
  if (ts.isIdentifier(node)) {
    const binding = resolveBinding(node, state);
    if (binding?.initializer) return isWhitespaceSeparator(binding.initializer, state, depth + 1);
  }
  return false;
}

/** 去掉括号与 as/satisfies/非空断言，保留标识符与表达式主体。 */
function unwrap(node) {
  let current = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

/**
 * 表达式的「写死」来源：字面量、字面量数组、`join(" ")` 结果，或指向它们的 const。
 * 参数、调用结果、属性访问等运行时来源一律返回 null。
 */
function literalSource(node, state, depth = 0) {
  if (!node || depth > 4) return null;
  const current = unwrap(node);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current))
    return { kind: "string", node: current };
  if (ts.isArrayLiteralExpression(current)) {
    const allLiteral = current.elements.every(
      (element) => literalSource(element, state, depth + 1) !== null,
    );
    return allLiteral ? { kind: "array", node: current } : null;
  }
  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    current.expression.name.getText() === "join" &&
    isWhitespaceSeparator(current.arguments[0], state, depth + 1)
  ) {
    const receiver = literalSource(current.expression.expression, state, depth + 1);
    if (receiver) return { kind: "join", node: current };
    return null;
  }
  if (ts.isIdentifier(current)) {
    const binding = resolveBinding(current, state);
    if (binding?.initializer) return literalSource(binding.initializer, state, depth + 1);
  }
  return null;
}

/** `receiver.split(空白)` 且 receiver 是写死字面量。 */
function splitOfLiteral(node, state) {
  const callee = unwrap(node.expression);
  if (!ts.isPropertyAccessExpression(callee) || callee.name.getText() !== "split") return null;
  if (!isWhitespaceSeparator(node.arguments[0], state)) return null;
  const source = literalSource(callee.expression, state);
  if (!source) return null;
  return { node: unwrap(callee.expression), via: source.kind };
}

/** `字面量数组.flatMap((item) => item.split(空白))`。 */
function flatMapOfLiteral(node, state) {
  const callee = unwrap(node.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const method = callee.name.getText();
  if (method !== "flatMap" && method !== "map") return null;
  const callback = node.arguments[0];
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)))
    return null;
  if (callback.parameters.length !== 1) return null;
  const parameter = callback.parameters[0].name;
  if (!ts.isIdentifier(parameter)) return null;
  const inner = ts.isBlock(callback.body)
    ? splitOnParameter(callback.body, parameter.text, state)
    : unwrap(callback.body);
  if (!inner || !ts.isCallExpression(inner)) return null;
  const innerCallee = unwrap(inner.expression);
  if (!ts.isPropertyAccessExpression(innerCallee) || innerCallee.name.getText() !== "split")
    return null;
  if (!isWhitespaceSeparator(inner.arguments[0], state)) return null;
  if (
    !ts.isIdentifier(unwrap(innerCallee.expression)) ||
    unwrap(innerCallee.expression).text !== parameter.text
  )
    return null;
  const source = literalSource(callee.expression, state);
  if (!source || source.kind !== "array") return null;
  return { node: unwrap(callee.expression), via: `${method}:array` };
}

/** 回调块里第一处「对回调参数 split 空白」的调用；用于 `flatMap((x) => { … })`。 */
function splitOnParameter(body, parameter, state) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.getText() === "split" &&
        isWhitespaceSeparator(node.arguments[0], state) &&
        ts.isIdentifier(unwrap(callee.expression)) &&
        unwrap(callee.expression).text === parameter
      ) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** 最内层作用域里、位置在引用之前且未被参数/解构/import 遮蔽的同名绑定。 */
function resolveBinding(node, state) {
  const entries = state.bindings.get(node.text);
  if (!entries) return null;
  const position = node.getStart(state.source);
  let best = null;
  for (const entry of entries) {
    if (entry.start > position) continue;
    if (position < entry.scopeStart || position >= entry.scopeEnd) continue;
    if (!best || entry.start > best.start) best = entry;
  }
  return best?.initializer ? best : null;
}

/**
 * 收集变量、参数、解构与 import 绑定。参数/解构/import 记为「运行时」绑定
 * （initializer 为 null），用于遮蔽外层同名 const，避免把参数误当字面量。
 */
function collectBindings(state) {
  const add = (name, initializer, declarationNode, scope) => {
    if (!ts.isIdentifier(name)) return;
    const list = state.bindings.get(name.text) ?? [];
    list.push({
      start: declarationNode.getStart(state.source),
      scopeStart: scope.getStart(state.source),
      scopeEnd: scope.end,
      initializer,
    });
    state.bindings.set(name.text, list);
  };
  const nearestScope = (node) => {
    let current = node.parent;
    while (current) {
      if (
        ts.isSourceFile(current) ||
        ts.isBlock(current) ||
        ts.isModuleBlock(current) ||
        ts.isCaseBlock(current) ||
        ts.isClassStaticBlockDeclaration(current)
      )
        return current;
      current = current.parent;
    }
    return state.source;
  };
  const visit = (node) => {
    if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) {
      const name = node.name;
      if (name && ts.isIdentifier(name)) add(name, null, node, state.source);
    }
    if (ts.isParameter(node)) add(node.name, null, node, nearestScope(node));
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name))
      add(node.name, null, node, nearestScope(node));
    if (ts.isCatchClause(node) && node.variableDeclaration)
      add(node.variableDeclaration.name, null, node, nearestScope(node));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      // 只追踪 const 初始化式；let/var 可被重新赋值，不算写死。
      const isConst = (node.parent?.flags & ts.NodeFlags.Const) !== 0;
      add(node.name, isConst ? (node.initializer ?? null) : null, node, nearestScope(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(state.source);
}

/** 参数按空白 split 的函数；接受 `param`、`param.trim()` 这类接收者。 */
function parameterReceiver(node, parameters) {
  let current = unwrap(node);
  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    current.expression.name.getText() === "trim" &&
    (current.arguments?.length ?? 0) === 0
  )
    current = unwrap(current.expression.expression);
  if (!ts.isIdentifier(current)) return null;
  return parameters.includes(current.text) ? current.text : null;
}

function helperParameter(fn, state) {
  if (!fn.body || fn.parameters.length === 0) return null;
  const parameters = fn.parameters
    .map((parameter) => (ts.isIdentifier(parameter.name) ? parameter.name.text : null))
    .filter((name) => name !== null);
  if (parameters.length === 0) return null;
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.getText() === "split" &&
        isWhitespaceSeparator(node.arguments[0], state)
      ) {
        const receiver = parameterReceiver(callee.expression, parameters);
        if (receiver) {
          found = receiver;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return found;
}

/** 收集「参数被按空白 split」的具名函数/const 箭头函数。 */
function collectHelpers(state) {
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const parameter = helperParameter(node, state);
      if (parameter) state.helpers.set(node.name.text, { node, parameter });
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrap(node.initializer);
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        const parameter = helperParameter(initializer, state);
        if (parameter) state.helpers.set(node.name.text, { node: initializer, parameter });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(state.source);
}

/** 以字面量实参调用「参数被空白 split」的助手。 */
function helperLiteralCall(node, state) {
  const callee = unwrap(node.expression);
  if (!ts.isIdentifier(callee)) return null;
  const helper = state.helpers.get(callee.text);
  if (!helper) return null;
  const index = helper.node.parameters.findIndex(
    (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === helper.parameter,
  );
  if (index < 0) return null;
  const argument = node.arguments[index];
  if (!literalSource(argument, state)) return null;
  return { via: `helper:${callee.text}` };
}
