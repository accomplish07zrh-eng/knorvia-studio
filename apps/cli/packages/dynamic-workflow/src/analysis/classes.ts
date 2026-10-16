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

// One shared instance per class, static and instance members together. `extends`
// weak-merges the base each pass. A dynamic computed name has no field: methods
// join the instance's top-level functions, getters smear into the instance, and
// a field initializer is skipped. Parameter properties are not statements; they
// are seeded from the constructor's placeholders.

function grew(analysis: Evaluator, changed: boolean): void {
  if (changed) analysis.s.changed = true;
}

class ClassPass {
  constructor(private readonly analysis: Evaluator) {}

  run(): void {
    const frame: EvalContext = { onReturn: () => undefined, regionStack: ["top"] };
    this.analysis.s.classes.forEach((cls) =>
      new ClassBody(this.analysis, cls as ts.ClassLikeDeclaration, frame).eval(),
    );
  }
}

class ClassBody {
  private readonly instance: AbstractValue;

  constructor(
    private readonly analysis: Evaluator,
    private readonly cls: ts.ClassLikeDeclaration,
    private readonly frame: EvalContext,
  ) {
    this.instance = analysis.s.instanceOf(cls);
  }

  eval(): void {
    resolvedBases(this.analysis, this.cls).forEach((base) => {
      grew(this.analysis, mergeInto(this.instance, this.analysis.s.instanceOf(base)));
    });
    this.cls.members.forEach((member) => this.member(member));
  }

  private member(member: ts.ClassElement): void {
    const kind = member.kind;
    if (kind === ts.SyntaxKind.PropertyDeclaration) this.field(member as ts.PropertyDeclaration);
    else if (kind === ts.SyntaxKind.ClassStaticBlockDeclaration)
      this.block(member as ts.ClassStaticBlockDeclaration);
    else if (kind === ts.SyntaxKind.MethodDeclaration) this.method(member as ts.MethodDeclaration);
    else if (kind === ts.SyntaxKind.GetAccessor) this.getter(member as ts.GetAccessorDeclaration);
    else if (kind === ts.SyntaxKind.Constructor)
      this.parameters(member as ts.ConstructorDeclaration);
  }

  private field(prop: ts.PropertyDeclaration): void {
    const key = memberKey(this.analysis, prop.name);
    if (key === undefined || prop.initializer === undefined) return;
    this.merge(key, this.analysis.evalExpr(prop.initializer, this.frame));
  }

  private block(block: ts.ClassStaticBlockDeclaration): void {
    block.body.statements.forEach((stmt) => this.analysis.visit(stmt, this.frame));
  }

  private method(method: ts.MethodDeclaration): void {
    this.register(memberKey(this.analysis, method.name), method);
  }

  // The field's read value is the getter summary, re-read each pass. A dynamic
  // name cannot be stored under a key, so it smears into the instance.
  private getter(getter: ts.GetAccessorDeclaration): void {
    const id = this.analysis.s.fnId.get(getter);
    if (id === undefined) return;
    this.merge(memberKey(this.analysis, getter.name), cloneValue(this.analysis.s.summaryOf(id)));
  }

  private parameters(ctor: ts.ConstructorDeclaration): void {
    const id = this.analysis.s.fnId.get(ctor);
    if (id === undefined) return;
    ctor.parameters.forEach((param, index) => this.parameter(ctor, param, id, index));
  }

  private parameter(
    ctor: ts.ConstructorDeclaration,
    param: ts.ParameterDeclaration,
    id: number,
    index: number,
  ): void {
    if (
      ts.isParameterPropertyDeclaration(param, ctor) === false ||
      ts.isIdentifier(param.name) === false
    )
      return;
    const seeded = emptyValue();
    addPlaceholder(seeded, { fnId: id, param: index });
    this.merge(param.name.text, seeded);
  }

  private merge(key: string | undefined, value: AbstractValue): void {
    const field = key === undefined ? this.instance : liveField(this.instance, key);
    if (field !== value) grew(this.analysis, mergeInto(field, value));
  }

  private register(key: string | undefined, fn: ts.Node): void {
    const target = key === undefined ? this.instance : liveField(this.instance, key);
    if (target.fns.has(fn)) return;
    target.fns.add(fn);
    this.analysis.s.changed = true;
  }
}

