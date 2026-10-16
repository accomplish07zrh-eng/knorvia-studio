// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";

// How often a library callee invokes script functions, and whether that invocation
// is provable. `.call` / `.apply` / `.bind` are not callbacks; they forward the callee.

export type CallbackMultiplicity = "each" | "once";

export interface CallbackSemantics {
  multiplicity: CallbackMultiplicity;
  entered: boolean;
  callbacks: readonly number[];
  label: string;
  deferred?: true;
  iterated?: ts.Expression;
  elementParams?: readonly number[];
  wholeParams?: readonly number[];
  accumulatorParam?: number;
}

export const DEFAULT_CALLBACK_SEMANTICS: Pick<CallbackSemantics, "multiplicity" | "entered"> = {
  entered: false,
  multiplicity: "once",
};

interface EachProfile {
  readonly element: readonly number[];
  readonly whole: readonly number[];
  readonly accumulator?: number;
}

function eachProfile(method: string): EachProfile | undefined {
  switch (method) {
    case "map":
    case "flatMap":
    case "forEach":
    case "filter":
    case "some":
    case "every":
    case "find":
    case "findIndex":
    case "findLast":
    case "findLastIndex":
      return { element: [0], whole: [2] };
    case "reduce":
    case "reduceRight":
      return { accumulator: 0, element: [1], whole: [3] };
    case "sort":
      return { element: [0, 1], whole: [] };
    default:
      return undefined;
  }
}

function onceProfile(
  method: string,
): { callbacks: readonly number[]; entered: boolean; deferred: true } | undefined {
  switch (method) {
    case "then":
      return { callbacks: [0, 1], deferred: true, entered: false };
    case "catch":
      return { callbacks: [0], deferred: true, entered: false };
    case "finally":
      return { callbacks: [0], deferred: true, entered: true };
    default:
      return undefined;
  }
}

function scheduledGlobal(name: string): boolean {
  switch (name) {
    case "setTimeout":
    case "setInterval":
    case "setImmediate":
    case "queueMicrotask":
      return true;
    default:
      return false;
  }
}

export function callbackSemanticsOf(
  syntax: ts.CallExpression | ts.NewExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): CallbackSemantics | undefined {
  const args = syntax.arguments ?? [];
  if (ts.isNewExpression(syntax)) return promiseConstructor(syntax, args, checker, program);
  const callee = syntax.expression;
  if (ts.isPropertyAccessExpression(callee)) return memberSemantics(callee, args, checker, program);
  if (ts.isIdentifier(callee) === false) return undefined;
  if (scheduledGlobal(callee.text) === false) return undefined;
  if (isGlobalLibValue(callee, callee.text, checker, program) === false) return undefined;
  return {
    callbacks: [0],
    deferred: true,
    entered: false,
    label: callee.text,
    multiplicity: "once",
  };
}

function promiseConstructor(
  syntax: ts.NewExpression,
  args: readonly ts.Expression[],
  checker: ts.TypeChecker,
  program: ts.Program,
): CallbackSemantics | undefined {
  const isPromise = isGlobalLibValue(syntax.expression, "Promise", checker, program);
  if (isPromise === false || args.length === 0) return undefined;
  return { callbacks: [0], entered: true, label: "Promise", multiplicity: "once" };
}

function memberSemantics(
  callee: ts.PropertyAccessExpression,
  args: readonly ts.Expression[],
  checker: ts.TypeChecker,
  program: ts.Program,
): CallbackSemantics | undefined {
  if (isScriptDeclared(callee.name, checker, program)) return undefined;
  const method = callee.name.text;
  if (method === "from") return arrayFromSemantics(callee, args, checker, program);
  const each = eachProfile(method);
  if (each !== undefined) return eachSemantics(callee.expression, method, each);
  const once = onceProfile(method);
  if (once === undefined) return undefined;
  return { ...once, label: method, multiplicity: "once" };
}

function arrayFromSemantics(
  callee: ts.PropertyAccessExpression,
  args: readonly ts.Expression[],
  checker: ts.TypeChecker,
  program: ts.Program,
): CallbackSemantics | undefined {
  if (isGlobalLibValue(callee.expression, "Array", checker, program) === false) return undefined;
  const iterated = args[0];
  if (iterated === undefined || args.length < 2) return undefined;
  return {
    callbacks: [1],
    elementParams: [0],
    entered: false,
    iterated,
    label: "from",
    multiplicity: "each",
    wholeParams: [],
  };
}

function eachSemantics(
  iterated: ts.Expression,
  method: string,
  each: EachProfile,
): CallbackSemantics {
  const base: CallbackSemantics = {
    callbacks: [0],
    elementParams: each.element,
    entered: false,
    iterated,
    label: method,
    multiplicity: "each",
    wholeParams: each.whole,
  };
  if (each.accumulator === undefined) return base;
  return { ...base, accumulatorParam: each.accumulator };
}

export function isGlobalLibValue(
  expr: ts.Expression,
  name: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const symbol = resolveAlias(checker, checker.getSymbolAtLocation(expr));
  if (symbol === undefined || symbol.name !== name) return false;
  const declarations = symbol.declarations;
  if (declarations === undefined) return false;
  return declarations.some((declaration) => isLibDeclaration(declaration, program));
}

function resolveAlias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
  if (symbol === undefined) return undefined;
  const aliased = (symbol.flags & ts.SymbolFlags.Alias) !== 0;
  return aliased ? checker.getAliasedSymbol(symbol) : symbol;
}

// Every declaration lives outside the authored script. No declarations (an `any`
// receiver) is not foreign — the value-based callee answer still applies.
export function isForeignMember(
  name: ts.MemberName,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
): boolean {
  const declarations = checker.getSymbolAtLocation(name)?.declarations;
  if (declarations === undefined || declarations.length === 0) return false;
  return declarations.every((declaration) => declaration.getSourceFile() !== scriptFile);
}

function isScriptDeclared(
  name: ts.MemberName,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const declarations = checker.getSymbolAtLocation(name)?.declarations;
  if (declarations === undefined) return false;
  return declarations.some((declaration) => {
    const file = declaration.getSourceFile();
    return isLibDeclaration(declaration, program) === false && file.isDeclarationFile === false;
  });
}

function isLibDeclaration(declaration: ts.Declaration, program: ts.Program): boolean {
  const file = declaration.getSourceFile();
  return program.isSourceFileDefaultLibrary(file) || /^lib\..+\.d\.ts$/.test(file.fileName);
}
