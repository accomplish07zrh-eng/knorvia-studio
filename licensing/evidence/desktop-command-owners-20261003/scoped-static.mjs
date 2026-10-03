import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";

const directory = "packages/desktop/src/main/browserView";
const names = [
  "browserCommandInput",
  "browserCommandInteractionHandlers",
  "browserCommandPageHandlers",
];
const base = process.env.KNORVIA_OWNER_BASELINE ?? directory;
const virtual = "/virtual-knorvia-command";
const sources = new Map(
  names.map((name) => [
    virtual + "/" + name + ".ts",
    fs.readFileSync(path.join(base, name + ".ts"), "utf8"),
  ]),
);
sources.set(
  virtual + "/browserCommandTypes.d.ts",
  fs.readFileSync(directory + "/browserCommandTypes.ts", "utf8"),
);
sources.set(
  virtual + "/shared.d.ts",
  `
export type BrowserKeyModifier='Alt'|'Control'|'ControlOrMeta'|'Meta'|'Shift';
export type BrowserMouseButton='left'|'right'|'middle';
export type BrowserPageState={url:string;scrollX?:number;scrollY?:number;viewportWidth?:number;viewportHeight?:number};
export type BrowserCommandResult={ok:boolean;elapsedMs:number;state?:BrowserPageState;image?:{base64:string;mimeType:string};value?:unknown;snapshot?:unknown;element?:unknown;error?:{code:string;message:string;sideEffect?:string}};
export type BrowserCommand=(
{method:'click';ref?:string;x?:number;y?:number;button?:BrowserMouseButton;doubleClick?:boolean;modifiers?:BrowserKeyModifier[]}|
{method:'hover';ref?:string;x?:number;y?:number;modifiers?:BrowserKeyModifier[]}|
{method:'type';ref?:string;text:string}|
{method:'press';ref?:string;key:string;modifiers?:BrowserKeyModifier[]}|
{method:'cuaKeypress';keys:string[]}|
{method:'scroll';ref?:string;x?:number;y?:number}|
{method:'cuaScroll';x:number;y:number;scrollX:number;scrollY:number;modifiers?:BrowserKeyModifier[]}|
{method:'domCuaScroll';nodeId?:string;scrollX:number;scrollY:number}|
{method:'select';ref:string;values:string[]}|
{method:'check';ref:string;checked?:boolean}|
{method:'drag';fromRef?:string;toRef?:string;from?:{x:number;y:number};to?:{x:number;y:number};modifiers?:BrowserKeyModifier[]}|
{method:'cuaDrag';path:Array<{x:number;y:number}>;modifiers?:BrowserKeyModifier[]}|
{method:'elementInfo';x:number;y:number}|
{method:'navigate';url:string}|
{method:'getState'}|
{method:'screenshot';ref?:string;fullPage?:boolean;clip?:{x:number;y:number;width:number;height:number}}|
{method:'snapshot';maxElements?:number;includeHidden?:boolean}|
{method:'evaluate';expression:string}) & {tabId?:string};
type Schema={safeParse(value:unknown):{success:true;data:unknown}|{success:false;error:{issues:Array<{message?:string}>}}};
export const browserSnapshotSchema:Schema;
export const browserSnapshotElementSchema:Schema;
`,
);
sources.set(
  virtual + "/ports.d.ts",
  `
import type {ControlledView,ControlledViewWebContents} from './browserCommandTypes.js';
import type {BrowserCommandResult,BrowserPageState} from '@knorvia/shared';
export type BrowserCommandDone=(partial:Omit<BrowserCommandResult,'elapsedMs'>)=>BrowserCommandResult;
export function executionError(message:string):Omit<BrowserCommandResult,'elapsedMs'>;
export function refNotFound(ref:string):Omit<BrowserCommandResult,'elapsedMs'>;
export function RESOLVE_SCRIPT(ref:string):string;
export function CHECK_SCRIPT(ref:string,checked:boolean):string;
export function SELECT_SCRIPT(ref:string,values:readonly string[]):string;
export function ELEMENT_AT_POINT_SCRIPT(x:number,y:number):string;
export function SNAPSHOT_SCRIPT(maxElements?:number,includeHidden?:boolean):string;
export function EVALUATE_SCRIPT(expression:string):string;
export const VIEWPORT_SCRIPT:string;
export function isAllowedBrowserUrl(url:string):boolean;
export function readState(contents:ControlledViewWebContents):BrowserPageState;
export function settleNavigation(promise:Promise<void>,timeoutMs:number,signal?:AbortSignal):Promise<void>;
export const DEFAULT_NAVIGATE_SETTLE_MS:number;
export class BrowserNavigationTimeoutError extends Error {}
export function pasteTextIntoFocusedTarget(view:ControlledView,text:string):Promise<void>;
export function captureScreenshotWithCssPixelCorrection(view:ControlledView,params:Record<string,unknown>):Promise<{data?:string}|null>;
`,
);
sources.set(virtual + "/globals.d.ts", "declare const process:{platform:string};");

