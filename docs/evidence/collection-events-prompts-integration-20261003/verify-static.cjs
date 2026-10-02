// Static declarations/imports/frozen-byte bindings only; no owner execution.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require(process.argv[2]);
const packet = 'docs/evidence/collection-events-prompts-author-packet-20261003';
const baseline = 'dfae259be47287be6642ab8469009b008a01bdb2';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const describe = bytes => ({ bytes: bytes.length, sha256: hash(bytes) });
function tokens(node, tree) {
  const children = node.getChildren(tree);
  return children.length ? [node.kind, ...children.map(child => tokens(child, tree))] : [node.kind, node.getText(tree)];
}
function inspect(bytes, fileName) {
  const source = ts.createSourceFile(fileName, bytes.toString(), ts.ScriptTarget.Latest, true);
  const imports = source.statements.filter(ts.isImportDeclaration).flatMap(node =>
    (node.importClause?.namedBindings?.elements ?? []).map(item => ({
      module: node.moduleSpecifier.text, name: item.propertyName?.text ?? item.name.text,
      local: item.name.text, typeOnly: Boolean(node.importClause.isTypeOnly || item.isTypeOnly),
    }))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const extraction = ts.transpileDeclaration(bytes.toString(), { fileName, compilerOptions: { removeComments: true } });
  const declaration = ts.createSourceFile(fileName + '.d.ts', extraction.outputText, ts.ScriptTarget.Latest, true);
  const surface = JSON.stringify(declaration.statements.filter(node =>
    node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(node => tokens(node, declaration)));
  return { surface, imports, diagnostics: (extraction.diagnostics ?? []).map(d => ({
    code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  })) };
}
const receipt = JSON.parse(fs.readFileSync(`${packet}/author-record.json`));
const archive = JSON.parse(fs.readFileSync(`${packet}/curator-draft-manifest.json`));
const inputBindings = receipt.inputs.map(binding => {
  const actual = describe(fs.readFileSync(`${packet}/${path.basename(binding.path)}`));
  return { path: binding.path, ...actual, matchesReceipt: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const archivedBindings = archive.files.map(binding => {
  const actual = describe(fs.readFileSync(`${packet}/${binding.file}`));
  return { file: binding.file, ...actual, matchesArchive: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const owners = ['collection-events.ts', 'prompts.ts'].map(name => {
  const target = `apps/cli/packages/core/src/workflow/scheduler/${name}`;
  const draftPath = `${packet}/draft-${name}.txt`;
  const priorBytes = execFileSync('git', ['show', `${baseline}:${target}`]);
  const draftBytes = fs.readFileSync(draftPath), installedBytes = fs.readFileSync(target);
  const prior = inspect(priorBytes, name), candidate = inspect(draftBytes, name);
  const frozen = receipt.outputs.find(item => path.basename(item.path) === name);
  return {
    target, draftPath, predecessor: describe(priorBytes), candidate: describe(draftBytes), installed: describe(installedBytes),
    lines: draftBytes.toString().split('\n').length - 1,
    matchesFrozenOutput: draftBytes.length === frozen.bytes && hash(draftBytes) === frozen.sha256,
    installedByteIdenticalToDraft: installedBytes.equals(draftBytes),
    exportedDeclarationsEqual: prior.surface === candidate.surface,
    exportedDeclarationStructureSha256: { predecessor: hash(prior.surface), candidate: hash(candidate.surface) },
    runtimeImportsEqual: JSON.stringify(prior.imports.filter(item => !item.typeOnly)) === JSON.stringify(candidate.imports.filter(item => !item.typeOnly)),
    imports: candidate.imports,
    relativeDependenciesExist: candidate.imports.filter(item => item.module.startsWith('.')).every(item =>
      fs.existsSync(path.resolve(path.dirname(target), item.module.replace(/\.js$/, '.ts')))),
    declarationExtractionDiagnostics: { predecessor: prior.diagnostics, candidate: candidate.diagnostics },
  };
});
const retainedBoundaries = JSON.parse(fs.readFileSync(`${packet}/retained-boundary-bindings.json`)).map(binding => {
  const actual = describe(fs.readFileSync(binding.path));
  return { ...binding, actual, unchanged: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const passed = inputBindings.every(item => item.matchesReceipt) && archivedBindings.every(item => item.matchesArchive)
  && retainedBoundaries.every(item => item.unchanged) && owners.every(item => item.matchesFrozenOutput
    && item.installedByteIdenticalToDraft && item.exportedDeclarationsEqual && item.runtimeImportsEqual
    && item.relativeDependenciesExist && item.declarationExtractionDiagnostics.predecessor.length === 0
    && item.declarationExtractionDiagnostics.candidate.length === 0);
console.log(JSON.stringify({ kind: 'Static compatibility and exact byte bindings; no runtime acceptance or project typecheck',
  typescript: ts.version, baseline, inputBindings, archivedBindings, owners, retainedBoundaries, passed,
  runtimeTestsRun: false, projectTypecheckRun: false, lintRun: false }, null, 2));
if (!passed) process.exitCode = 1;
