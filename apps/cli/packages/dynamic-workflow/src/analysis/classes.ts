// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  addPlaceholder,
  cloneValue,
  emptyValue,
  liveField,
  mergeInto,
  peelPlace,
  staticIndexKey,
  type AbstractValue,
} from "./domain.js";
import { applyConstructor } from "./promise-ops.js";
import type { EvalContext, Evaluator } from "./taint.js";

// One shared instance per class. `extends` weak-merges the base each pass.
// Dynamic computed names have no field: methods join top-level fns, getters
// smear into the instance, and field initializers are skipped.

export function evalClasses(analysis: Evaluator): void {
  const frame: EvalContext = { onReturn: () => undefined, regionStack: ["top"] };
  analysis.s.classes.forEach((cls) => evalClassBody(analysis, cls as ts.ClassLikeDeclaration, frame));
}

function evalClassBody(analysis: Evaluator, cls: ts.ClassLikeDeclaration, frame: EvalContext): void {
  const instance = analysis.s.instanceOf(cls);
  resolvedBases(analysis, cls).forEach((base) => {
    analysis.s.changed = mergeInto(instance, analysis.s.instanceOf(base)) || analysis.s.changed;
  });
  cls.members.forEach((member) => dispatchMember(analysis, instance, member, frame));
}

function dispatchMember(
  analysis: Evaluator,
  instance: AbstractValue,
  member: ts.ClassElement,
  frame: EvalContext,
): void {
  switch (member.kind) {
    case ts.SyntaxKind.PropertyDeclaration: {
      const prop = member as ts.PropertyDeclaration;
      const key = staticMemberKey(analysis, prop.name);
      if (key !== undefined && prop.initializer !== undefined) {
        mergeInstanceField(analysis, instance, key, analysis.evalExpr(prop.initializer, frame));
      }
      return;
    }
    case ts.SyntaxKind.ClassStaticBlockDeclaration:
      (member as ts.ClassStaticBlockDeclaration).body.statements.forEach((stmt) =>
        analysis.visit(stmt, frame),
      );
      return;
    case ts.SyntaxKind.MethodDeclaration:
      registerMember(
        analysis,
        instance,
        staticMemberKey(analysis, (member as ts.MethodDeclaration).name),
        member,
      );
      return;
    case ts.SyntaxKind.GetAccessor: {
      const getter = member as ts.GetAccessorDeclaration;
      const id = analysis.s.fnId.get(getter);
      if (id === undefined) return;
      mergeInstanceField(
        analysis,
        instance,
        staticMemberKey(analysis, getter.name),
        cloneValue(analysis.s.summaryOf(id)),
      );
      return;
    }
    case ts.SyntaxKind.Constructor:
      applyParameterProperties(analysis, instance, member as ts.ConstructorDeclaration);
      return;
    default:
      return;
  }
}

function staticMemberKey(analysis: Evaluator, name: ts.PropertyName): string | undefined {
  return ts.isComputedPropertyName(name)
    ? staticIndexKey(name.expression)
    : name.getText(analysis.s.scriptFile);
}

// Parameter properties are not statements; seed them from the constructor placeholders.
function applyParameterProperties(
  analysis: Evaluator,
  instance: AbstractValue,
  ctor: ts.ConstructorDeclaration,
): void {
  const id = analysis.s.fnId.get(ctor);
  if (id === undefined) return;
  ctor.parameters.forEach((param, index) => {
    if (
      ts.isParameterPropertyDeclaration(param, ctor) === false ||
      ts.isIdentifier(param.name) === false
    ) {
      return;
    }
    const seeded = emptyValue();
    addPlaceholder(seeded, { fnId: id, param: index });
    mergeInstanceField(analysis, instance, param.name.text, seeded);
  });
}

function mergeInstanceField(
  analysis: Evaluator,
  instance: AbstractValue,
  key: string | undefined,
  value: AbstractValue,
): void {
  const field = key === undefined ? instance : liveField(instance, key);
  if (field !== value) analysis.s.changed = mergeInto(field, value) || analysis.s.changed;
}

function registerMember(
  analysis: Evaluator,
  instance: AbstractValue,
  key: string | undefined,
  fn: ts.Node,
): void {
  const target = key === undefined ? instance : liveField(instance, key);
  if (target.fns.has(fn)) return;
  target.fns.add(fn);
  analysis.s.changed = true;
}

export function resolveClassNode(analysis: Evaluator, expr: ts.Expression): ts.Node | undefined {
  const named = analysis.checker.getSymbolAtLocation(expr);
  return named === undefined ? undefined : classNodeOfSymbol(analysis, named);
}

