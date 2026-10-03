// Static declarations, imports, configuration and exact-byte bindings only.
// Does not execute owners or perform a project compilation.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require(process.argv[2]);
const packet = 'docs/evidence/lifecycle-definition-author-packet-20261003';
const draftRoot = `${packet}/v2`;
const sourceRoot = 'apps/cli/packages/core/src/workflow';
const inputManifest = JSON.parse(fs.readFileSync(`${packet}/curator-input-manifest.json`));
const baseline = inputManifest.baseline;
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
  return { source, declaration, imports, diagnostics: (extraction.diagnostics ?? []).map(d => ({
    code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  })) };
}
function exportedSurface(unit, units) {
  const entries = [];
  for (const node of unit.declaration.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      const dependencyName = path.basename(node.moduleSpecifier.text).replace(/\.js$/, '.ts');
      const dependency = units[dependencyName];
      if (!dependency) throw new Error('Unbound declaration re-export: ' + dependencyName);
      for (const item of node.exportClause.elements) {
        const originalName = item.propertyName?.text ?? item.name.text;
        const declaration = dependency.declaration.statements.find(candidate => candidate.name?.text === originalName);
        if (!declaration) throw new Error('Unresolved public declaration: ' + originalName);
        entries.push([item.name.text, tokens(declaration, dependency.declaration)]);
      }
    } else if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const name = node.name?.text ?? node.declarationList?.declarations.map(item => item.name.getText(unit.declaration)).join(',');
      entries.push([name, tokens(node, unit.declaration)]);
    }
  }
  return JSON.stringify(entries.sort((a, b) => a[0].localeCompare(b[0])));
}
const receipt = JSON.parse(fs.readFileSync(`${draftRoot}/author-record.json`));
const archive = JSON.parse(fs.readFileSync(`${draftRoot}/curator-draft-manifest.json`));
const inputBindings = receipt.inputs.map(binding => {
  const actual = describe(fs.readFileSync(`${packet}/${path.basename(binding.path)}`));
  return { path: binding.path, ...actual, matchesReceipt: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const archivedBindings = archive.files.map(binding => {
  const actual = describe(fs.readFileSync(`${draftRoot}/${binding.file}`));
  return { file: binding.file, ...actual, matchesArchive: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const names = ['lifecycle.ts', 'definition.ts', 'lifecycle-seed.ts'];
const candidates = Object.fromEntries(names.map(name => [name, inspect(fs.readFileSync(`${draftRoot}/draft-${name}.txt`), name)]));
const predecessors = Object.fromEntries(names.filter(name => name !== 'lifecycle-seed.ts').map(name =>
  [name, inspect(execFileSync('git', ['show', `${baseline}:${sourceRoot}/${name}`]), name)]));
const owners = names.map(name => {
  const target = `${sourceRoot}/${name}`, draftPath = `${draftRoot}/draft-${name}.txt`;
  const draftBytes = fs.readFileSync(draftPath), installedBytes = fs.readFileSync(target);
  const frozen = receipt.outputs.find(item => path.basename(item.path) === name);
  const unit = candidates[name], prior = predecessors[name];
  const publicDeclaration = prior ? exportedSurface(unit, candidates) : null;
  const priorDeclaration = prior ? exportedSurface(prior, predecessors) : null;
  return { target, draftPath, predecessor: prior ? describe(execFileSync('git', ['show', `${baseline}:${target}`])) : null,
    candidate: describe(draftBytes), installed: describe(installedBytes), lines: draftBytes.toString().split('\n').length - 1,
    matchesFrozenOutput: draftBytes.length === frozen.bytes && hash(draftBytes) === frozen.sha256,
    installedByteIdenticalToDraft: installedBytes.equals(draftBytes),
    exportedDeclarationsEqual: prior ? publicDeclaration === priorDeclaration : null,
    publicDeclarationComparison: prior ? 'Named exports sorted; lifecycle seed re-export resolved to its complete declared function surface' : 'Private implementation companion; no predecessor public owner',
    exportedDeclarationStructureSha256: prior ? { predecessor: hash(priorDeclaration), candidate: hash(publicDeclaration) } : null,
    imports: unit.imports,
    relativeDependenciesExist: unit.imports.filter(item => item.module.startsWith('.')).every(item =>
      fs.existsSync(path.resolve(path.dirname(target), item.module.replace(/\.js$/, '.ts')))),
    declarationExtractionDiagnostics: { predecessor: prior?.diagnostics ?? [], candidate: unit.diagnostics },
  };
});
const externalRuntimeBindings = units => [...new Set(Object.values(units).flatMap(unit =>
  unit.imports.filter(item => !item.typeOnly && !item.module.startsWith('.')).map(item => `${item.module}#${item.name}`)))].sort();
const externalRuntimeImports = { predecessor: externalRuntimeBindings(predecessors), candidate: externalRuntimeBindings(candidates) };
const externalRuntimeImportsEqual = JSON.stringify(externalRuntimeImports.predecessor) === JSON.stringify(externalRuntimeImports.candidate);
function literal(node, source) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(item => literal(item, source));
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(item => [item.name.getText(source), literal(item.initializer, source)]));
  if (ts.isIdentifier(node)) return { publicBinding: node.text };
  throw new Error('Non-literal configuration node: ' + node.kind);
}
const definitionSource = candidates['definition.ts'].source;
const defaultStrategy = definitionSource.statements.find(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(item => item.name.getText(definitionSource) === 'DEFAULT_EXPERT_WORKFLOW_STRATEGY')).declarationList.declarations[0];
const constructor = definitionSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createExpertWorkflowDefinition');
const parseInput = constructor.body.statements[0].expression.arguments[0];
const retained = JSON.parse(fs.readFileSync(`${packet}/retained-configuration.json`));
const configuration = { defaultStrategy: literal(defaultStrategy.initializer, definitionSource), definitionParseInput: literal(parseInput, definitionSource) };
const configurationDataAndKeyOrderEqual = JSON.stringify(configuration) === JSON.stringify({ defaultStrategy: retained.defaultStrategy, definitionParseInput: retained.definitionParseInput });
const untouchedOwners = JSON.parse(fs.readFileSync(`${packet}/untouched-owner-bindings.json`)).map(binding => {
  const actual = describe(fs.readFileSync(binding.path));
  return { ...binding, actual, unchanged: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const originalArchive = JSON.parse(fs.readFileSync(`${packet}/curator-draft-manifest.json`));
const originalArtifacts = originalArchive.files.map(binding => {
  const actual = describe(fs.readFileSync(`${packet}/${binding.file}`));
  return { ...binding, actual, unchanged: actual.bytes === binding.bytes && actual.sha256 === binding.sha256 };
});
const unchangedV1Owners = ['lifecycle.ts', 'definition.ts'].map(name => ({ name,
  byteIdentical: fs.readFileSync(`${packet}/draft-${name}.txt`).equals(fs.readFileSync(`${draftRoot}/draft-${name}.txt`)) }));
const passed = inputBindings.every(item => item.matchesReceipt) && archivedBindings.every(item => item.matchesArchive)
  && untouchedOwners.every(item => item.unchanged) && originalArtifacts.every(item => item.unchanged)
  && unchangedV1Owners.every(item => item.byteIdentical) && configurationDataAndKeyOrderEqual && externalRuntimeImportsEqual
  && owners.every(item => item.matchesFrozenOutput && item.installedByteIdenticalToDraft && item.lines < 400
    && item.exportedDeclarationsEqual !== false && item.relativeDependenciesExist
    && item.declarationExtractionDiagnostics.predecessor.length === 0 && item.declarationExtractionDiagnostics.candidate.length === 0);
console.log(JSON.stringify({ kind: 'Static declaration/import/configuration/exact-byte binding; no owner execution or project compilation',
  typescript: ts.version, baseline, inputBindings, archivedBindings, owners, externalRuntimeImports, externalRuntimeImportsEqual,
  configurationDataAndKeyOrderEqual, configurationStructureSha256: hash(JSON.stringify(configuration)),
  untouchedOwners, originalArtifacts, unchangedV1Owners, passed, runtimeTestsRun: false, projectTypecheckRun: false, lintRun: false }, null, 2));
if (!passed) process.exitCode = 1;
