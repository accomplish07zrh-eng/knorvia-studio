// 仅编译独立虚拟输入：负例必须产生真实诊断，不使用类型忽略指令。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliRequire = createRequire(path.join(repoRoot, "apps/cli/package.json"));
const ts = cliRequire("typescript");
const protocolRoot = path.join(repoRoot, "apps/cli/packages/bootstrap/src/protocol");
const prelude = `
import type { RecordRecipe } from "./message-record-projection.js";
import type { KnorviaSessionEvent } from "@knorvia/shared";
type Source = { name: string; size: number; enabled?: boolean };
type Result = { kind: "row" | "column"; size: number; enabled?: boolean };
`;
const cases = [
  {
    name: "public-event-tag-union",
    codes: [],
    source: `
type EventSource = { tag: KnorviaSessionEvent["type"]; seq: number };
const recipe: RecordRecipe<EventSource, KnorviaSessionEvent> = [
  ["type", (source) => source.tag],
  ["seq", (source) => source.seq],
];
`,
  },
  {
    name: "field-types-and-common-union-keys",
    codes: [],
    source: `
const recipe: RecordRecipe<Source, Result> = [
  ["kind", (): "row" => "row"],
  ["size", (source) => source.size],
  ["enabled", (source) => source.enabled],
];
type UnionSource = { tag: "first" | "second"; value: string | number };
type UnionResult = { kind: "first"; value: string } | { kind: "second"; value: number };
const unionRecipe: RecordRecipe<UnionSource, UnionResult> = [
  ["kind", (source) => source.tag],
  ["value", (source) => source.value],
];
`,
  },
  {
    name: "unknown-field-key",
    codes: [2322],
    source: `const recipe: RecordRecipe<Source, Result> = [["missing", () => 1]];`,
  },
  {
    name: "field-value-correlation",
    codes: [2322],
    source: `const recipe: RecordRecipe<Source, Result> = [["size", (source) => source.enabled]];`,
  },
  {
    name: "optional-field-value",
    codes: [2322],
    source: `const recipe: RecordRecipe<Source, Result> = [["enabled", () => 123]];`,
  },
  {
    name: "unknown-public-event-tag",
    codes: [2322],
    source: `
const recipe: RecordRecipe<Source, KnorviaSessionEvent> = [
  ["type", (): "invalid.event" => "invalid.event"],
];
`,
  },
  {
    name: "unknown-source-property",
    codes: [2339],
    source: `const recipe: RecordRecipe<Source, Result> = [["size", (source) => source.missing]];`,
  },
];
const virtualInputs = new Map(
  cases.map((entry) => [
    path.join(protocolRoot, `__lane_recipe_${entry.name}.ts`),
    prelude + entry.source,
  ]),
);
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: ["node"],
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};
const host = ts.createCompilerHost(options);
const originalFileExists = host.fileExists.bind(host);
const originalReadFile = host.readFile.bind(host);
const originalGetSourceFile = host.getSourceFile.bind(host);
host.fileExists = (filename) => virtualInputs.has(filename) || originalFileExists(filename);
host.readFile = (filename) => virtualInputs.get(filename) ?? originalReadFile(filename);
host.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) => {
  const source = virtualInputs.get(filename);
  return source === undefined
    ? originalGetSourceFile(filename, languageVersion, onError, shouldCreateNewSourceFile)
    : ts.createSourceFile(filename, source, languageVersion, true);
};
const program = ts.createProgram([...virtualInputs.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const outsideInputs = diagnostics.filter(
  (diagnostic) => !diagnostic.file || !virtualInputs.has(diagnostic.file.fileName),
);
assert.equal(
  outsideInputs.length,
  0,
  "Dependencies or compiler setup failed: " +
    outsideInputs
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("\n"),
);
const results = cases.map((entry) => {
  const filename = path.join(protocolRoot, `__lane_recipe_${entry.name}.ts`);
  const actual = diagnostics.filter((diagnostic) => diagnostic.file?.fileName === filename);
  const actualCodes = [...new Set(actual.map((diagnostic) => diagnostic.code))].sort();
  assert.deepEqual(actualCodes, entry.codes, entry.name + " did not enforce the expected contract");
  return {
    name: entry.name,
    expected: entry.codes.length === 0 ? "accepted" : "rejected",
    diagnosticCodes: actualCodes,
    diagnostics: actual.map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    })),
  };
});
process.stdout.write(
  JSON.stringify(
    {
      typescript: ts.version,
      scope: "Real RecordRecipe and public event types; seven isolated virtual inputs, no emitted files",
      passed: results.length,
      cases: results,
    },
    null,
    2,
  ) + "\n",
);
