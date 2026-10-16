// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { isFunctionLike } from "./sites.js";
import type { ApplicationVia } from "./state.js";

// Ordering helpers over the authored script. Reachability is a depth-first
// query over a callee relation that attributes nested bodies to their owner.

export type ScriptFunction = ts.SignatureDeclaration & { body: ts.Node };

const ORACLE_SITES: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.CallExpression,
  ts.SyntaxKind.NewExpression,
  ts.SyntaxKind.TaggedTemplateExpression,
]);

function walkPreorder(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  ts.forEachChild(root, (child) => {
    walkPreorder(child, visit);
  });
}

function collectLeaves(name: ts.BindingName, into: ts.Identifier[]): void {
  if (name.kind === ts.SyntaxKind.Identifier) {
    into.push(name);
    return;
  }
  if (name.kind !== ts.SyntaxKind.ObjectBindingPattern && name.kind !== ts.SyntaxKind.ArrayBindingPattern) {
    return;
  }
  name.elements.forEach((element) => {
    if (element.kind !== ts.SyntaxKind.OmittedExpression) collectLeaves(element.name, into);
  });
}

/** Identifier leaves of a binding, left to right. Omitted array holes contribute nothing. */
export function boundIdentifiers(name: ts.BindingName): ts.Identifier[] {
  const leaves: ts.Identifier[] = [];
  collectLeaves(name, leaves);
  return leaves;
}

function declarationBody(node: ts.Node): ts.Node | undefined {
  return (node as { body?: ts.Node }).body;
}

export function asScriptFunction(
  node: ts.Node,
  scriptFile: ts.SourceFile,
): ScriptFunction | undefined {
  if (!isFunctionLike(node) || node.getSourceFile() !== scriptFile) return undefined;
  if (declarationBody(node) === undefined) return undefined;
  return node as ScriptFunction;
}

/** Function-like ancestors in the authored file, innermost first. */
export function enclosingFunctions(node: ts.Node): ScriptFunction[] {
  const found: ScriptFunction[] = [];
  const host = node.getSourceFile();
  for (let cursor = node.parent; cursor !== undefined; cursor = cursor.parent) {
    const fn = asScriptFunction(cursor, host);
    if (fn !== undefined) found.push(fn);
  }
  return found;
}

function identifierText(node: ts.Node | undefined): string | undefined {
  if (node === undefined || node.kind !== ts.SyntaxKind.Identifier) return undefined;
  return (node as ts.Identifier).text;
}

function ownIdentifier(decl: ts.Node): string | undefined {
  return identifierText((decl as { name?: ts.Node }).name);
}

function variableBindingName(decl: ts.Node): string | undefined {
  const host = decl.parent;
  if (host === undefined || host.kind !== ts.SyntaxKind.VariableDeclaration) return undefined;
  return identifierText((host as ts.VariableDeclaration).name);
}

export function functionName(decl: ts.Node): string | undefined {
  // `new Judge()` should label the inlined constructor with the class name.
  if (decl.kind === ts.SyntaxKind.Constructor) {
    const host = decl.parent;
    if (host === undefined || !ts.isClassLike(host)) return undefined;
    return identifierText(host.name);
  }
  return ownIdentifier(decl) ?? variableBindingName(decl);
}

export function resolveCallDeclaration(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
): ScriptFunction | undefined {
  const signature = checker.getResolvedSignature(call);
  const declaration = signature === undefined ? undefined : signature.declaration;
  return declaration === undefined ? undefined : asScriptFunction(declaration, scriptFile);
}

interface CallIndex {
  readonly checker: ts.TypeChecker;
  readonly scriptFile: ts.SourceFile;
  readonly applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
}

function remember(target: ts.Node | undefined, into: Set<ts.Node>): void {
  if (target !== undefined) into.add(target);
}

function noteCall(node: ts.Node, index: CallIndex, into: Set<ts.Node>): void {
  if (node.kind === ts.SyntaxKind.CallExpression) {
    remember(resolveCallDeclaration(node as ts.CallExpression, index.checker, index.scriptFile), into);
  }
  if (!ORACLE_SITES.has(node.kind)) return;
  const applied = index.applications.get(node);
  if (applied === undefined) return;
  applied.forEach((_via, fn) => {
    remember(asScriptFunction(fn, index.scriptFile), into);
  });
}

function targetsIn(fn: ScriptFunction, index: CallIndex): Set<ts.Node> {
  const targets = new Set<ts.Node>();
  // Nested bodies count as the owner's callees, which over-approximates cycles.
  walkPreorder(fn.body, (node) => {
    noteCall(node, index, targets);
  });
  return targets;
}

function reachesSelf(fn: ts.Node, callees: ReadonlyMap<ts.Node, ReadonlySet<ts.Node>>): boolean {
  const visited = new Set<ts.Node>([fn]);
  const pending = [...(callees.get(fn) ?? [])];
  while (pending.length > 0) {
    const hop = pending.pop();
    if (hop === undefined) break;
    if (hop === fn) return true;
    if (visited.has(hop)) continue;
    visited.add(hop);
    const more = callees.get(hop);
    if (more !== undefined) {
      for (const next of more) pending.push(next);
    }
  }
  return false;
}

// Functions that can reach themselves become loop regions; re-entry is cut.
export function collectRecursiveFunctions(
  scriptFile: ts.SourceFile,
  checker: ts.TypeChecker,
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>,
): Set<ts.Node> {
  const declared: ScriptFunction[] = [];
  walkPreorder(scriptFile, (node) => {
    const decl = asScriptFunction(node, scriptFile);
    if (decl !== undefined) declared.push(decl);
  });
  const index: CallIndex = { checker, scriptFile, applications };
  const callees = new Map(declared.map((fn) => [fn, targetsIn(fn, index)] as const));
  return new Set(declared.filter((fn) => reachesSelf(fn, callees)));
}
