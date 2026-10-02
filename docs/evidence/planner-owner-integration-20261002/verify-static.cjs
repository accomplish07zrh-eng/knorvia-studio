// Static declaration/dependency comparison and byte binding; no owner execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const ts = require(process.argv[2]);
const root = 'docs/evidence/planner-owner-integration-20261002/';
const bindings = JSON.parse(fs.readFileSync(root+'bindings.json','utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function tokens(node, tree) {
  const children = node.getChildren(tree);
  return children.length ? [node.kind,...children.map(child=>tokens(child,tree))] : [node.kind,node.getText(tree)];
}
function inspect(buffer, filename) {
  const source=ts.createSourceFile(filename,buffer.toString(),ts.ScriptTarget.Latest,true);
  const imports=[];
  for(const node of source.statements.filter(ts.isImportDeclaration)) {
    for(const item of node.importClause?.namedBindings?.elements??[]) imports.push({module:node.moduleSpecifier.text,name:item.propertyName?.text??item.name.text,local:item.name.text,typeOnly:Boolean(node.importClause.isTypeOnly||item.isTypeOnly)});
  }
  imports.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const emitted=ts.transpileDeclaration(buffer.toString(),{fileName:filename,compilerOptions:{removeComments:true}});
  const decl=ts.createSourceFile(filename+'.d.ts',emitted.outputText,ts.ScriptTarget.Latest,true);
  const exports=decl.statements.filter(node=>node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword));
  return {surface:JSON.stringify(exports.map(node=>tokens(node,decl))),runtimeImports:imports.filter(item=>!item.typeOnly),typeImports:imports.filter(item=>item.typeOnly),diagnostics:(emitted.diagnostics??[]).map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))};
}
const results=bindings.owners.map(item=>{
  const before=execFileSync('git',['show',`${bindings.predecessorCommit}:${item.owner}`]);
  const current=fs.readFileSync(item.owner),frozen=fs.readFileSync(item.frozenDraft);
  const prior=inspect(before,item.owner),next=inspect(current,item.owner);
  return {owner:item.owner,byteIdenticalToFrozenDraft:current.equals(frozen),predecessorHashMatches:hash(before)===item.predecessor.sha256,integratedHashMatches:hash(current)===item.installed.sha256,exportedDeclarationsEqual:prior.surface===next.surface,publicSurfaceSha256:{predecessor:hash(prior.surface),integrated:hash(next.surface)},runtimeImportsEqual:JSON.stringify(prior.runtimeImports)===JSON.stringify(next.runtimeImports),runtimeImports:next.runtimeImports,typeImports:{predecessor:prior.typeImports,integrated:next.typeImports},relativeDependencyFilesExist:[...new Set([...next.runtimeImports,...next.typeImports].map(i=>i.module).filter(m=>m.startsWith('.')))].every(module=>fs.existsSync(path.resolve(path.dirname(item.owner),module.replace(/\.js$/,'.ts')))),declarationDiagnostics:{predecessor:prior.diagnostics,integrated:next.diagnostics}};
});
console.log(JSON.stringify({kind:'static declarations/imports only; not project compilation or runtime acceptance',typescript:ts.version,predecessorCommit:bindings.predecessorCommit,owners:results,runtimeTestsRun:false,combinedCompilerCheckRun:false},null,2));
if(results.some(r=>!r.byteIdenticalToFrozenDraft||!r.predecessorHashMatches||!r.integratedHashMatches||!r.exportedDeclarationsEqual||!r.runtimeImportsEqual||!r.relativeDependencyFilesExist||r.declarationDiagnostics.predecessor.length||r.declarationDiagnostics.integrated.length))process.exitCode=1;
