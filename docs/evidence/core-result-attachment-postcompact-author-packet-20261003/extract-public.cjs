// Static body-free declarations/data/bindings, no predecessor or collaborator execution.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet='docs/evidence/core-result-attachment-postcompact-author-packet-20261003',reservation=JSON.parse(fs.readFileSync(packet+'/reservation.json'));
const all=new Map(),diagnostics={},printer=ts.createPrinter({removeComments:true});
const bind=(p,b)=>({path:p,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});
function parse(file){if(all.has(file))return all.get(file);const b=fs.readFileSync(file),d=ts.transpileDeclaration(b.toString(),{fileName:file,compilerOptions:{removeComments:true}}),result={b,source:ts.createSourceFile(file,b.toString(),ts.ScriptTarget.Latest,true),decl:ts.createSourceFile(file+'.d.ts',d.outputText,ts.ScriptTarget.Latest,true),output:d.outputText,diagnostics:(d.diagnostics??[]).map(x=>({code:x.code,message:ts.flattenDiagnosticMessageText(x.messageText,'\n')}))};all.set(file,result);return result;}
function selected(file,names){const {decl}=parse(file);return '// Original type owner: '+file+'\n'+names.map(name=>{const n=decl.statements.find(n=>n.name?.text===name);if(!n)throw Error('Missing '+name);return printer.printNode(ts.EmitHint.Unspecified,n,decl)}).join('\n')+'\n';}
const core='apps/cli/packages/core/src/',contracts='apps/cli/packages/contracts/src/';
const shapeSets={
 result:[[core+'tool/types.ts',['ToolExecutionResult']],[core+'tool/scheduler.ts',['ToolSchedule','ToolScheduleItem']]],
 changes:[[core+'runtime/types.ts',['RuntimeTurnFileChangeEntry','RuntimeTurnFileChangeMap']],[contracts+'tools/write.ts',['DiffHunk']],[contracts+'events/session.events.ts',['TurnFileChangeSummary','TurnFileChangeSummaryItem']]],
 image:[[core+'runtime/types.ts',['PreparedImageData']],[contracts+'interfaces/image-processor.port.ts',['ImageProcessorPort','ImageResizeRequest','ImageResizeResult','ImagePrepareForModelRequest','ImagePrepareForModelResult']]],
 reference:[[core+'runtime/types.ts',['ResolvedTurnAttachment']]],
 postcompact:[[core+'tool/types.ts',['ReadFileStateEntry','ReadFileStateMap']],[core+'agent/message-history.ts',['ToolCallInput','ModelInputMessage','RuntimeMessageSource','RuntimeMessageMetadata','RuntimeMessageMessageEntry','RuntimeAttachmentEntry','RuntimeMessageEntry']]],
};
const apiSets={result:[[core+'tool/handlers/bash-model-content.ts',['isBashOutputProviderError']]],changes:[],image:[],reference:[[core+'runtime/helpers/attachment-artifacts.ts',['safeAttachmentOriginalRef']],[core+'runtime/helpers/attachment-video.ts',['inferVideoMimeFromPath']]],postcompact:[[core+'agent/message-history.ts',['systemReminderAttachmentEntry']]]};
const extras={
 result:'export declare const modelMessageContentToText: typeof import("../deps.js").modelMessageContentToText;\n',
 changes:'export declare const structuredPatch: typeof import("diff").structuredPatch;\n',
 image:'export declare const READ_IMAGE_MAX_BASE64_BYTES: typeof import("../deps.js").READ_IMAGE_MAX_BASE64_BYTES;\nexport declare const READ_IMAGE_TARGET_BYTES: typeof import("../deps.js").READ_IMAGE_TARGET_BYTES;\nexport declare const MAX_IMAGE_ATTACHMENT_DIMENSION: typeof import("../types.js").MAX_IMAGE_ATTACHMENT_DIMENSION;\n',
 reference:'export declare const isArtifactUri: typeof import("@knorvia/shared").isArtifactUri;\nexport declare const basename: typeof import("../deps.js").basename;\n',
 postcompact:'export declare const ESTIMATED_TOKEN_CHAR_DIVISOR: typeof import("@knorvia/shared").ESTIMATED_TOKEN_CHAR_DIVISOR;\n',
};
const aliasSets={
 result:{ModelMessageContent:['@knorvia/contracts','ModelMessageContent'],ToolCallId:['@knorvia/contracts','ToolCallId'],ModelToolSideEffectScope:['@knorvia/contracts','ModelToolSideEffectScope'],ToolExecutionTurnControl:['../../tool/types.js','ToolExecutionTurnControl'],ToolExecutionFollowUpUserInput:['../../tool/types.js','ToolExecutionFollowUpUserInput'],ToolResultDisplayPayload:['@knorvia/contracts','ToolResultDisplayPayload'],PersistedReadFileStateMetadata:['../../tool/read-file-state-metadata.js','PersistedReadFileStateMetadata'],ToolResultSerialization:['../../tool/types.js','ToolResultSerialization'],ToolExecutionTelemetry:['@knorvia/contracts','ToolExecutionTelemetry'],PermissionBrokerReasonSource:['@knorvia/contracts','PermissionBrokerReasonSource']},
 changes:{},image:{TraceContext:['@knorvia/contracts','TraceContext'],AttachmentStorageMetadata:['@knorvia/contracts','AttachmentStorageMetadata'],ImageCompressionStrategy:['@knorvia/contracts','ImageCompressionStrategy']},
 reference:{TurnAttachment:['@knorvia/contracts','TurnAttachment'],FilePartSource:['@knorvia/contracts','FilePartSource'],ModelMessageContentBlock:['@knorvia/contracts','ModelMessageContentBlock'],AttachmentStorageMetadata:['@knorvia/contracts','AttachmentStorageMetadata']},
 postcompact:{ModelCacheControl:['@knorvia/contracts','ModelCacheControl'],ModelMessageContent:['@knorvia/contracts','ModelMessageContent'],Model:['@knorvia/contracts','Model'],RuntimeInputPresentation:['@knorvia/contracts','RuntimeInputPresentation'],TokenUsageInfo:['@knorvia/contracts','TokenUsageInfo'],SystemReminderSource:['../../system-reminder/source.js','SystemReminderSource']},
};
for(const [scope,r]of Object.entries(reservation.scopes)){
 const out=packet+'/'+scope;fs.mkdirSync(out,{recursive:true});const parsed=parse(r.path);if(bind(r.path,parsed.b).sha256!==r.sha256)throw Error('Target changed');diagnostics[scope]=parsed.diagnostics;
 fs.writeFileSync(out+'/public-api.d.ts',parsed.output);
 fs.writeFileSync(out+'/dependency-api.d.ts','// Public ports retained at original owners; no implementations/standalone compilation claim.\n'+apiSets[scope].map(([f,n])=>selected(f,n)).join('\n')+extras[scope]);
 fs.writeFileSync(out+'/public-shapes.d.ts',shapeSets[scope].map(([f,n])=>selected(f,n)).join('\n')+Object.entries(aliasSets[scope]).map(([name,[module,original]])=>`export type ${name} = import("${module}").${original};`).join('\n')+'\n');
 const imports=parsed.source.statements.filter(ts.isImportDeclaration).map(n=>({module:n.moduleSpecifier.text,clause:n.importClause?.getText(parsed.source)}));fs.writeFileSync(out+'/imports.json',JSON.stringify(imports,null,2)+'\n');
 const strings=[],regex=[],numbers=[];function walk(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))strings.push({kind:'text',text:n.text});else if(ts.isTemplateExpression(n))strings.push({kind:'template',head:n.head.text,spans:n.templateSpans.map(x=>({placeholder:x.expression.getText(parsed.source),text:x.literal.text}))});else if(n.kind===ts.SyntaxKind.RegularExpressionLiteral)regex.push(n.getText(parsed.source));else if(ts.isNumericLiteral(n))numbers.push(n.text);ts.forEachChild(n,walk)}walk(parsed.source);
 fs.writeFileSync(out+'/output-data.json',JSON.stringify({strings,regex,numericLiterals:numbers,externalConstants:{READ_IMAGE_MAX_BASE64_BYTES:5242880,READ_IMAGE_TARGET_BYTES:3932160,MAX_IMAGE_ATTACHMENT_DIMENSION:2000,ESTIMATED_TOKEN_CHAR_DIVISOR:3},retainedDataQualification:'Exact required prose/protocol/schema/format/constant data and ordinary idioms, not novelty/rights claim; no source bodies delivered'},null,2)+'\n');
}
// Existing constant owners and dependencies byte-bound, not executed.
for(const f of [contracts+'tools/read.ts','packages/shared/src/usage-stats.ts',core+'runtime/deps.ts','apps/cli/packages/core/package.json','pnpm-lock.yaml'])if(!all.has(f))all.set(f,{b:fs.readFileSync(f),diagnostics:[]});
const boundaries=[...all].filter(([file])=>!Object.values(reservation.scopes).some(r=>r.path===file)).map(([file,r])=>bind(file,r.b));
fs.writeFileSync(packet+'/untouched-boundary-bindings.json',JSON.stringify(boundaries,null,2)+'\n');
fs.writeFileSync(packet+'/public-extraction-record.json',JSON.stringify({typescript:ts.version,diagnostics,mechanicalDeclarations:[...all].map(([file,r])=>({...bind(file,r.b),diagnostics:r.diagnostics})),qualified:'Selected types/ports only; opaque authoritative aliases not standalone typecheck; parser source exposure qualified; no A methods/security/permission implementation bodies parsed'},null,2)+'\n');
console.log(JSON.stringify({diagnostics,boundaries:boundaries.length}));
