import path from "node:path";
import ts from "typescript";

// Strict local owner checking against synthetic public ports, never product dependency bodies/config.
const baseline = process.argv.includes("--baseline");
const virtual = path.resolve("/tmp/knorvia-host-resource-virtual-ports.d.ts");
const declarations = [
  'declare module "@knorvia/rpc" { export interface IDisposable { dispose(): void; } }',
  'declare module "@knorvia/server/remote" { export interface IRemoteBackend { upload(local: string, remote: string): Promise<void>; } }',
  'declare module "@knorvia/shared" {',
  ' export type RemoteTarget = {kind:"ssh"; syntheticIdentity?:string} | {kind:"wsl"; distro?:string; user?:string} | {kind:"docker"};',
  ' export type WindowHostAttachmentScope = {kind:"local";workspacePath?:string;workspaceIdentity?:string} | {kind:"remote";remoteSessionId:string;workspacePath?:string;workspaceIdentity?:string};',
  " export interface WindowHostRemoteWorkspaceDescriptor {remoteSessionId:string;target:RemoteTarget;workspacePath?:string;workspaceIdentity?:string;generation:number;}",
  " export interface BrowserRecordingArtifact {path:string;[key:string]:unknown;}",
  " export function resolveWorkspaceKey(context:{workspacePath:string;workspaceIdentity?:string}):string;",
  " export function buildSshRemoteHostKey(target:RemoteTarget):string;",
  " export function stripRemoteTargetSecrets(target:RemoteTarget):RemoteTarget;",
  "}",
  'declare module "node:fs/promises" {export function copyFile(a:string,b:string):Promise<void>;export function mkdir(p:string,o:{recursive:boolean}):Promise<void>;export function rename(a:string,b:string):Promise<void>;export function rm(p:string,o:{force:boolean}):Promise<void>;}',
  'declare module "node:path" {export function dirname(p:string):string;export function relative(a:string,b:string):string;export function resolve(...parts:string[]):string;export const posix:{normalize(p:string):string;isAbsolute(p:string):boolean;join(...p:string[]):string};}',
  'declare module "node:crypto" {export function randomUUID():string;}',
].join("\n");
const names = [
  "browserRecordingArtifactMaterializer",
  "hostRemoteWorkspaceProxyState",
  "windowRemoteConnectionRegistry",
];
const root = baseline
  ? "/tmp/knorvia-host-resource-baseline"
  : path.join(process.cwd(), "packages/desktop/src/host");
const files = names.map((name) => path.join(root, name + ".ts"));
const options = {
  noEmit: true,
  strict: true,
  types: [],
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: false,
};
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host),
  exists = host.fileExists.bind(host);
const library = path.dirname(ts.getDefaultLibFilePath(options)) + path.sep;
host.readFile = (file) => {
  if (file === virtual) return declarations;
  if (file.endsWith(".json")) return undefined; // Hide all package/config metadata.
  if (!files.includes(file) && !file.startsWith(library))
    throw new Error("unscoped type-source read: " + file);
  return read(file);
};
host.resolveModuleNames = (names) => names.map(() => undefined); // Only virtual ambient ports.
host.fileExists = (file) => file === virtual || (!file.endsWith(".json") && exists(file));
host.getSourceFile = (file, languageVersion) => {
  const source = host.readFile(file);
  return source === undefined
    ? undefined
    : ts.createSourceFile(file, source, languageVersion, true);
};
const program = ts.createProgram([...files, virtual], options, host);
for (const file of program.getSourceFiles()) {
  if (
    file.fileName !== virtual &&
    !files.includes(file.fileName) &&
    !file.fileName.startsWith(library)
  ) {
    throw new Error("unscoped type graph: " + file.fileName);
  }
}
const diagnostics = ts.getPreEmitDiagnostics(program);
for (const diagnostic of diagnostics) {
  const position =
    diagnostic.file && diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  console.log(
    (diagnostic.file?.fileName ?? "<compiler>") +
      (position ? ":" + (position.line + 1) + ":" + (position.character + 1) : "") +
      " TS" +
      diagnostic.code +
      " " +
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );
}
console.log(
  "Strict synthetic-port owner diagnostics: " +
    diagnostics.length +
    "; no imported product types/config, declaration emit, native or full-project acceptance.",
);
process.exitCode = diagnostics.length ? 1 : 0;
