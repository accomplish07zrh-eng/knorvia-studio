// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { isFunctionLike } from "./sites.js";
import type { ApplicationVia } from "./state.js";

// AST helpers for the ordering walk. None of them read TraceState.

export type ScriptFunction = ts.SignatureDeclaration & { body: ts.Node };

function bindingElements(name: ts.BindingName): readonly ts.ArrayBindingElement[] | undefined {
  if (ts.isIdentifier(name)) return undefined;
  return name.elements;
}

/** Identifier leaves of a binding, left to right. Omitted array holes contribute nothing. */
export function boundIdentifiers(name: ts.BindingName): ts.Identifier[] {
  const leaves: ts.Identifier[] = [];
  const visit = (binding: ts.BindingName): void => {
    if (ts.isIdentifier(binding)) {
      leaves.push(binding);
      return;
    }
    const elements = bindingElements(binding);
    if (elements === undefined) return;
    let cursor = 0;
    while (cursor < elements.length) {
      const element = elements[cursor];
      cursor += 1;
      if (element === undefined || ts.isOmittedExpression(element)) continue;
      visit(element.name);
    }
  };
  visit(name);
  return leaves;
}

function declarationBody(node: ts.Node): ts.Node | undefined {
  const withBody = node as { body?: ts.Node };
  return withBody.body;
}

export function asScriptFunction(
  node: ts.Node,
  scriptFile: ts.SourceFile,
): ScriptFunction | undefined {
  if (!isFunctionLike(node)) return undefined;
  if (node.getSourceFile() !== scriptFile) return undefined;
  const body = declarationBody(node);
  if (body === undefined) return undefined;
  return node as ScriptFunction;
}

/** Function-like ancestors in the authored file, innermost first. */
export function enclosingFunctions(node: ts.Node): ScriptFunction[] {
  const scriptFile = node.getSourceFile();
  const found: ScriptFunction[] = [];
  let cursor: ts.Node | undefined = node.parent;
  while (cursor !== undefined) {
    const fn = asScriptFunction(cursor, scriptFile);
    if (fn !== undefined) found.push(fn);
    cursor = cursor.parent;
  }
  return found;
}

function ownIdentifier(decl: ts.Node): string | undefined {
  const named = decl as { name?: ts.Node };
  if (named.name !== undefined && ts.isIdentifier(named.name)) return named.name.text;
  return undefined;
}

function variableBindingName(decl: ts.Node): string | undefined {
  const parent = decl.parent;
  if (parent === undefined) return undefined;
  if (!ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name)) return undefined;
  return parent.name.text;
}

export function functionName(decl: ts.Node): string | undefined {
  // `new Judge()` should label the inlined constructor with the class name.
  if (ts.isConstructorDeclaration(decl)) {
    const host = decl.parent;
    if (!ts.isClassLike(host) || host.name === undefined) return undefined;
    return host.name.text;
  }
  return ownIdentifier(decl) ?? variableBindingName(decl);
}

export function resolveCallDeclaration(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
): ScriptFunction | undefined {
  const signature = checker.getResolvedSignature(call);
  const declaration = signature?.declaration;
  if (declaration === undefined) return undefined;
  return asScriptFunction(declaration, scriptFile);
}

function preorder(root: ts.Node, visit: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    visit(node);
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    let cursor = children.length;
    while (cursor > 0) {
      cursor -= 1;
      const child = children[cursor];
      if (child !== undefined) stack.push(child);
    }
  }
}

function rememberCallee(target: ts.Node | undefined, into: Set<ts.Node>): void {
  if (target !== undefined) into.add(target);
}

function noteCall(
  node: ts.Node,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>,
  into: Set<ts.Node>,
): void {
  if (ts.isCallExpression(node)) {
    rememberCallee(resolveCallDeclaration(node, checker, scriptFile), into);
  }
  const appliesOracle =
    ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node);
  if (!appliesOracle) return;
  const applied = applications.get(node);
  if (applied === undefined) return;
  for (const fn of applied.keys()) rememberCallee(asScriptFunction(fn, scriptFile), into);
}

function calleeMap(
  functions: readonly ScriptFunction[],
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>,
): Map<ts.Node, Set<ts.Node>> {
  const callees = new Map<ts.Node, Set<ts.Node>>();
  let cursor = 0;
  while (cursor < functions.length) {
    const fn = functions[cursor];
    cursor += 1;
    if (fn === undefined) continue;
    const targets = new Set<ts.Node>();
    // Nested bodies count as the owner's callees. That over-approximates cycles.
    preorder(fn.body, (node) => {
      noteCall(node, checker, scriptFile, applications, targets);
    });
    callees.set(fn, targets);
  }
  return callees;
}

function reachesSelf(fn: ts.Node, callees: ReadonlyMap<ts.Node, Set<ts.Node>>): boolean {
  const seen = new Set<ts.Node>();
  const queue: ts.Node[] = [];
  const first = callees.get(fn);
  if (first !== undefined) {
    for (const hop of first) queue.push(hop);
  }
  let cursor = 0;
  while (cursor < queue.length) {
    const next = queue[cursor];
    cursor += 1;
    if (next === undefined) continue;
    if (next === fn) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    const more = callees.get(next);
    if (more === undefined) continue;
    for (const hop of more) queue.push(hop);
  }
  return false;
}

/**
 * Functions that can reach themselves through resolved calls or oracle applications.
 * The walk turns each of these into a `loop` region and cuts re-entry.
 */
export function collectRecursiveFunctions(
  scriptFile: ts.SourceFile,
  checker: ts.TypeChecker,
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>,
): Set<ts.Node> {
  const functions: ScriptFunction[] = [];
  preorder(scriptFile, (node) => {
    const fn = asScriptFunction(node, scriptFile);
    if (fn !== undefined) functions.push(fn);
  });
  const callees = calleeMap(functions, checker, scriptFile, applications);
  const recursive = new Set<ts.Node>();
  for (const fn of functions) {
    if (reachesSelf(fn, callees)) recursive.add(fn);
  }
  return recursive;
}
