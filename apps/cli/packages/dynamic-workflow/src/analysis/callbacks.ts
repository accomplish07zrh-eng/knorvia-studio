// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";

// How often a library runs a function value it was given, and whether that run is
// certain. The taint pass already applies every function that reaches a call. The
// ordering pass must not invent a second guess from syntax, so both passes read this
// table.
//
// `each`: once per element of `iterated`. The site table turns the call into an
// iteration candidate; the ordering walk opens a fanout region around the body.
// `once`: at most one run. `entered` means the library provably enters the body
// (a Promise executor, `.finally`). `deferred` means the body runs after the receiver
// settles, so the walk opens it with a may-barrier instead of treating it as a
// synchronous call.
//
// An unknown callee uses DEFAULT_CALLBACK_SEMANTICS: once, not entered, every
// argument a possible callback. `.call` / `.apply` / `.bind` are not callbacks; they
// forward the callee and stay on the call path.

export type CallbackMultiplicity = "each" | "once";

export interface CallbackSemantics {
  multiplicity: CallbackMultiplicity;
  // The call provably runs the callback body at least once.
  entered: boolean;
  // Argument indexes that may hold callbacks, in order.
  callbacks: readonly number[];
  // Method or global name used as the region label.
  label: string;
  // `once` only. The body runs after the receiver settles (continuation or timer).
  deferred?: true;
  // `each` only. The collection the callback walks.
  iterated?: ts.Expression;
  // `each` only. Callback parameters that receive one element.
  elementParams?: readonly number[];
  // `each` only. Callback parameters that receive the whole collection.
  wholeParams?: readonly number[];
  // `each` only. Callback parameter that receives the reduce accumulator.
  accumulatorParam?: number;
}

export const DEFAULT_CALLBACK_SEMANTICS: Pick<CallbackSemantics, "multiplicity" | "entered"> = {
  entered: false,
  multiplicity: "once",
};

// element indexes, whole-collection indexes, optional accumulator index.
type EachRow = readonly [
  label: string,
  element: readonly number[],
  whole: readonly number[],
  accumulator?: number,
];

const EACH_ROWS: readonly EachRow[] = [
  ["map", [0], [2]],
  ["flatMap", [0], [2]],
  ["forEach", [0], [2]],
  ["filter", [0], [2]],
  ["some", [0], [2]],
  ["every", [0], [2]],
  ["find", [0], [2]],
  ["findIndex", [0], [2]],
  ["findLast", [0], [2]],
  ["findLastIndex", [0], [2]],
  ["reduce", [1], [3], 0],
  ["reduceRight", [1], [3], 0],
  ["sort", [0, 1], []],
];

// callbacks indexes, and whether the body is provably entered. All of these are deferred.
const ONCE_ROWS: readonly (readonly [string, readonly number[], boolean])[] = [
  ["then", [0, 1], false],
  ["catch", [0], false],
  ["finally", [0], true],
];

const TIMER_GLOBALS = ["setTimeout", "setInterval", "setImmediate", "queueMicrotask"] as const;

const EACH_BY_NAME = new Map(EACH_ROWS.map((row) => [row[0], row] as const));
const ONCE_BY_NAME = new Map(ONCE_ROWS.map((row) => [row[0], row] as const));
const TIMER_NAMES = new Set<string>(TIMER_GLOBALS);

const LIB_FILE = /^lib\..+\.d\.ts$/u;

function pack(row: CallbackSemantics): CallbackSemantics {
  return row;
}

function eachSemantics(
  label: string,
  iterated: ts.Expression,
  callbacks: readonly number[],
  element: readonly number[],
  whole: readonly number[],
  accumulator: number | undefined,
): CallbackSemantics {
  const row = pack({
    callbacks,
    elementParams: element,
    entered: false,
    iterated,
    label,
    multiplicity: "each",
    wholeParams: whole,
  });
  if (accumulator !== undefined) row.accumulatorParam = accumulator;
  return row;
}

function onceSemantics(
  label: string,
  callbacks: readonly number[],
  entered: boolean,
  deferred: boolean,
): CallbackSemantics {
  const row = pack({ callbacks, entered, label, multiplicity: "once" });
  if (deferred) row.deferred = true;
  return row;
}

class CallbackQuery {
  constructor(
    private readonly node: ts.CallExpression | ts.NewExpression,
    private readonly checker: ts.TypeChecker,
    private readonly program: ts.Program,
  ) {}

