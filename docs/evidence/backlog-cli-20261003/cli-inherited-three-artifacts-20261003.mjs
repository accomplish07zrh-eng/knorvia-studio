// Bounded artifact reconstruction only; no project check, full build, or runtime side effect.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = new URL("../../../", import.meta.url);
const root = fileURLToPath(repository);
const ts = createRequire(new URL("package.json", repository))("typescript");
const receiptText = await readFile(new URL("./cli-inherited-three-artifact-receipt-20261003.json", import.meta.url), "utf8");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha(receiptText), "a16896ab9dc97b031b1c807ef3dede2a1614830ec31cf29dfe2ad8e52c3b1de6");
const receipt = JSON.parse(receiptText);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.sourceCheckpoint, "55dda10f9b1779cddae5a24be30f413c79e4c546");
assert.equal(receipt.predecessorCheckpoint, "be3e574a416165a54b45c71e3361f2efb3401b36");
assert.equal(ts.version, receipt.compiler);
assert.equal(process.version, receipt.node);
assert.equal(sha(await readFile(new URL("package.json", repository))), receipt.rootPackageSha256);
assert.equal(sha(await readFile(new URL("pnpm-lock.yaml", repository))), receipt.lockfileSha256);
const frozenText = (relative) => execFileSync("git", ["show", `${receipt.predecessorCheckpoint}:${relative}`], { cwd: root });
const facts = execFileSync("git", ["show", `${receipt.factsCheckpoint}:${receipt.factsPath}`], { cwd: root });
assert.equal(sha(facts), receipt.factsSha256);

function surface(text, fileName, source = false) {
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  assert.deepEqual(file.parseDiagnostics, []);
  const printer = ts.createPrinter({ removeComments: true });
  return file.statements.flatMap((statement) => {
    if (ts.isClassDeclaration(statement)) {
      statement = ts.factory.updateClassDeclaration(statement, statement.modifiers, statement.name,
        statement.typeParameters, statement.heritageClauses, statement.members.filter((member) =>
          !member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)));
    }
    if (source) {
      if (ts.isFunctionDeclaration(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        statement = ts.factory.updateFunctionDeclaration(statement, statement.modifiers, statement.asteriskToken,
          statement.name, statement.typeParameters, statement.parameters, statement.type, undefined);
      } else if (!ts.isInterfaceDeclaration(statement)) return [];
    }
    return [printer.printNode(ts.EmitHint.Unspecified, statement, file)];
  }).join("\n");
}

const publicSurfaces = [];
for (const entry of receipt.files) {
  const location = path.join(root, entry.path);
  const current = await readFile(location);
  const before = frozenText(entry.path);
  assert.equal(sha(current), entry.currentSha256, entry.path);
  assert.equal(sha(before), entry.beforeSha256, entry.path);
  const configPath = path.join(root, entry.packageRoot, "tsconfig.json");
  assert.equal(sha(await readFile(configPath)), entry.configSha256);
  assert.equal(sha(await readFile(path.join(root, entry.packageRoot, "package.json"))), entry.packageJsonSha256);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  assert.deepEqual(parsed.errors, []);
  const declarations = [];
  for (const [bytes, expected] of [[before, entry.beforeOutputs], [current, entry.currentOutputs]]) {
    const host = ts.createCompilerHost(parsed.options);
    const nativeRead = host.readFile;
    host.readFile = (file) => path.resolve(file) === location ? bytes.toString("utf8") : nativeRead(file);
    const program = ts.createProgram({ rootNames: [location], options: parsed.options, host });
    const actual = {};
    const emitted = program.emit(program.getSourceFile(location), (file, text) => {
      const name = path.basename(file);
      actual[name] = { bytes: Buffer.byteLength(text), sha256: sha(text) };
      if (name.endsWith(".d.ts")) declarations.push(surface(text, name));
    });
    assert.equal(emitted.emitSkipped, false);
    assert.deepEqual(emitted.diagnostics, []);
    assert.deepEqual(actual, expected, entry.path);
  }
  const surfaces = declarations.length ? declarations : [surface(before.toString("utf8"), entry.path, true), surface(current.toString("utf8"), entry.path, true)];
  assert.equal(surfaces.length, 2);
  assert.equal(surfaces[0], surfaces[1], entry.path + " public surface");
  publicSurfaces.push({ path: entry.path, equal: true, normalizedSha256: sha(surfaces[0]), comparison: declarations.length ? "emitted declaration excluding private members/comments" : "source DTOs/exported signature excluding body/comments" });
}
console.log(JSON.stringify({ result: "pass", sourceFiles: receipt.files.length, outputsPerRevision: 7, publicSurfaces }));