function memberKey(analysis: Evaluator, name: ts.PropertyName): string | undefined {
  if (ts.isComputedPropertyName(name)) return staticIndexKey(name.expression);
  return name.getText(analysis.s.scriptFile);
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

class ClassLookup {
  constructor(
    private readonly analysis: Evaluator,
    private readonly seen: Set<ts.Symbol>,
  ) {}

  nodeOf(sym: ts.Symbol): ts.Node | undefined {
    if (this.seen.has(sym)) return undefined;
    this.seen.add(sym);
    for (const decl of sym.declarations ?? []) {
      const hit = this.declaration(decl);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  private declaration(decl: ts.Declaration): ts.Node | undefined {
    const direct = this.directClass(decl);
    if (direct !== undefined) return direct;
    const init = this.initializer(decl);
    return init === undefined ? undefined : classFromExpr(this.analysis, init, this.seen);
  }

  private directClass(decl: ts.Declaration): ts.Node | undefined {
    const isClass =
      (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) &&
      this.analysis.s.classInstances.has(decl);
    return isClass ? decl : undefined;
  }

  // `const Alias = Cfg` and `{ C: class {} }` store the class in an initializer.
  private initializer(decl: ts.Declaration): ts.Expression | undefined {
    if (ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)) return decl.initializer;
    return undefined;
  }
}

function classFromExpr(
  analysis: Evaluator,
  expr: ts.Expression,
  seen: Set<ts.Symbol>,
): ts.Node | undefined {
  const peeled = peelPlace(expr);
  if (ts.isClassExpression(peeled) && analysis.s.classInstances.has(peeled)) return peeled;
  if (ts.isIdentifier(peeled) === false && ts.isPropertyAccessExpression(peeled) === false)
    return undefined;
  const named = analysis.checker.getSymbolAtLocation(peeled);
  return named === undefined ? undefined : new ClassLookup(analysis, seen).nodeOf(named);
}

class CtorChain {
  constructor(
    private readonly analysis: Evaluator,
    private readonly seen: Set<ts.Node>,
  ) {}

  // Own body-bearing constructor, else the nearest inherited one. Overload
  // signatures without a body are skipped. The seen set stops an extends cycle.
  find(cls: ts.Node): ts.ConstructorDeclaration | undefined {
    if (this.seen.has(cls)) return undefined;
    this.seen.add(cls);
    const host = cls as ts.ClassLikeDeclaration;
    const own = host.members.find((member): member is ts.ConstructorDeclaration => {
      return ts.isConstructorDeclaration(member) && member.body !== undefined;
    });
    if (own !== undefined) return own;
    for (const base of resolvedBases(this.analysis, host)) {
      const inherited = this.find(base);
      if (inherited !== undefined) return inherited;
    }
    return undefined;
  }
}

function innermost(syntax: ts.Node): ts.ClassLikeDeclaration | undefined {
  let cur: ts.Node | undefined = syntax.parent;
  while (cur !== undefined && ts.isClassLike(cur) === false) cur = cur.parent;
  return cur;
}

export function evalClasses(analysis: Evaluator): void {
  new ClassPass(analysis).run();
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
  return new ClassLookup(analysis, seen).nodeOf(sym);
}

export function classConstructor(
  analysis: Evaluator,
  cls: ts.Node,
  seen: Set<ts.Node> = new Set<ts.Node>(),
): ts.ConstructorDeclaration | undefined {
  return new CtorChain(analysis, seen).find(cls);
}

export function enclosingClassInstance(
  analysis: Evaluator,
  syntax: ts.Node,
): AbstractValue | undefined {
  const host = innermost(syntax);
  return host === undefined ? undefined : analysis.s.instanceOf(host);
}

// Only the innermost class. `super` denotes that class's first resolvable base.
export function enclosingBaseInstance(
  analysis: Evaluator,
  syntax: ts.Node,
): AbstractValue | undefined {
  const host = innermost(syntax);
  const base = host === undefined ? undefined : resolvedBases(analysis, host).at(0);
  return base === undefined ? undefined : analysis.s.instanceOf(base);
}

export function hasUnresolvedHeritage(analysis: Evaluator, cls: ts.Node): boolean {
  return ((cls as ts.ClassLikeDeclaration).heritageClauses ?? []).some((clause) => {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) return false;
    return clause.types.some((type) => resolveClassNode(analysis, type.expression) === undefined);
  });
}

// Innermost class only. Each resolvable base constructor re-reads the arguments.
export function applySuperCall(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  frame: EvalContext,
): void {
  const host = innermost(syntax);
  if (host === undefined) return;
  (host.heritageClauses ?? []).forEach((clause) => {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) return;
    clause.types.forEach((type) =>
      applyBase(analysis, syntax, frame, resolveClassNode(analysis, type.expression)),
    );
  });
}

function applyBase(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  frame: EvalContext,
  base: ts.Node | undefined,
): void {
  const ctor = base === undefined ? undefined : classConstructor(analysis, base);
  const id = ctor === undefined ? undefined : analysis.s.fnId.get(ctor);
  if (id === undefined) return;
  const argVals = syntax.arguments.map((arg) => analysis.evalExpr(arg, frame));
  const argPlaces = syntax.arguments.map((arg) => analysis.resolvePlace(arg));
  applyConstructor(analysis, id, frame, argVals, argPlaces, syntax);
}