  resolve(): CallbackSemantics | undefined {
    if (ts.isNewExpression(this.node)) return this.constructed();
    return this.called(this.node.expression);
  }

  private constructed(): CallbackSemantics | undefined {
    const args = this.node.arguments ?? [];
    const expression = this.node.expression;
    const promise = isGlobalLibValue(expression, "Promise", this.checker, this.program);
    if (!promise || args.length === 0) return undefined;
    return onceSemantics("Promise", [0], true, false);
  }

  private called(callee: ts.Expression): CallbackSemantics | undefined {
    if (ts.isPropertyAccessExpression(callee)) return this.member(callee);
    if (!ts.isIdentifier(callee)) return undefined;
    return this.timer(callee);
  }

  private member(callee: ts.PropertyAccessExpression): CallbackSemantics | undefined {
    if (isScriptDeclared(callee.name, this.checker, this.program)) return undefined;
    const method = callee.name.getText();
    if (method === "from") return this.arrayFrom(callee);
    const each = EACH_BY_NAME.get(method);
    if (each === undefined) return this.onceMember(method);
    return eachSemantics(method, callee.expression, [0], each[1], each[2], each[3]);
  }

  private onceMember(method: string): CallbackSemantics | undefined {
    const once = ONCE_BY_NAME.get(method);
    if (once === undefined) return undefined;
    return onceSemantics(once[0], once[1], once[2], true);
  }

  // Array.from(iterable, mapfn). The collection is argument 0 and the callback is argument 1.
  private arrayFrom(callee: ts.PropertyAccessExpression): CallbackSemantics | undefined {
    if (!isGlobalLibValue(callee.expression, "Array", this.checker, this.program)) return undefined;
    const args = this.node.arguments ?? [];
    const iterated = args.at(0);
    if (iterated === undefined || args.length < 2) return undefined;
    return eachSemantics("from", iterated, [1], [0], [], undefined);
  }

  private timer(callee: ts.Identifier): CallbackSemantics | undefined {
    if (!TIMER_NAMES.has(callee.text)) return undefined;
    if (!isGlobalLibValue(callee, callee.text, this.checker, this.program)) return undefined;
    return onceSemantics(callee.text, [0], false, true);
  }
}

function aliased(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  if (symbol === undefined) return undefined;
  const isAlias = (symbol.flags & ts.SymbolFlags.Alias) !== 0;
  return isAlias ? checker.getAliasedSymbol(symbol) : symbol;
}

function declaredInLib(file: ts.SourceFile, program: ts.Program): boolean {
  return program.isSourceFileDefaultLibrary(file) || LIB_FILE.test(file.fileName);
}

function authoredDeclaration(declaration: ts.Declaration, program: ts.Program): boolean {
  const host = declaration.getSourceFile();
  return declaredInLib(host, program) === false && host.isDeclarationFile === false;
}

function isScriptDeclared(
  name: ts.MemberName,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const declarations = checker.getSymbolAtLocation(name)?.declarations ?? [];
  return declarations.some((declaration) => authoredDeclaration(declaration, program));
}

export function callbackSemanticsOf(
  node: ts.CallExpression | ts.NewExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): CallbackSemantics | undefined {
  return new CallbackQuery(node, checker, program).resolve();
}

// True when `expr` resolves to the ES library global `name`, not a user binding that shadows it.
export function isGlobalLibValue(
  expr: ts.Expression,
  name: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const symbol = aliased(checker, checker.getSymbolAtLocation(expr));
  if (symbol === undefined || symbol.name !== name) return false;
  const declarations = symbol.declarations ?? [];
  return declarations.some((declaration) => declaredInLib(declaration.getSourceFile(), program));
}

// True when every declaration of the member lives outside the authored script.
// A library or facade method (`xs.map`, `p.finally`) is never a script function, even
// if a whole-value read of the receiver collapsed a callback into its function set.
// An undeclared member (an `any` receiver) keeps the value-based answer.
export function isForeignMember(
  name: ts.MemberName,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
): boolean {
  const declarations = checker.getSymbolAtLocation(name)?.declarations ?? [];
  if (declarations.length === 0) return false;
  return declarations.some((declaration) => declaration.getSourceFile() === scriptFile) === false;
}
