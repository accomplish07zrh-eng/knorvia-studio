// Declaration extraction and static bindings only; neither implementation executes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require(process.argv[2]);
const baselineCommit = '04b06ee8bbd8350a4d1a02d0daf818b48a77ee8c';
const target = 'apps/cli/packages/core/src/workflow/scheduler/events.ts';
const draft = 'docs/evidence/event-log-author-packet-20261002/draft-events.ts.txt';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const before = execFileSync('git', ['show', `${baselineCommit}:${target}`]);
const after = fs.readFileSync(target), frozen = fs.readFileSync(draft);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
function inspect(data) {
  const text = data.toString();
  const result = ts.transpileDeclaration(text, {fileName: target, compilerOptions:{removeComments:true}});
  const tree = ts.createSourceFile('events.d.ts', result.outputText, ts.ScriptTarget.Latest, true);
  const normalized = ts.transform(tree, [context => root => ts.visitNode(root, function visit(node) {
    if (ts.isClassDeclaration(node)) {
      const members = node.members.filter(member => member.name?.kind !== ts.SyntaxKind.PrivateIdentifier && !member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword));
      return ts.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, members);
    }
    return ts.visitEachChild(node, visit, context);
  })]);
  const publicSurface = printer.printFile(normalized.transformed[0]);
  normalized.dispose();
  const source = ts.createSourceFile('events.ts', text, ts.ScriptTarget.Latest, true);
  const imports = JSON.stringify(source.statements.filter(ts.isImportDeclaration).map(node => ({module:node.moduleSpecifier.text,typeOnly:node.importClause?.isTypeOnly,defaultBinding:node.importClause?.name?.text,named:node.importClause?.namedBindings?.elements?.map(item=>({name:item.name.text,original:item.propertyName?.text,typeOnly:item.isTypeOnly}))})));
  return {publicSurface, imports, diagnostics:(result.diagnostics ?? []).map(item => ({code:item.code,message:ts.flattenDiagnosticMessageText(item.messageText,'\n')}))};
}
const old = inspect(before), current = inspect(after);
const output = {
  kind:'static API/dependency compatibility and exact-byte binding; not project typecheck or runtime test',
  typescript:ts.version, baselineCommit, target, frozenDraft:draft,
  baseline:{bytes:before.length,sha256:hash(before)}, integrated:{bytes:after.length,sha256:hash(after)},
  byteIdenticalToFrozenDraft:after.equals(frozen),
  publicDeclarationsEqualIgnoringOnlyPrivateStorage:old.publicSurface===current.publicSurface,
  publicDeclarationSha256:{baseline:hash(old.publicSurface),integrated:hash(current.publicSurface)},
  importsEqual:old.imports===current.imports,
  declarationExtractionDiagnostics:{baseline:old.diagnostics,integrated:current.diagnostics},
  runtimeChecksRun:false,fullSuitesRun:false
};
console.log(JSON.stringify(output,null,2));
if(!output.byteIdenticalToFrozenDraft || !output.publicDeclarationsEqualIgnoringOnlyPrivateStorage || !output.importsEqual || old.diagnostics.length || current.diagnostics.length) process.exitCode=1;
