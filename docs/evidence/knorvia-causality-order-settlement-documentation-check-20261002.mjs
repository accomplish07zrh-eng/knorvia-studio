import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectComments,
  syntaxDigest,
} from "../../apps/cli/packages/core/test/causality-reduction-documentation-proof.ts";
import { loadSettlementDocumentaryProof } from "../../apps/cli/packages/core/test/causality-order-settlement-documentation-proof.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const owner = "apps/cli/packages/dynamic-workflow/src/analysis/causality-order-settle.ts";
const ts = createRequire(path.join(root, "package.json"))("typescript");
const pkg = path.join(root, "apps/cli/packages/dynamic-workflow");
const configPath = path.join(pkg, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, pkg, {}, configPath);
if (process.argv.includes("--emit") || process.argv.includes("--types")) {
  const emit = process.argv.includes("--emit");
  const check = (roots, options, label) => {
    const program = ts.createProgram({ rootNames: roots.map((p) => path.join(root, p)), options });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (p) => p,
        getNewLine: () => "\n",
      }),
    );
    console.log(
      JSON.stringify({ label, roots: roots.length, diagnostics: 0, typescript: ts.version }),
    );
    return program;
  };
  const program = check(
    [owner],
    emit ? parsed.options : { ...parsed.options, noEmit: true },
    "owner",
  );
  if (emit) {
    const written = [],
      result = program.emit(program.getSourceFile(path.join(root, owner)), (name, text, bom) => {
        const relative = path.relative(path.join(pkg, "dist/analysis"), name);
        assert.match(relative, /^causality-order-settle\.(?:js|d\.ts(?:\.map)?)$/u);
        ts.sys.writeFile(name, text, bom);
        written.push(relative);
      });
    assert.equal(result.emitSkipped, false);
    assert.equal(result.diagnostics.length, 0);
    console.log(JSON.stringify({ written }));
  }
  const core = path.join(root, "apps/cli/packages/core"),
    coreConfigPath = path.join(core, "tsconfig.json");
  const coreConfig = ts.readConfigFile(coreConfigPath, ts.sys.readFile);
  assert.equal(coreConfig.error, undefined);
  const options = ts.parseJsonConfigFileContent(
    coreConfig.config,
    ts.sys,
    core,
    {},
    coreConfigPath,
  ).options;
  check(
    [
      "apps/cli/packages/core/test/causality-order-settlement-documentation-proof.ts",
      "apps/cli/packages/core/test/causality-order-settlement-documentation.test.ts",
      "apps/cli/packages/core/test/causality-order-settlement-fixture.ts",
    ],
    { ...options, noEmit: true, rootDir: root },
    "documentary fixtures",
  );
} else {
  const receipt = JSON.parse(
    read("docs/evidence/knorvia-causality-order-settlement-documentation-20261002.json"),
  );
  const earlierBytes = read(receipt.runtimeReceipt.path);
  assert.equal(sha(earlierBytes), receipt.runtimeReceipt.sha256);
  const changedRuntimePaths = [
    owner,
    "apps/cli/packages/core/test/causality-order-settlement-current.json",
    "apps/cli/packages/core/test/causality-order-settlement-fixture.ts",
  ];
  const protectedFiles = JSON.parse(earlierBytes).files.filter(
    (record) => !changedRuntimePaths.includes(record.path),
  );
  for (const record of [...receipt.files, ...receipt.emitted, ...protectedFiles]) {
    const bytes = read(record.path);
    assert.equal(bytes.length, record.bytes, record.path);
    assert.equal(sha(bytes), record.sha256, record.path);
  }
  const old = (p) =>
    execFileSync("git", ["show", `${receipt.baseline}:${p}`], { cwd: root, encoding: "utf8" });
  const before = old(owner),
    source = read(owner).toString("utf8");
  const proof = await loadSettlementDocumentaryProof();
  assert.equal(sha(before), proof.sourceSha256);
  assert.equal(syntaxDigest(before), proof.sourceSyntaxSha256);
  assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
  const originalComments = inspectComments(before),
    currentComments = inspectComments(source);
  let replaced = before.replace(originalComments.slice(0, 4).join("\n"), currentComments[0]);
  for (const [from, to] of [
    [4, 1],
    [5, 2],
    [6, 3],
    [7, 4],
    [9, 7],
    [12, 11],
    [13, 12],
  ])
    replaced = replaced.replace(originalComments[from], currentComments[to]);
  for (const [name, index] of [
    ["settlesAt", 6],
    ["bindSteps", 10],
  ])
    replaced = replaced.replace(
      `export function ${name}(`,
      `${currentComments[index]}\nexport function ${name}(`,
    );
  assert.equal(source, replaced, "only scoped comment replacements/additions");
  assert.deepEqual(currentComments, receipt.comments.source);
  const previousHost = ts.createCompilerHost(parsed.options),
    originalGet = previousHost.getSourceFile.bind(previousHost);
  const ownerPath = path.join(root, owner);
  previousHost.getSourceFile = (name, version, onError, fresh) =>
    path.resolve(name) === ownerPath
      ? ts.createSourceFile(name, before, version, true)
      : originalGet(name, version, onError, fresh);
  const program = ts.createProgram({
      rootNames: [ownerPath],
      options: parsed.options,
      host: previousHost,
    }),
    historical = new Map();
  const result = program.emit(program.getSourceFile(ownerPath), (name, text) =>
    historical.set(path.basename(name), text),
  );
  assert.equal(result.emitSkipped, false);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(sha(historical.get("causality-order-settle.js")), proof.emittedSha256);
  assert.equal(historical.get("causality-order-settle.d.ts"), proof.declaration);
  const js = read(receipt.emitted[0].path).toString("utf8"),
    declaration = read(receipt.emitted[1].path).toString("utf8");
  assert.equal(syntaxDigest(js, true), proof.emittedSyntaxSha256);
  assert.equal(syntaxDigest(declaration), proof.declarationSyntaxSha256);
  const emittedComments = receipt.comments.emittedSourceIndexes.map(
    (index) => currentComments[index],
  );
  const declarationComments = [
    ...receipt.comments.declarationSourceIndexes.map((index) => currentComments[index]),
    receipt.comments.declarationMap,
  ];
  assert.deepEqual(inspectComments(js, true), emittedComments);
  assert.deepEqual(inspectComments(declaration), declarationComments);
  const fixture = "apps/cli/packages/core/test/causality-order-settlement-fixture.ts";
  const expected = old(fixture)
    .replace(
      'import { dynamic, sha } from "./causality-reduction-fixture.js";',
      'import { dynamic, sha } from "./causality-reduction-fixture.js";\nimport { assertSettlementDeclarationShape } from "./causality-order-settlement-documentation-proof.js";',
    )
    .replace(
      "  assert.equal(pins.declarationSha256, archive.declarationSha256);",
      '  await assertSettlementDeclarationShape(\n    await readArtifact(new URL("dist/analysis/causality-order-settle.d.ts", root)),\n    archive.declarationSha256,\n  );',
    );
  assert.equal(read(fixture).toString("utf8"), expected, "only documentary assumption migrates");
  const archive = JSON.parse(
    read("apps/cli/packages/core/test/causality-order-settlement-baseline.json"),
  );
  const publisher = execFileSync("git", ["cat-file", "blob", archive.publisherBlob], {
    cwd: root,
    encoding: "utf8",
  }).replace(/\r\n/gu, "\n");
  assert.equal(sha(publisher), archive.sourceSha256);
  const file = (text) => ts.createSourceFile("owned.ts", text, ts.ScriptTarget.Latest, true);
  const functionText = (text, name) =>
    file(text)
      .statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
      .getText();
  for (const name of receipt.retainedFunctions)
    assert.equal(functionText(source, name), functionText(publisher, name), name);
  const publisherComments = new Set(inspectComments(publisher));
  assert.ok(
    currentComments.every((comment) => !publisherComments.has(comment)),
    "no exact publisher explanatory comment remains",
  );
  const changed = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const p of [...changed, ...untracked]) assert.ok(receipt.scope.includes(p), p);
  if (process.argv.includes("--local-logs"))
    for (const record of receipt.logs)
      assert.equal(sha(readFileSync(record.path)), record.sha256, record.path);
  console.log(
    JSON.stringify({
      ok: true,
      digests: receipt.files.length + receipt.emitted.length,
      protected: protectedFiles.length,
      syntaxTrees: 3,
      parsedSourceComments: currentComments.length,
      parsedEmittedComments: emittedComments.length,
      parsedDeclarationComments: declarationComments.length,
      exactRetainedFunctions: receipt.retainedFunctions.length,
      behavioralRuns: 0,
    }),
  );
}