export function classNodeOfSymbol(
  analysis: Evaluator,
  sym: ts.Symbol,
  seen: Set<ts.Symbol> = new Set<ts.Symbol>(),
): ts.Node | undefined {
  if (seen.has(sym)) return undefined;
  seen.add(sym);
  const declarations = sym.declarations ?? [];
  for (let index = 0; index < declarations.length; index += 1) {
    const decl = declarations[index];
    if (decl === undefined) continue;
    const isClass =
      (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) && analysis.s.classInstances.has(decl);
    if (isClass) return decl;
    const init =
      ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)
        ? decl.initializer
        : undefined;
    const via = init === undefined ? undefined : classNodeFromExpr(analysis, init, seen);
    if (via !== undefined) return via;
  }
  return undefined;
}

function classNodeFromExpr(
  analysis: Evaluator,
  expr: ts.Expression,
  seen: Set<ts.Symbol>,
): ts.Node | undefined {
  const peeled = peelPlace(expr);
  if (ts.isClassExpression(peeled) && analysis.s.classInstances.has(peeled)) return peeled;
  if (ts.isIdentifier(peeled) === false && ts.isPropertyAccessExpression(peeled) === false)
    return undefined;
  const named = analysis.checker.getSymbolAtLocation(peeled);
  return named === undefined ? undefined : classNodeOfSymbol(analysis, named, seen);
}

export function classConstructor(
  analysis: Evaluator,
  cls: ts.Node,
  seen: Set<ts.Node> = new Set<ts.Node>(),
): ts.ConstructorDeclaration | undefined {
  if (seen.has(cls)) return undefined;
  seen.add(cls);
  const host = cls as ts.ClassLikeDeclaration;
  for (let index = 0; index < host.members.length; index += 1) {
    const member = host.members[index];
    if (member !== undefined && ts.isConstructorDeclaration(member) && member.body !== undefined)
      return member;
  }
  const bases = resolvedBases(analysis, host);
  for (let index = 0; index < bases.length; index += 1) {
    const base = bases[index];
    if (base === undefined) continue;
    const inherited = classConstructor(analysis, base, seen);
    if (inherited !== undefined) return inherited;
  }
  return undefined;
}

function resolvedBases(analysis: Evaluator, cls: ts.ClassLikeDeclaration): ts.Node[] {
  const found: ts.Node[] = [];
  (cls.heritageClauses ?? []).forEach((clause) => {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) return;
    clause.types.forEach((type) => {
      const base = resolveClassNode(analysis, type.expression);
      if (base !== undefined) found.push(base);
    });
  });
  return found;
}

function innermostClass(syntax: ts.Node): ts.ClassLikeDeclaration | undefined {
  let cur: ts.Node | undefined = syntax.parent;
  while (cur !== undefined && ts.isClassLike(cur) === false) cur = cur.parent;
  return cur === undefined ? undefined : cur;
}

export function enclosingClassInstance(analysis: Evaluator, syntax: ts.Node): AbstractValue | undefined {
  const host = innermostClass(syntax);
  return host === undefined ? undefined : analysis.s.instanceOf(host);
}

export function enclosingBaseInstance(analysis: Evaluator, syntax: ts.Node): AbstractValue | undefined {
  const host = innermostClass(syntax);
  const base = host === undefined ? undefined : resolvedBases(analysis, host)[0];
  return base === undefined ? undefined : analysis.s.instanceOf(base);
}

export function hasUnresolvedHeritage(analysis: Evaluator, cls: ts.Node): boolean {
  return ((cls as ts.ClassLikeDeclaration).heritageClauses ?? []).some((clause) => {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) return false;
    return clause.types.some((type) => resolveClassNode(analysis, type.expression) === undefined);
  });
}

// Innermost class only. Each resolvable base constructor re-reads the arguments.
export function applySuperCall(analysis: Evaluator, syntax: ts.CallExpression, frame: EvalContext): void {
  const host = innermostClass(syntax);
  if (host === undefined) return;
  (host.heritageClauses ?? []).forEach((clause) => {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) return;
    clause.types.forEach((type) =>
      invokeSuperBase(analysis, syntax, frame, resolveClassNode(analysis, type.expression)),
    );
  });
}

function invokeSuperBase(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  frame: EvalContext,
  base: ts.Node | undefined,
): void {
  const ctor = base === undefined ? undefined : classConstructor(analysis, base);
  const id = ctor === undefined ? undefined : analysis.s.fnId.get(ctor);
  if (id === undefined) return;
  const argVals: AbstractValue[] = [];
  syntax.arguments.forEach((arg) => argVals.push(analysis.evalExpr(arg, frame)));
  const argPlaces: (AbstractValue | undefined)[] = [];
  syntax.arguments.forEach((arg) => argPlaces.push(analysis.resolvePlace(arg)));
  applyConstructor(analysis, id, frame, argVals, argPlaces, syntax);
}
