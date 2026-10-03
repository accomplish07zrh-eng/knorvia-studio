import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const packages = fileURLToPath(new URL("../../", import.meta.url));
const ts = createRequire(new URL("../../../../../package.json", import.meta.url))("typescript");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const archiveText = await readFile(
  new URL("./workflow-graph-boundary-baseline.json", import.meta.url),
  "utf8",
);
assert.equal(sha(archiveText), "6366a05a77ff4c24b61cf1338ed731c27b46fa01bcf6c318f7c651cfe2f4bfe3");
const baseline = JSON.parse(archiveText);
const modules = {
  contracts: [
    "index",
    "definition",
    "graph-schema",
    "run-schema",
    "scheduler-state",
    "session-links",
  ].map((name) => `workflow/${name}`),
  core: ["graph", "graph-helpers", "ready-order"].map((name) => `workflow/scheduler/${name}`),
};
function canonicalDeclaration(text) {
  const file = ts.createSourceFile("api.d.ts", text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, file);
  const transform = (context) => {
    const visit = (node) => {
      const next = ts.visitEachChild(node, visit, context);
      if (ts.isUnionTypeNode(next))
        return ts.factory.updateUnionTypeNode(
          next,
          [...next.types].sort((a, b) => print(a).localeCompare(print(b))),
        );
      if (ts.isTypeLiteralNode(next)) {
        assert.ok(
          next.members.every(ts.isPropertySignature),
          "Do not reorder overload/call signatures",
        );
        return ts.factory.updateTypeLiteralNode(
          next,
          [...next.members].sort((a, b) => print(a).localeCompare(print(b))),
        );
      }
      return next;
    };
    return (root) => ts.visitNode(root, visit);
  };
  const transformed = ts.transform(file, [transform]);
  try {
    return printer.printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
}
function statements(text, declaration) {
  const file = ts.createSourceFile(
    declaration ? "api.d.ts" : "owner.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const entries = {};
  for (const node of file.statements) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) continue;
    const name =
      node.name?.getText(file) ??
      (ts.isVariableStatement(node)
        ? node.declarationList.declarations.map((d) => d.name.getText(file)).join(",")
        : undefined);
    assert.ok(name);
    assert.ok(!entries[name]);
    entries[name] = sha(
      declaration
        ? canonicalDeclaration(node.getText(file))
        : ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, file),
    );
  }
  return entries;
}
const result = { node: process.version, typescript: ts.version, modules: {} };
for (const [packageName, names] of Object.entries(modules)) {
  const directory = `${packages}${packageName}`;
  const config = ts.readConfigFile(`${directory}/tsconfig.json`, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
  const program = ts.createProgram(
    names.map((name) => `${directory}/src/${name}.ts`),
    parsed.options,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (n) => n,
      getCurrentDirectory: () => directory,
      getNewLine: () => "\n",
    }),
  );
  const emitted = new Map();
  program.emit(undefined, (path, text) => {
    if (
      names.some((name) =>
        [".js", ".d.ts", ".d.ts.map"].some(
          (suffix) => path === `${directory}/dist/${name}${suffix}`,
        ),
      )
    )
      emitted.set(path, text);
  });
  const sourceEntries = {},
    declarationEntries = {};
  for (const name of names) {
    for (const [key, digest] of Object.entries(
      statements(await readFile(`${directory}/src/${name}.ts`, "utf8"), false),
    )) {
      assert.ok(!sourceEntries[key]);
      sourceEntries[key] = digest;
    }
    for (const [key, digest] of Object.entries(
      statements(emitted.get(`${directory}/dist/${name}.d.ts`), true),
    )) {
      assert.ok(!declarationEntries[key]);
      declarationEntries[key] = digest;
    }
  }
  const record = baseline.records[packageName === "core" ? "graph" : "contracts"];
  assert.deepEqual(
    sourceEntries,
    record.sourceStatements,
    "Every authored or retained declaration body must remain unchanged",
  );
  assert.deepEqual(
    declarationEntries,
    record.declarations,
    "Flattened public declaration API must remain unchanged",
  );
  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(`${directory}/src/${names[0]}.ts`);
  const exports = checker
    .getExportsOfModule(checker.getSymbolAtLocation(entry))
    .map((symbol) => symbol.name)
    .sort();
  const expectedExports =
    packageName === "contracts" ? record.publicExports : Object.keys(record.declarations).sort();
  assert.deepEqual(exports, expectedExports, "Public barrel export names must remain unchanged");
  for (const [path, text] of emitted) {
    if (process.argv.includes("--emit")) await writeFile(path, text);
    else
      assert.equal(await readFile(path, "utf8"), text, `Actual compiler output differs: ${path}`);
  }
  result.modules[packageName] = {
    sourceDeclarations: Object.keys(sourceEntries).length,
    publicDeclarations: Object.keys(declarationEntries).length,
    exports: exports.length,
    diagnostics: 0,
    emittedArtifacts: emitted.size,
  };
}
console.log(JSON.stringify(result));
