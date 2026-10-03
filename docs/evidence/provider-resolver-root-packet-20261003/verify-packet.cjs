const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet=path.join(process.cwd(),'docs/evidence/provider-resolver-root-packet-20261003');
const manifest=JSON.parse(fs.readFileSync(path.join(packet,'curator-manifest.json'),'utf8'));
function bind(p,item){const b=fs.readFileSync(p);if(b.length!==item.bytes||crypto.createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('Digest mismatch:'+p);if(item.gitBlob&&crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex')!==item.gitBlob)throw Error('Git blob mismatch:'+p);}
for(const item of manifest.sourceAndMetadataBindings)bind(item.path,item);
for(const item of manifest.authorInputBindings)bind(path.join(packet,item.path),item);
const src='packages/provider/src/resolver.ts',sf=ts.createSourceFile(src,fs.readFileSync(src,'utf8'),ts.ScriptTarget.Latest,true);
const ap=path.join(packet,'public-api.d.ts'),api=ts.createSourceFile(ap,fs.readFileSync(ap,'utf8'),ts.ScriptTarget.Latest,true);
function exportsOf(f){return f.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>({kind:ts.SyntaxKind[n.kind],name:n.name?.getText(f)}));}
if(JSON.stringify(exportsOf(sf))!==JSON.stringify(exportsOf(api)))throw Error('Export topology mismatch');
function functionSurface(n,f){return {name:n.name.getText(f),parameters:n.parameters.map(p=>({name:p.name.getText(f),type:p.type?.getText(f),optional:!!p.questionToken||!!p.initializer,rest:!!p.dotDotDotToken})),returns:n.type?.getText(f)};}
const oldFunctions=sf.statements.filter(ts.isFunctionDeclaration).filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>functionSurface(n,sf));
const newFunctions=api.statements.filter(ts.isFunctionDeclaration).map(n=>functionSurface(n,api));
if(JSON.stringify(oldFunctions)!==JSON.stringify(newFunctions))throw Error('Function parameter/default/return signature mismatch');

let declarationFiles=0,forbiddenBodies=0,initializerExpressions=0,parseErrors=0;
for(const item of manifest.authorInputBindings.filter(x=>x.path.endsWith('.d.ts'))){const file=path.join(packet,item.path),f=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);parseErrors+=f.parseDiagnostics.length;declarationFiles++;
function visit(n){if((ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n))&&n.body)forbiddenBodies++;if((ts.isPropertyDeclaration(n)||ts.isParameter(n)||ts.isVariableDeclaration(n))&&n.initializer)initializerExpressions++;if(ts.isArrowFunction(n)||ts.isFunctionExpression(n))forbiddenBodies++;ts.forEachChild(n,visit);}visit(f);}
if(forbiddenBodies||initializerExpressions||parseErrors)throw Error('Declaration body/initializer/parse failure:'+JSON.stringify({forbiddenBodies,initializerExpressions,parseErrors}));
const staticData=JSON.parse(fs.readFileSync(path.join(packet,'retained-data.json'),'utf8'));
const literals=new Set();function collect(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))literals.add(n.text);ts.forEachChild(n,collect);}collect(sf);
for(const v of [...staticData.defaultValidationPaths.provider,...staticData.defaultValidationPaths.model,...staticData.resolutionPathSegments,...staticData.familyGroups,staticData.accountAccessDiscriminator,staticData.hiddenVisibility,staticData.candidateKind,...staticData.candidateSources,staticData.issues.missingTemplate.code])if(!literals.has(v))throw Error('Static literal unbound:'+v);
const resolutionClass=sf.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='ProviderConfigResolver');const classMethods=resolutionClass.members.filter(ts.isMethodDeclaration).map(n=>n.name.getText(sf));const declaredClass=api.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='ProviderConfigResolver');if(JSON.stringify(classMethods)!==JSON.stringify(declaredClass.members.filter(ts.isMethodDeclaration).map(n=>n.name.getText(api))))throw Error('Class method mismatch');
const defaultParams=sf.statements.filter(ts.isFunctionDeclaration).filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).flatMap(n=>n.parameters.filter(p=>p.initializer).map(p=>n.name.text+'.'+p.name.getText(sf)));
if(defaultParams.join(',')!=='createRegistryProviderConfig.path,createRegistryModelConfig.path')throw Error('Unexpected defaults');
const result={mode:'Static AST + digest checks only; no resolver/dependency execution or semantic typecheck',typescript:ts.version,sourceMetadataBindings:manifest.sourceAndMetadataBindings.length,authorInputBindings:manifest.authorInputBindings.length,completeExportDeclarations:exportsOf(sf).length,functionSignatures:'PASS4/4',classMethods,declarationFiles,forbiddenBodies,initializerExpressions,parseErrors,defaultParameters:defaultParams,staticLiteralBinding:'PASS',runtimeTests:false,sourceChanges:0,materialOpen:21,status:'PASS'};
fs.writeFileSync(path.join(packet,'packet-static-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