const options = {
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  noEmit: true,
  types: [],
  skipLibCheck: false,
};
const standard = ts.createCompilerHost(options);
const stdlib = path.dirname(ts.getDefaultLibFilePath(options)) + path.sep;
const permits = (file) => sources.has(file) || path.resolve(file).startsWith(stdlib);
const host = {
  ...standard,
  fileExists: (file) => sources.has(file) || (permits(file) && standard.fileExists(file)),
  readFile: (file) => sources.get(file) ?? (permits(file) ? standard.readFile(file) : undefined),
  getSourceFile: (file, version) => {
    if (sources.has(file)) return ts.createSourceFile(file, sources.get(file), version, true);
    if (permits(file)) return standard.getSourceFile(file, version);
    return undefined;
  },
  resolveModuleNames: (requests) =>
    requests.map((request) => {
      const candidate = virtual + "/" + request.replace(/^\.\//, "").replace(/\.js$/, ".ts");
      const target =
        request === "@knorvia/shared"
          ? virtual + "/shared.d.ts"
          : sources.has(candidate)
            ? candidate
            : request === "./browserCommandTypes.js"
              ? virtual + "/browserCommandTypes.d.ts"
              : [
                    "./browserCommandScripts.js",
                    "./browserCommandState.js",
                    "./browserCommandResult.js",
                    "./browserVirtualClipboard.js",
                    "./browserScreenshotCapture.js",
                  ].includes(request)
                ? virtual + "/ports.d.ts"
                : undefined;
      return target
        ? {
            resolvedFileName: target,
            extension: target.endsWith(".d.ts") ? ts.Extension.Dts : ts.Extension.Ts,
          }
        : undefined;
    }),
};
const program = ts.createProgram([...sources.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => virtual,
    getCanonicalFileName: (name) => name,
    getNewLine: () => "\n",
  }),
);
console.log(
  `Restricted synthetic public-port semantic diagnostics: ${diagnostics.length}. Imported product/declaration/native acceptance NOT certified.`,
);

for (const name of [
  ...names,
  "browserCommandExecutor",
  "browserPlaywrightExecutor",
  "browserPlaywrightLocatorExecutor",
]) {
  const file = names.includes(name)
    ? path.join(base, name + ".ts")
    : directory + "/" + name + ".ts";
  const syntax = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: options,
  });
  assert.equal(
    syntax.diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error).length,
    0,
    file,
  );
}
const checker = program.getTypeChecker();
const publicShapes = [];
const expected = [
  [
    "modifiersBitmask",
    "resolveRefCenter",
    "dispatchClickAt",
    "dispatchDrag",
    "dispatchDragPath",
    "dispatchScrollGesture",
    "dispatchKeyPress",
    "dispatchKey",
  ],
  [
    "handleClick",
    "handleType",
    "handlePress",
    "handleCuaKeypress",
    "handleScroll",
    "handleCuaScroll",
    "handleDomCuaScroll",
    "handleHover",
    "handleSelect",
    "handleCheck",
    "handleDrag",
    "handleCuaDrag",
    "handleElementInfo",
  ],
  [
    "buildViewportScreenshotParams",
    "handleNavigate",
    "handleGetState",
    "handleScreenshot",
    "handleSnapshot",
    "handleEvaluate",
  ],
];
for (const [index, name] of names.entries()) {
  const file = program.getSourceFile(virtual + "/" + name + ".ts");
  const exports = checker
    .getExportsOfModule(checker.getSymbolAtLocation(file))
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(
    exports.map((item) => item.name),
    [...expected[index]].sort(),
  );
  for (const symbol of exports) {
    const signature = checker.getTypeOfSymbolAtLocation(symbol, file).getCallSignatures()[0];
    publicShapes.push({
      name: symbol.name,
      parameters: signature.parameters.map((param) => ({
        type: checker.typeToString(
          checker.getTypeOfSymbolAtLocation(param, file),
          undefined,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
        ),
        optional: Boolean(
          param.valueDeclaration.questionToken || param.valueDeclaration.initializer,
        ),
      })),
      result: checker.typeToString(
        checker.getReturnTypeOfSignature(signature),
        undefined,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
      ),
    });
  }
}
console.log(
  "Public owner exports: " + publicShapes.length + "; directly affected consumer syntax: 3.",
);
if (process.env.KNORVIA_PUBLIC_SHAPE_OUT)
  fs.writeFileSync(
    process.env.KNORVIA_PUBLIC_SHAPE_OUT,
    JSON.stringify(publicShapes, null, 2) + "\n",
    { flag: "wx" },
  );
if (process.env.KNORVIA_PUBLIC_SHAPE_COMPARE)
  assert.deepEqual(
    publicShapes,
    JSON.parse(fs.readFileSync(process.env.KNORVIA_PUBLIC_SHAPE_COMPARE, "utf8")),
  );
if (diagnostics.length) process.exitCode = 1;
