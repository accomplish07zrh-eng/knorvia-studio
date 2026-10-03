// Read/hash/AST checks only; neither owner is imported or executed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const dir='docs/evidence/provider-node-cache-paths-owner-screen-20261003';
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'review-manifest.json'),'utf8'));
const data=JSON.parse(fs.readFileSync(path.join(dir,'retained-data.json'),'utf8'));
const receipt=JSON.parse(fs.readFileSync(path.join(dir,'prior-receipt-search.json'),'utf8'));
function assert(c,m){if(!c)throw Error(m)}
function eq(a,b,m){assert(JSON.stringify(a)===JSON.stringify(b),m)}
function bind(p,x){const b=fs.readFileSync(p);assert(b.length===x.bytes&&crypto.createHash('sha256').update(b).digest('hex')===x.sha256&&crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex')===x.gitBlob,'Binding:'+p)}
for(const x of manifest.sourceMetadataBindings)bind(x.path,x);
for(const x of manifest.cacheAuthorInputBindings)bind(path.join(dir,x.path),x);
for(const x of [manifest.receiptBinding,manifest.materializerRetentionBinding])bind(path.join(dir,x.path),x);
function parse(p){const f=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true);assert(!f.parseDiagnostics.length,'Parse:'+p);return f}
function walk(n,fn){fn(n);ts.forEachChild(n,c=>walk(c,fn))}
function exports(f){return f.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))}
const src=parse('packages/provider-node/src/builtin-cache-paths.ts'),api=parse(path.join(dir,'public-api.d.ts'));
eq(exports(src).map(n=>[ts.SyntaxKind[n.kind],n.name.text]),exports(api).map(n=>[ts.SyntaxKind[n.kind],n.name.text]),'Complete export topology');
let functions=0,interfaces=0,bodies=0,initializers=0;
for(const n of exports(src)){const a=exports(api).find(a=>a.name.text===n.name.text);if(ts.isInterfaceDeclaration(n)){eq(n.getText(src),a.getText(api),'Interface/readonly fields');interfaces++}else{function sig(n,f){return {params:n.parameters.map(p=>[p.name.getText(f),p.type?.getText(f),!!p.questionToken]),returns:n.type.getText(f)}}eq(sig(n,src),sig(a,api),'Function signature');functions++}}
walk(api,n=>{if((ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n))&&n.body)bodies++;if(ts.isArrowFunction(n)||ts.isFunctionExpression(n))bodies++;if((ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isPropertyDeclaration(n))&&n.initializer)initializers++});assert(!bodies&&!initializers,'Declaration body/default leak');
const strings=new Set(),templates=new Set();let prefixLength;
walk(src,n=>{if(ts.isStringLiteral(n))strings.add(n.text);if(ts.isTemplateExpression(n))templates.add(n.getText(src).slice(1,-1));if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='slice')prefixLength=Number(n.arguments[1].getText(src))});
for(const value of [...Object.keys(data.platformMapping),...Object.values(data.platformMapping),...Object.keys(data.architectureMapping),...Object.values(data.architectureMapping),...data.allowedOriginProtocols,data.emptyOriginError,data.unsupportedProtocolError,...data.segmentNamesInValidationOrder,...data.segmentPolicy.rejectExact,data.endpointKey.algorithm,data.endpointKey.encoding,'runtime','provider',data.activeFilename,data.controlFilename])assert(strings.has(value),'Fixed token:'+value);
assert(templates.has(data.clientPlatformTemplate)&&templates.has(data.invalidSegmentErrorTemplate),'Fixed diagnostic/platform templates');
assert([...templates].some(t=>t==='endpoint-${digest}')&&prefixLength===data.endpointKey.hexPrefixLength,'Endpoint prefix/length');
const materializer=parse('packages/provider-node/src/builtin-provider-config-materializer.ts'),materializerStrings=new Set();let newline=false;
walk(materializer,n=>{if(ts.isStringLiteral(n))materializerStrings.add(n.text);if(ts.isTemplateTail(n)&&n.text==='\n')newline=true});
for(const v of ['runtime','provider','bundled',data.materializerRetained.filename,data.materializerRetained.textEncoding,data.materializerRetained.optionalReadErrorCode])assert(materializerStrings.has(v),'Materializer retained token:'+v);assert(newline,'Canonical trailing newline');
const targets=receipt.targets;assert(!JSON.parse(fs.readFileSync('licensing/reviews.json','utf8')).files.some(r=>targets.some(t=>r.path===t.path||JSON.stringify(r).includes(t.sha256))),'STOP exact old receipt');
assert(receipt.exactPathOrDigestReviewHits===0&&receipt.namedHits.length===1&&receipt.namedHits[0].path.endsWith('/source-review.json'),'Receipt scope changed');
let links=0;for(const p of ['README.md','materializer-retention.md'])for(const m of fs.readFileSync(path.join(dir,p),'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){if(/^https?:/.test(m[1]))continue;const target=path.resolve(dir,m[1].split('#')[0]);if(target!==path.resolve(dir,'static-results.json'))assert(fs.existsSync(target),'Link:'+m[1]);links++}
const result={mode:'AST/digest/fixed-data only; no owner/native IO/runtime execution',typescript:ts.version,sourceMetadataBindings:manifest.sourceMetadataBindings.length,cacheReadingInputs:manifest.cacheAuthorInputBindings.length,receiptAndRetentionBindings:2,cacheFunctions:functions,cacheInterfaces:interfaces,bodyCount:bodies,initializers,parseErrors:0,cacheFixedIdentityAndPathData:'PASS',materializerFixedPathEncodingNewline:'PASS',exactPublicReceipt:'No accepted path/digest record found; private historical HOLD unchanged',localLinks:links,newAuthors:0,newCandidates:0,materializer:'RETAIN; no standalone author packet',sourceChanges:0,newSourceRequests:0,ordinaryTestsBuilds:false,cacheConfigCredentialFileOperations:false,networkProviderExecution:false,rightsAccepted:false,materialOpen:21,status:'PASS'};
fs.writeFileSync(path.join(dir,'static-results.json'),JSON.stringify(result,null,2)+'\n');assert(fs.existsSync(path.join(dir,'static-results.json')),'Generated output absent');console.log(JSON.stringify(result));
