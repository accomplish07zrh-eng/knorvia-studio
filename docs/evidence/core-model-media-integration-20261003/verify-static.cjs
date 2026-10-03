// Static public declarations/imports/byte provenance only; no body execution/project compilation.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const ts=require(process.argv[3]??'/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const scope=process.argv[2],packet='docs/evidence/core-model-media-author-packet-20261003';
const manifest=JSON.parse(fs.readFileSync(packet+'/curator-input-manifest.json'));
const archiveRoot=fs.existsSync(`${packet}/${scope}/v2/curator-draft-manifest.json`)?`${packet}/${scope}/v2`:`${packet}/${scope}`;
const archive=JSON.parse(fs.readFileSync(`${archiveRoot}/curator-draft-manifest.json`));
const target=manifest.scopes[scope].source;
const sourceRecords=archive.files.filter(x=>x.target);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const bind=b=>({bytes:b.length,sha256:hash(b)});
const read=p=>fs.readFileSync(p);
const previous=p=>cp.execFileSync('git',['show',`${manifest.baseline}:${p}`]);
function tokens(node,tree){
 const children=node.getChildren(tree);return children.length?[node.kind,...children.map(n=>tokens(n,tree))]:[node.kind,node.getText(tree)];
}
function parse(p,b){
 const tree=ts.createSourceFile(p,b.toString(),ts.ScriptTarget.Latest,true);
 const imports=tree.statements.filter(ts.isImportDeclaration).flatMap(n=>(n.importClause?.namedBindings?.elements??[]).map(e=>({
  module:n.moduleSpecifier.text,name:e.propertyName?.text??e.name.text,typeOnly:!!(n.importClause.isTypeOnly||e.isTypeOnly)
 })));
 const d=ts.transpileDeclaration(b.toString(),{fileName:p,compilerOptions:{removeComments:true}});
 const qualifiedText=scope==='errors'?d.outputText.replace(/(export declare function create(?:ModelContextExceededFinishError|CompactRapidRefillError)\([^]*?\): )any;/g,'$1ReturnType<typeof createCoreError>;'):d.outputText;
 const decl=ts.createSourceFile(p+'.d.ts',qualifiedText,ts.ScriptTarget.Latest,true);
 const printer=ts.createPrinter({removeComments:true});
 const surface=decl.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n)).map(n=>{
  if(ts.isClassDeclaration(n)) {
   const filtered=ts.factory.updateClassDeclaration(n,n.modifiers,n.name,n.typeParameters,n.heritageClauses,n.members.filter(m=>!m.modifiers?.some(x=>x.kind===ts.SyntaxKind.PrivateKeyword||x.kind===ts.SyntaxKind.ProtectedKeyword)));
   const normalized=ts.createSourceFile(p+'.public.d.ts',printer.printNode(ts.EmitHint.Unspecified,filtered,decl),ts.ScriptTarget.Latest,true);
   return {name:n.name?.text,node:normalized.statements[0],tree:normalized};
  }
  return {name:n.name?.text??n.declarationList?.declarations.map(e=>e.name.getText(decl)).join(','),node:n,tree:decl};
 });
 const exported=decl.statements.filter(ts.isExportDeclaration).map(n=>({module:n.moduleSpecifier?.text,names:n.exportClause?.elements?.map(e=>({name:e.name.text,original:e.propertyName?.text??e.name.text}))??[]}));
 return {surface,exported,imports,diagnostics:(d.diagnostics??[]).map(x=>({code:x.code,message:ts.flattenDiagnosticMessageText(x.messageText,'\n')}))};
}
function surface(p,b,available){
 const result=parse(p,b);let parts=[...result.surface];
 for(const e of result.exported){
  if(!e.module) continue;
  const relative=path.posix.normalize(path.posix.join(path.posix.dirname(p),e.module.replace(/\.js$/,'.ts')));
  if(!available.has(relative)) throw Error('Unbounded re-export '+relative);
  const dependency=parse(relative,available.get(relative));
  for(const name of e.names){
   const part=dependency.surface.find(x=>x.name===name.original);
   if(!part || name.name!==name.original) throw Error('Missing/renamed public reexport '+name.name);
   parts.push(part);
  }
 }
 return JSON.stringify(parts.map(x=>[x.name,tokens(x.node,x.tree)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
const candidateMap=new Map(sourceRecords.map(r=>[r.target,read(`${archiveRoot}/${r.file}`)]));
const original=previous(target),originalParsed=parse(target,original);
const originalSurface=surface(target,original,new Map()),candidateSurface=surface(target,candidateMap.get(target),candidateMap);
const canonical=(p,x)=>`${x.module.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(p),x.module)):x.module}#${x.name}`;
const runtime=(p,parsed)=>parsed.imports.filter(x=>!x.typeOnly).filter(x=>!sourceRecords.some(r=>canonical(p,x).split('#')[0]===r.target.replace(/\.ts$/,'.js'))).map(x=>canonical(p,x));
const oldRuntime=runtime(target,originalParsed).sort();
const newRuntime=sourceRecords.flatMap(r=>runtime(r.target,parse(r.target,candidateMap.get(r.target)))).sort();
const receipt=JSON.parse(read(`${archiveRoot}/author-record.json`));
function bindings(o){
 if(!o||typeof o!=='object') return[];
 if(typeof o.bytes==='number'&&typeof o.sha256==='string') return[o];
 return Object.values(o).flatMap(bindings);
}
const receiptBindings=bindings(receipt);
function matchesReceipt(name,b){return receiptBindings.some(r=>path.basename(r.path??r.file??r.name??'')===name&&r.bytes===b.length&&r.sha256===hash(b));}
const inputs=[...manifest.scopes[scope].inputs,...(archive.extraInputs??[])].map(r=>{const b=read(r.path);return{...r,actual:bind(b),matchesManifest:r.bytes===b.length&&r.sha256===hash(b),matchesReceipt:matchesReceipt(path.basename(r.path),b)};});
const files=archive.files.map(r=>{const b=read(`${archiveRoot}/${r.file}`);return{...r,actual:bind(b),matchesArchive:r.bytes===b.length&&r.sha256===hash(b),...(r.target?{installed:bind(read(r.target)),installedExact:b.equals(read(r.target)),matchesReceipt:matchesReceipt(path.basename(r.target),b),lines:b.toString().split('\n').length-1}:{} )};});
const boundaries=JSON.parse(read(packet+'/untouched-boundary-bindings.json')).map(r=>{const b=read(r.path);return{...r,actual:bind(b),unchanged:r.bytes===b.length&&r.sha256===hash(b)};});
const dependencyCheck=sourceRecords.flatMap(r=>parse(r.target,candidateMap.get(r.target)).imports.filter(x=>x.module.startsWith('.')).map(x=>({from:r.target,module:x.module,exists:fs.existsSync(path.posix.normalize(path.posix.join(path.posix.dirname(r.target),x.module.replace(/\.js$/,'.ts'))))})));
const originalArchive=JSON.parse(read(`${packet}/${scope}/curator-draft-manifest.json`));
const originalFreezeBindings=originalArchive.files.map(r=>{const b=read(`${packet}/${scope}/${r.file}`);return{...r,unchanged:r.bytes===b.length&&r.sha256===hash(b)};});
const declarationsEqual=originalSurface===candidateSurface;
const runtimeImportsEqual=JSON.stringify(oldRuntime)===JSON.stringify(newRuntime);
const candidateDiagnostics=sourceRecords.map(r=>({path:r.target,diagnostics:parse(r.target,candidateMap.get(r.target)).diagnostics}));
const expectedPredecessorDiagnostics=(manifest.declarationExtraction.diagnostics[scope]??[]).map(({code,message})=>({code,message}));
const extractionDiagnosticsQualified=JSON.stringify(originalParsed.diagnostics)===JSON.stringify(expectedPredecessorDiagnostics)&&candidateDiagnostics.every(x=>x.diagnostics.length===0);
const passed=extractionDiagnosticsQualified&&originalFreezeBindings.every(x=>x.unchanged)&&declarationsEqual&&runtimeImportsEqual&&inputs.every(x=>x.matchesManifest&&x.matchesReceipt)&&files.every(x=>x.matchesArchive&&(!x.target||(x.installedExact&&x.matchesReceipt&&x.lines<400)))&&boundaries.every(x=>x.unchanged)&&dependencyCheck.every(x=>x.exists);
console.log(JSON.stringify({kind:'Static declaration/import/input/output/boundary bindings only; no owner execution/project typecheck',typescript:ts.version,scope,baseline:manifest.baseline,target,declarationsEqual,declarationDigest:{predecessor:hash(originalSurface),candidate:hash(candidateSurface)},runtimeImportsEqual,runtimeImports:{predecessor:oldRuntime,candidate:newRuntime},declarationExtractionDiagnostics:{predecessor:originalParsed.diagnostics,candidates:candidateDiagnostics},semanticReturnQualification:scope==='errors'?'Two constructors directly return unchanged createCoreError; inherited isolated TS9007 kept, declaration return qualified ReturnType<typeof createCoreError> as frozen supplied API. No body/project typecheck.':undefined,inputs,files,originalFreezeBindings,boundaries,dependencyCheck,extractionDiagnosticsQualified,passed,ordinaryTestsRun:false,buildsRun:false,projectTypecheckRun:false,lintRun:false},null,2));
if(!passed)process.exitCode=1;
