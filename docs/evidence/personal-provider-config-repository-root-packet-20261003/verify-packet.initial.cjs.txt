const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet=path.join(process.cwd(),'docs/evidence/personal-provider-config-repository-root-packet-20261003'),manifest=JSON.parse(fs.readFileSync(path.join(packet,'curator-manifest.json'),'utf8'));
function binding(p,x){const b=fs.readFileSync(p);if(b.length!==x.bytes||crypto.createHash('sha256').update(b).digest('hex')!==x.sha256||crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex')!==x.gitBlob)throw Error('Binding mismatch:'+p);}
for(const x of manifest.sourceMetadataBindings)binding(x.path,x);for(const x of manifest.authorInputBindings)binding(path.join(packet,x.path),x);
function parse(p){return ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true)}
const src=parse('packages/provider-node/src/personal-provider-config-repository.ts'),api=parse(path.join(packet,'public-api.d.ts'));
function exports(f){return f.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>({kind:ts.SyntaxKind[n.kind],name:n.name?.getText(f)}))}
if(JSON.stringify(exports(src))!==JSON.stringify(exports(api)))throw Error('Export topology mismatch');
function memberSurface(n,f){return {kind:ts.SyntaxKind[n.kind],name:n.name?.getText(f)??'constructor',params:n.parameters.map(p=>({name:p.name.getText(f),type:p.type.getText(f),optional:!!p.questionToken||!!p.initializer})),returns:n.type?.getText(f)}}
const classSrc=src.statements.find(ts.isClassDeclaration),classApi=api.statements.find(ts.isClassDeclaration);
const publicMembers=classSrc.members.filter(n=>!n.name||!ts.isPrivateIdentifier(n.name));
const oldMembers=publicMembers.map(n=>memberSurface(n,src)),newMembers=classApi.members.map(n=>memberSurface(n,api));
if(JSON.stringify(oldMembers)!==JSON.stringify(newMembers))throw Error('Constructor/method signature mismatch');
const fnSrc=src.statements.find(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)),fnApi=api.statements.find(ts.isFunctionDeclaration);
if(JSON.stringify(memberSurface(fnSrc,src))!==JSON.stringify(memberSurface(fnApi,api)))throw Error('Factory signature mismatch');
let bodyCount=0,initializerCount=0,parseErrors=0,declarationFiles=0;
for(const x of manifest.authorInputBindings.filter(x=>x.path.endsWith('.d.ts'))){const f=parse(path.join(packet,x.path));declarationFiles++;parseErrors+=f.parseDiagnostics.length;function visit(n){if((ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n))&&n.body)bodyCount++;if(ts.isFunctionExpression(n)||ts.isArrowFunction(n))bodyCount++;if((ts.isParameter(n)||ts.isPropertyDeclaration(n)||ts.isVariableDeclaration(n))&&n.initializer)initializerCount++;ts.forEachChild(n,visit)}visit(f)}
if(bodyCount||initializerCount||parseErrors)throw Error('Declaration leak/parse error');
const data=JSON.parse(fs.readFileSync(path.join(packet,'retained-data.json'),'utf8')),strings=new Set();function collect(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))strings.add(n.text);ts.forEachChild(n,collect)}collect(src);
for(const v of [...data.changeReasons,...data.targetErrors,data.io.readEncoding,data.io.missingErrorCode,data.io.hashAlgorithm,data.io.hashDigest])if(!strings.has(v))throw Error('Unbound target static value:'+v);
function frozenObjectKeys(fnName){const fn=src.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===fnName),ret=fn.body.statements.find(ts.isReturnStatement),obj=ret.expression.arguments[0];return obj.properties.map(n=>n.name.getText(src))}
if(JSON.stringify(frozenObjectKeys('snapshotFromUpdate'))!==JSON.stringify(data.snapshotOwnKeys))throw Error('Snapshot key mismatch');
if(JSON.stringify(frozenObjectKeys('emptyUpdate'))!==JSON.stringify(data.emptyUpdateOwnKeys))throw Error('Empty update key mismatch');
const codec=parse('packages/provider-node/src/provider-config-file-codec.ts'),propertyNames=new Set();function props(n){if(n.name&&(ts.isPropertyAssignment(n)||ts.isShorthandPropertyAssignment(n)))propertyNames.add(n.name.getText(codec).replace(/^['"]|['"]$/g,''));ts.forEachChild(n,props)}props(codec);
for(const k of [...data.wire.rootKeys,...data.wire.configRequiredKeys,...data.wire.configOptionalKeys,data.wire.providerRulesWrapperKey])if(!propertyNames.has(k))throw Error('Unbound codec wire key:'+k);
const result={mode:'AST/digest/source-data checks only, no repository or native port/runtime execution',typescript:ts.version,sourceMetadataBindings:manifest.sourceMetadataBindings.length,authorInputBindings:manifest.authorInputBindings.length,exportDeclarations:exports(src).length,publicClassMembers:oldMembers.map(x=>x.name),factorySignature:'PASS',constructorAndMethodSignatures:'PASS',declarationFiles,bodyCount,initializerCount,parseErrors,targetStaticValues:'PASS',snapshotAndEmptyOwnKeys:'PASS',codecWireKeys:'PASS',semanticTypeClosure:false,ordinaryTestsBuildRun:false,productionChanges:0,materialOpen:21,status:'PASS'};
fs.writeFileSync(path.join(packet,'packet-static-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
