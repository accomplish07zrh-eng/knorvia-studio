// Static declaration/import/byte binding only, no owner execution or project typecheck.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require(process.argv[2]), scope = process.argv[3];
const packet = 'docs/evidence/core-compaction-author-packet-20261003';
const manifest = JSON.parse(fs.readFileSync(`${packet}/curator-input-manifest.json`));
if (!manifest.scopes[scope]) throw new Error('Unknown bounded scope');
const target = manifest.scopes[scope].source, name = path.basename(target);
const scopedPacket = `${packet}/${scope}`;
const archiveRoot = fs.existsSync(`${scopedPacket}/v2/curator-draft-manifest.json`) ? `${scopedPacket}/v2` : scopedPacket;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const describe = bytes => ({ bytes: bytes.length, sha256: hash(bytes) });
function tokens(node, tree) {
  const children = node.getChildren(tree);
  return children.length ? [node.kind, ...children.map(child => tokens(child, tree))] : [node.kind, node.getText(tree)];
}
function inspect(bytes) {
  const source = ts.createSourceFile(name, bytes.toString(), ts.ScriptTarget.Latest, true);
  const imports = source.statements.filter(ts.isImportDeclaration).flatMap(node =>
    (node.importClause?.namedBindings?.elements ?? []).map(item => ({
      module: node.moduleSpecifier.text, name: item.propertyName?.text ?? item.name.text,
      local: item.name.text, typeOnly: Boolean(node.importClause.isTypeOnly || item.isTypeOnly),
    }))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const extraction = ts.transpileDeclaration(bytes.toString(), { fileName: name, compilerOptions: { removeComments: true } });
  const declaration = ts.createSourceFile(name + '.d.ts', extraction.outputText, ts.ScriptTarget.Latest, true);
  const publicStatements = declaration.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node));
  const surface = JSON.stringify(publicStatements.map(node => [node.name?.text ??
    node.declarationList?.declarations.map(item => item.name.getText(declaration)).join(','), tokens(node, declaration)])
    .sort((a, b) => a[0].localeCompare(b[0])));
  const runtimeBindings = imports.filter(item => !item.typeOnly).map(item =>
    `${item.module.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(target), item.module)) : item.module}#${item.name}`).sort();
  return { imports, runtimeBindings, surface, diagnostics: (extraction.diagnostics ?? []).map(d => ({
    code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  })) };
}
const priorBytes = execFileSync('git', ['show', `${manifest.baseline}:${target}`]);
const draftPath = `${archiveRoot}/draft-${name}.txt`, draftBytes = fs.readFileSync(draftPath), installedBytes = fs.readFileSync(target);
const prior = inspect(priorBytes), candidate = inspect(draftBytes);
const receipt = JSON.parse(fs.readFileSync(`${archiveRoot}/author-record.json`));
const receiptInputs = receipt.inputs ?? receipt.bindings.filter(item => /(?:^|\/)inputs\//.test(item.path));
const receiptOutputs = receipt.outputs ?? receipt.bindings.filter(item => /(?:^|\/)output(?:-v2)?\//.test(item.path));
const inputBindings = receiptInputs.map(binding => {
  const actual = describe(fs.readFileSync(`${scopedPacket}/${path.basename(binding.path)}`));
  return { ...binding, actual, matchesReceipt: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const outputBinding = receiptOutputs.find(binding => path.basename(binding.path) === name);
if (!outputBinding) throw new Error('Missing complete source receipt binding');
const archive = JSON.parse(fs.readFileSync(`${archiveRoot}/curator-draft-manifest.json`));
const archiveBindings = archive.files.map(binding => {
  const actual = describe(fs.readFileSync(`${archiveRoot}/${binding.file}`));
  return { ...binding, actual, matchesArchive: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const originalArchive = JSON.parse(fs.readFileSync(`${scopedPacket}/curator-draft-manifest.json`));
const originalBindings = originalArchive.files.map(binding => {
  const actual = describe(fs.readFileSync(`${scopedPacket}/${binding.file}`));
  return { ...binding, actual, unchanged: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const untouchedBoundaries = JSON.parse(fs.readFileSync(`${packet}/untouched-boundary-bindings.json`)).map(binding => {
  const actual = describe(fs.readFileSync(binding.path));
  return { ...binding, actual, unchanged: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const exportedDeclarationStructureEqual = prior.surface === candidate.surface;
const runtimeBindingsEqual = JSON.stringify(prior.runtimeBindings) === JSON.stringify(candidate.runtimeBindings);
const installedByteIdenticalToDraft = installedBytes.equals(draftBytes);
const matchesFrozenReceipt = draftBytes.length === outputBinding.bytes && hash(draftBytes) === outputBinding.sha256;
const relativeDependenciesExist = candidate.imports.filter(item => item.module.startsWith('.')).every(item =>
  fs.existsSync(path.resolve(path.dirname(target), item.module.replace(/\.js$/, '.ts'))));
const lines = draftBytes.toString().split('\n').length - 1;
const passed = inputBindings.every(item => item.matchesReceipt) && archiveBindings.every(item => item.matchesArchive)
  && originalBindings.every(item => item.unchanged) && untouchedBoundaries.every(item => item.unchanged)
  && exportedDeclarationStructureEqual && runtimeBindingsEqual && installedByteIdenticalToDraft && matchesFrozenReceipt
  && relativeDependenciesExist && lines < 400 && !prior.diagnostics.length && !candidate.diagnostics.length;
console.log(JSON.stringify({ kind: 'Static declaration/import/frozen-byte compatibility; no project body typecheck/runtime acceptance',
  typescript: ts.version, scope, baseline: manifest.baseline, target, draftPath,
  predecessor: describe(priorBytes), candidate: describe(draftBytes), installed: describe(installedBytes), lines,
  exportedDeclarationStructureEqual, declarationComparison: 'Sorted declared public surface plus referenced private declaration shapes; runtime aliases free',
  declarationStructureSha256: { predecessor: hash(prior.surface), candidate: hash(candidate.surface) },
  runtimeBindingsEqual, runtimeBindings: { predecessor: prior.runtimeBindings, candidate: candidate.runtimeBindings }, imports: candidate.imports,
  relativeDependenciesExist, declarationExtractionDiagnostics: { predecessor: prior.diagnostics, candidate: candidate.diagnostics },
  installedByteIdenticalToDraft, matchesFrozenReceipt, inputBindings, archiveBindings, originalBindings, untouchedBoundaries,
  passed, runtimeTestsRun: false, projectTypecheckRun: false, lintRun: false }, null, 2));
if (!passed) process.exitCode = 1;
