// Static declaration/import/byte comparison only; no implementation execution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const ts=require(process.argv[2]);
const target='apps/cli/packages/core/src/workflow/scheduler/node-runner.ts';
const draft='docs/evidence/node-runner-author-packet-20261003/draft-node-runner.ts.txt';
const preceding='dbfbccfe2c3bc9d8262cde4f04b3941518b913f7';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function tokens(node,tree){const children=node.getChildren(tree);return children.length?[node.kind,...children.map(c=>tokens(c,tree))]:[node.kind,node.getText(tree)];}
function inspect(bytes){
 const source=ts.createSourceFile('node-runner.ts',bytes.toString(),ts.ScriptTarget.Latest,true);
 const imports=source.statements.filter(ts.isImportDeclaration).flatMap(node=>(node.importClause?.namedBindings?.elements??[]).map(item=>({module:node.moduleSpecifier.text,name:item.propertyName?.text??item.name.text,local:item.name.text,typeOnly:Boolean(node.importClause.isTypeOnly||item.isTypeOnly)}))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const extraction=ts.transpileDeclaration(bytes.toString(),{fileName:'node-runner.ts',compilerOptions:{removeComments:true}});
 const decl=ts.createSourceFile('node-runner.d.ts',extraction.outputText,ts.ScriptTarget.Latest,true);
 const surface=JSON.stringify(decl.statements.filter(node=>node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(node=>tokens(node,decl)));
 return{surface,imports,diagnostics:(extraction.diagnostics??[]).map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))};
}
const priorBytes=execFileSync('git',['show',`${preceding}:${target}`]),bytes=fs.readFileSync(draft),prior=inspect(priorBytes),candidate=inspect(bytes);
const results={kind:'Static compatibility/exact-byte binding; not project typecheck or runtime acceptance',typescript:ts.version,precedingCommit:preceding,target,draft,predecessor:{bytes:priorBytes.length,sha256:hash(priorBytes)},candidate:{bytes:bytes.length,sha256:hash(bytes),lines:bytes.toString().split('\n').length-1},exportedDeclarationsEqual:prior.surface===candidate.surface,exportedDeclarationStructureSha256:{predecessor:hash(prior.surface),candidate:hash(candidate.surface)},runtimeImportsEqual:JSON.stringify(prior.imports.filter(i=>!i.typeOnly))===JSON.stringify(candidate.imports.filter(i=>!i.typeOnly)),imports:candidate.imports,relativeDependenciesExist:candidate.imports.filter(i=>i.module.startsWith('.')).every(i=>fs.existsSync(path.resolve(path.dirname(target),i.module.replace(/\.js$/,'.ts')))),declarationExtractionDiagnostics:{predecessor:prior.diagnostics,candidate:candidate.diagnostics},runtimeTestsRun:false,projectTypecheckRun:false};
console.log(JSON.stringify(results,null,2));
if(!results.exportedDeclarationsEqual||!results.runtimeImportsEqual||!results.relativeDependenciesExist||prior.diagnostics.length||candidate.diagnostics.length||results.candidate.sha256!=='61e6c3ea17edf02e748469e21dd8d2e3f22b26ead2f3a27169a30c197252dc27')process.exitCode=1;
