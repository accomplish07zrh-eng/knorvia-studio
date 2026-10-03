// Static stripped declarations and literal data only; no behavior or predecessor execution.
const fs=require('fs'),crypto=require('crypto'),ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const dir='docs/evidence/core-inline-attachment-owner-packet-20261003',r=JSON.parse(fs.readFileSync(dir+'/reservation.json')),all=new Map(),printer=ts.createPrinter({removeComments:true});
const bind=(path,b)=>({path,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});
function parse(file){if(all.has(file))return all.get(file);const b=fs.readFileSync(file),d=ts.transpileDeclaration(b.toString(),{fileName:file,compilerOptions:{removeComments:true}});const v={b,src:ts.createSourceFile(file,b.toString(),ts.ScriptTarget.Latest,true),decl:ts.createSourceFile(file+'.d.ts',d.outputText,ts.ScriptTarget.Latest,true),output:d.outputText,diagnostics:(d.diagnostics??[]).map(x=>({code:x.code,message:ts.flattenDiagnosticMessageText(x.messageText,'\n')}))};all.set(file,v);return v;}
function selected(file,names){const p=parse(file);return '// Original owner: '+file+'\n'+names.map(name=>{const node=p.decl.statements.find(n=>n.name?.text===name);if(!node)throw Error('Missing '+name);return printer.printNode(ts.EmitHint.Unspecified,node,p.decl)}).join('\n')+'\n';}
const core='apps/cli/packages/core/src/',contracts='apps/cli/packages/contracts/src/';
for(const [scope,x]of Object.entries(r.scopes)){
 const out=dir+'/'+scope;fs.mkdirSync(out,{recursive:true});const p=parse(x.path);if(bind(x.path,p.b).sha256!==x.sha256)throw Error('Changed '+x.path);
 fs.writeFileSync(out+'/public-api.d.ts',p.output);
 let dep='// Authoritative original dependency owners, no implementation supplied.\n',shape='// Original selected public types, not standalone compilation.\n';
 if(scope==='pdf'||scope==='video')dep+=selected(r.scopes.dataurl.path,['base64PayloadByteLength','isStrictBase64Payload']);
 if(scope==='video')shape+=selected(contracts+'tools/read.ts',['ReadVideoOutput']);
 if(scope==='placeholder'){
 dep+=selected(core+'runtime/helpers/attachment-artifacts.ts',['safeAttachmentOriginalRef'])+selected('packages/shared/src/artifact-uri.ts',['isArtifactUri']);
 shape+=selected(core+'runtime/types.ts',['ResolvedTurnAttachment'])+selected(core+'agent/turn-state.ts',['TurnAttachment'])+selected(contracts+'interfaces/session-store.port.ts',['FilePartSource','AttachmentStorageMetadata']);
 shape+='export type ModelMessageContentBlock = import("@knorvia/contracts").ModelMessageContentBlock;\nexport type ArtifactUri = import("@knorvia/shared").ArtifactUri;\n';
 }
 fs.writeFileSync(out+'/dependency-api.d.ts',dep);fs.writeFileSync(out+'/public-shapes.d.ts',shape);
 fs.writeFileSync(out+'/imports.json',JSON.stringify(p.src.statements.filter(ts.isImportDeclaration).map(n=>({module:n.moduleSpecifier.text,clause:n.importClause?.getText(p.src)})),null,2)+'\n');
 const strings=[],regex=[],numericLiterals=[];function walk(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))strings.push({kind:'text',text:n.text});else if(ts.isTemplateExpression(n))strings.push({kind:'template',head:n.head.text,spans:n.templateSpans.map(s=>({placeholder:s.expression.getText(p.src),text:s.literal.text}))});else if(n.kind===ts.SyntaxKind.RegularExpressionLiteral)regex.push(n.getText(p.src));else if(ts.isNumericLiteral(n))numericLiterals.push(n.text);ts.forEachChild(n,walk);}walk(p.src);
 fs.writeFileSync(out+'/output-data.json',JSON.stringify({strings,regex,numericLiterals,qualification:'Retained exact MIME/protocol/template/regex/constants and ordinary idioms; not novelty/grant claim'},null,2)+'\n');
}
const boundaries=[...all].filter(([p])=>!Object.values(r.scopes).some(x=>x.path===p)).map(([p,v])=>bind(p,v.b));
for(const p of ['apps/cli/packages/core/src/runtime/deps.ts','apps/cli/packages/core/package.json','pnpm-lock.yaml',...r.screening.filter(x=>x.decision.startsWith('retained')).map(x=>x.path)])if(!boundaries.some(x=>x.path===p))boundaries.push(bind(p,fs.readFileSync(p)));
fs.writeFileSync(dir+'/untouched-boundary-bindings.json',JSON.stringify(boundaries,null,2)+'\n');
fs.writeFileSync(dir+'/public-extraction-record.json',JSON.stringify({typescript:ts.version,mechanicalDeclarations:[...all].map(([p,v])=>({...bind(p,v.b),diagnostics:v.diagnostics})),qualification:'Curator prior body screening explicit; selected dependencies mechanically stripped for public types only. No original bodies delivered; no semantic/project compilation claim'},null,2)+'\n');
console.log(JSON.stringify({targets:Object.keys(r.scopes),targetDiagnostics:Object.fromEntries(Object.entries(r.scopes).map(([s,x])=>[s,parse(x.path).diagnostics])),boundaries:boundaries.length}));
