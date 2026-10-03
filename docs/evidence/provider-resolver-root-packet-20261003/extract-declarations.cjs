const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const root=process.cwd(),out=path.join(root,'docs/evidence/provider-resolver-root-packet-20261003');
const printer=ts.createPrinter({removeComments:true});
const records=[];
function signature(p,sf){let text=p.getText(sf);if(p.initializer){text=text.slice(0,p.initializer.getStart(sf)-p.getStart(sf)).replace(/\s*=\s*$/,'').trim();if(!p.questionToken)text=text.replace(p.name.getText(sf),p.name.getText(sf)+'?');}return text;}
function member(n,sf){if(n.name&&ts.isPrivateIdentifier(n.name))return null;if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword||m.kind===ts.SyntaxKind.ProtectedKeyword))return null;
const mods=(n.modifiers??[]).map(m=>m.getText(sf)).filter(m=>!['public','override','declare'].includes(m));
if(ts.isPropertyDeclaration(n)){let typ=n.type?.getText(sf);const value=n.initializer&&ts.isAsExpression(n.initializer)?n.initializer.expression:n.initializer;if(!typ&&value&&ts.isStringLiteral(value)&&mods.includes('readonly'))typ=JSON.stringify(value.text);if(!typ)throw Error('Missing explicit field type:'+n.name.getText(sf));return mods.join(' ')+' '+n.name.getText(sf)+(n.questionToken?'?':'')+': '+typ+';';}
if(ts.isConstructorDeclaration(n))return 'constructor('+n.parameters.map(p=>signature(p,sf)).join(', ')+');';
if(ts.isMethodDeclaration(n)){if(!n.type)throw Error('Missing explicit return:'+n.name.getText(sf));return mods.join(' ')+' '+n.name.getText(sf)+(n.questionToken?'?':'')+(n.typeParameters?.length?'<'+n.typeParameters.map(t=>t.getText(sf)).join(', ')+'>':'')+'('+n.parameters.map(p=>signature(p,sf)).join(', ')+'): '+n.type.getText(sf)+';';}return null;}
function extract(src,dest,opts={}){const body=fs.readFileSync(src,'utf8'),sf=ts.createSourceFile(src,body,ts.ScriptTarget.Latest,true),lines=[];
for(const n of sf.statements){if(ts.isImportDeclaration(n)){const module=n.moduleSpecifier.text;if(opts.excludeImports?.includes(module))continue;let text=printer.printNode(ts.EmitHint.Unspecified,n,sf);if(!n.importClause?.isTypeOnly)text=text.replace(/^import /,'import type ').replace(/\btype (?=[\w])/g,''); // all imports are contract-only
if(!text.startsWith('import type '))text=text.replace(/^import /,'import type ');
lines.push(text);continue;}
if(ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n)){if(opts.namedTypes&& !opts.namedTypes.includes(n.name.text))continue;lines.push(printer.printNode(ts.EmitHint.Unspecified,n,sf));continue;}
const exported=n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
if(ts.isFunctionDeclaration(n)&&exported){if(opts.functions&&!opts.functions.includes(n.name.text))continue;lines.push('export declare function '+n.name.text+(n.typeParameters?.length?'<'+n.typeParameters.map(t=>t.getText(sf)).join(', ')+'>':'')+'('+n.parameters.map(p=>signature(p,sf)).join(', ')+'): '+n.type.getText(sf)+';');continue;}
if(ts.isClassDeclaration(n)&&exported){if(opts.classes&&!Object.hasOwn(opts.classes,n.name.text))continue;const selected=opts.classes?.[n.name.text];const members=n.members.filter(m=>!selected||ts.isPropertyDeclaration(m)||ts.isConstructorDeclaration(m)||selected.includes(m.name?.getText(sf))).map(m=>member(m,sf)).filter(Boolean);
const heritage=n.heritageClauses?.map(h=>h.getText(sf)).join(' ')??'';lines.push('export declare '+(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AbstractKeyword)?'abstract ':'')+'class '+n.name.text+(n.typeParameters?.length?'<'+n.typeParameters.map(t=>t.getText(sf)).join(', ')+'>':'')+(heritage?' '+heritage:'')+' {\n'+members.map(m=>'  '+m.trim()).join('\n')+'\n}');}
}
const output=lines.join('\n\n')+'\n';fs.writeFileSync(path.join(out,dest),output);records.push({source:src,output:dest,sourceBytes:Buffer.byteLength(body),sourceSha256:crypto.createHash('sha256').update(body).digest('hex'),declarationBytes:Buffer.byteLength(output),options:opts});}
extract('packages/provider/src/resolver.ts','public-api.d.ts');
extract('packages/provider/src/config/provider-config.ts','dependencies/provider-config.d.ts',{excludeImports:['./schema-validation.js'],functions:[],classes:{ApiKeyAccessConfig:[],ZhipuAccountAccessConfig:[],ProviderApiConfig:[],ProviderConfig:['overlay','withoutGroup','validateComplete'],ProviderTemplate:[],ProviderTemplateMap:['get'],ProviderConfigMap:['overlay','mapConfigs','get','getRule','has','keys','entries']}});
extract('packages/provider/src/config/model-config.ts','dependencies/model-config.d.ts',{excludeImports:['./schema-validation.js','./manual-model-config.js'],functions:[],classes:{EnumOptionSpecConfig:[],LimitOptionSpecConfig:[],ModelInputFormatConfig:[],ModelOutputFormatConfig:[],ModelPropertiesConfig:[],ModelOptionSpecsConfig:[],ModelConfig:['validateComplete'],ModelConfigRules:['composeEffective','resolve']}});
extract('packages/provider/src/config-overlay.ts','dependencies/config-overlay.d.ts',{functions:[],classes:{ConfigOverlay:['overlay','validateComplete']}});
extract('packages/provider/src/config/ids.ts','dependencies/ids.d.ts');
extract('packages/provider/src/account-provider-state.ts','dependencies/account-provider-state.d.ts');
extract('packages/provider/src/owned-order.ts','dependencies/owned-order.d.ts');
fs.writeFileSync(path.join(out,'declaration-extraction.json'),JSON.stringify({compiler:ts.version,mode:'AST parse/print only; no semantic compiler, source emit or module execution',outputs:records},null,2)+'\n');console.log(JSON.stringify({outputs:records.map(x=>({path:x.output,bytes:x.declarationBytes})),compiler:ts.version}));
