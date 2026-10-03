// Minimum isolated synthetic validation/identity/privacy/data/error gates; no predecessor execution.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet='docs/evidence/core-result-attachment-postcompact-author-packet-20261003',manifest=JSON.parse(fs.readFileSync(packet+'/curator-input-manifest.json')),bindings=[],results=[];
function load(scope,deps){const file=manifest.scopes[scope].source,b=fs.readFileSync(file);bindings.push({scope,path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});const exports={},js=ts.transpileModule(b.toString(),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports,Buffer,Error,require:id=>{if(!(id in deps))throw Error('Unapproved dependency '+id);return deps[id]}},{filename:file});return exports;}
async function probe(scope,name,run){try{await run();results.push({scope,name,passed:true})}catch(error){results.push({scope,name,passed:false,error:error.message})}}
(async()=>{
let converted=0,bashCalls=0;
const result=load('result',{'../deps.js':{modelMessageContentToText:content=>{converted++;return 'synthetic model text'}},'../../tool/handlers/bash-model-content.js':{isBashOutputProviderError:()=>{bashCalls++;return true}}});
await probe('result','Explicit model content retains identity/precedence; stringify failures propagate',async()=>{
 const blocks=[{type:'text',text:'synthetic model'}],tool={success:false,modelContent:blocks,get error(){throw Error('unexpected error content')},get output(){throw Error('unexpected raw output')}};
 assert.equal(result.modelContentForToolResult(tool),blocks);assert.equal(result.stringifyToolResultOutput(tool),'synthetic model text');assert.equal(converted,1);
 const cycle={};cycle.self=cycle;assert.throws(()=>result.stringifyToolResultOutput({success:true,output:cycle}));assert.equal(result.stringifyForEstimation(cycle),'[object Object]');
 const input={synthetic:true};assert.equal(result.toRecordInput(input),input);
});
await probe('result','False explicit error flag wins; Bash classification requires boolean interruption',async()=>{
 assert.equal(result.isErrorForToolResult({success:false,get output(){throw Error('failure gate observed output')}}),true);
 assert.equal(result.isErrorForToolResult({success:true,toolName:'Bash',output:{isError:false,interrupted:true}}),false);assert.equal(bashCalls,0);
 assert.equal(result.isErrorForToolResult({success:true,toolName:'Bash',output:{interrupted:'true'}}),false);assert.equal(bashCalls,0);
 assert.equal(result.isErrorForToolResult({success:true,toolName:'Bash',output:{interrupted:false}}),true);assert.equal(bashCalls,1);
});
let patchCalls=[],patchResult,patchError;
const changes=load('changes',{'diff':{structuredPatch:(...args)=>{patchCalls.push(args);if(patchError)throw patchError;return patchResult}}});
await probe('changes','First before-content and record/Set identity survive repeated writes; summary excludes content',async()=>{
 const map=new Map();changes.recordTurnFileChange(map,{path:'synthetic.txt',beforeContent:'PRIVATE_SYNTHETIC_BEFORE',afterContent:'PRIVATE_SYNTHETIC_AFTER',toolName:'Write',structuredPatch:[{lines:['+x','-y',' context']}]});const entry=map.get('synthetic.txt'),names=entry.toolNames;
 changes.recordTurnFileChange(map,{path:'synthetic.txt',beforeContent:'replacement',afterContent:'',toolName:'Edit',structuredPatch:[{lines:['+z']}]});assert.equal(map.get('synthetic.txt'),entry);assert.equal(entry.toolNames,names);assert.equal(entry.beforeContent,'PRIVATE_SYNTHETIC_BEFORE');assert.equal(entry.afterContent,'');assert.equal(entry.writeCount,2);
 patchResult={hunks:[{lines:['+new','-old']}]};const summary=changes.buildTurnFileChangeSummary(map);assert.equal(summary.additions,1);assert.equal(summary.deletions,1);assert.equal(summary.items[0].writeCount,2);assert.equal(JSON.stringify(summary).includes('PRIVATE_SYNTHETIC'),false);assert.equal(patchCalls[0][6].timeout,5000);assert.equal(patchCalls[0][2],entry.beforeContent);assert.equal(patchCalls[0][3],'');
});
await probe('changes','Undefined after-content uses fallback; timed-out diff yields zero and thrown errors escape',async()=>{
 const map=new Map();changes.recordTurnFileChange(map,{path:'synthetic',beforeContent:null,toolName:'Write',structuredPatch:[{lines:['+x','-y']}]});const before=patchCalls.length;assert.equal(changes.buildTurnFileChangeSummary(map).additions,1);assert.equal(patchCalls.length,before);
 changes.recordTurnFileChange(map,{path:'synthetic',beforeContent:'ignored',afterContent:'synthetic',toolName:'Edit',structuredPatch:[]});patchResult=undefined;assert.equal(changes.buildTurnFileChangeSummary(map).additions,0);
 patchError=new Error('synthetic diff failure');assert.throws(()=>changes.buildTurnFileChangeSummary(map),e=>e===patchError);patchError=undefined;
});
const image=load('image',{'../deps.js':{READ_IMAGE_MAX_BASE64_BYTES:5242880,READ_IMAGE_TARGET_BYTES:3932160},'../types.js':{MAX_IMAGE_ATTACHMENT_DIMENSION:2000}});
await probe('image','Invalid payload avoids processor access and absent processor preserves original data',async()=>{
 const options={get imageProcessorPort(){throw Error('invalid payload observed processor')}};assert.equal(await image.prepareImageDataUrl('data:image/png;base64,','image/png',options),undefined);
 const original='data:image/png;base64,eHg=';const prepared=await image.prepareImageDataUrl(original,'image/png',{traceContext:{}});assert.equal(prepared.dataUrl,original);assert.equal(prepared.mediaType,'image/png');assert.equal(Object.hasOwn(prepared,'metadata'),false);
});
await probe('image','Original processor receiver/caps/trace/signal survive; preparation failure propagates',async()=>{
 const signal={},trace={},error=new Error('synthetic processor failure');let calls=0;
 const imageProcessorPort={async prepareForModel(request,options){assert.equal(this,imageProcessorPort);calls++;assert.equal(request.maxBase64Bytes,5242880);assert.equal(request.maxRawBytes,3932160);assert.equal(request.maxDimension,2000);assert.equal(request.trace,trace);assert.equal(options.signal,signal);assert.equal(request.data.toString(),'xx');throw error}};
 await assert.rejects(image.prepareImageDataUrl('data:image/png;base64,eHg=','image/png',{imageProcessorPort,traceContext:trace,abortSignal:signal}),e=>e===error);assert.equal(calls,1);
});
const reference=load('reference',{'@knorvia/shared':{isArtifactUri:value=>value.startsWith('knorvia-artifact://')},'../deps.js':{basename:value=>value.split('/').at(-1)},'./attachment-artifacts.js':{safeAttachmentOriginalRef:()=> 'inline:data-url'},'./attachment-video.js':{inferVideoMimeFromPath:()=>undefined}});
await probe('reference','Reference projection omits payload while inline text intentionally preserves supplied content',async()=>{
 const attachment={type:'file',content:'data:x,PRIVATE_SYNTHETIC_PAYLOAD'},before=JSON.stringify(attachment),projection=reference.resolvedPathReferenceAttachment(attachment,'synthetic.bin',{reason:'binary_file'});
 assert.equal(projection.contentBlock.text.includes('PRIVATE_SYNTHETIC_PAYLOAD'),false);assert.equal(projection.metadata.originalUrl,'inline:data-url');assert.equal(Object.hasOwn(projection.metadata,'sizeBytes'),true);assert.equal(Object.hasOwn(projection,'source'),true);assert.equal(JSON.stringify(attachment),before);
 const inline=reference.resolvedInlineTextAttachment({type:'file',content:'synthetic text'},0);assert.equal(inline.contentBlock.text,'synthetic text');assert.equal(inline.metadata.preview.text,'synthetic text');assert.equal(Object.hasOwn(inline,'filename'),true);
});
const postcompact=load('postcompact',{'@knorvia/shared':{ESTIMATED_TOKEN_CHAR_DIVISOR:3},'../../agent/message-history.js':{systemReminderAttachmentEntry:(source,content)=>({kind:'attachment',metadata:{source},content})}});
const read=(path,content,sourceTool='Read',time=1)=>({path,content,sourceTool,readAt:new Date(time),isPartialView:false});
await probe('postcompact','Absent state avoids cap/history reads; Write/Git/preserved paths never expose content',async()=>{
 assert.equal(postcompact.buildPostCompactReadStateReminderEntries({get maxFiles(){throw Error('absent state cap read')}}).length,0);
 const map=new Map([['a',read('/synthetic/.git/config','PRIVATE_GIT')],['b',read('/synthetic/write.txt','PRIVATE_WRITE','Write')],['c',read('C:\\synthetic\\kept.txt','PRIVATE_KEPT')],['d',read('/synthetic/read.txt','synthetic visible')]]),entries=[{message:{role:'assistant',toolCalls:[{name:'Read',input:{file_path:'C:/synthetic/kept.txt'}}]}}];
 const output=postcompact.buildPostCompactReadStateReminderEntries({readFileState:map,preservedEntries:entries});assert.equal(output.length,1);assert.equal(output[0].content.includes('synthetic visible'),true);assert.equal(JSON.stringify(output).includes('PRIVATE_'),false);assert.equal(map.size,4);assert.equal(map.get('c').content,'PRIVATE_KEPT');
});
await probe('postcompact','Oversized/reference-only entries do not consume content budget or re-read files',async()=>{
 const map=new Map([['large',read('/synthetic/large','PRIVATE_TOO_LARGE','Read',3)],['small',read('/synthetic/small','abc','Read',2)],['later',read('/synthetic/later','xyz','Read',1)]]);
 const output=postcompact.buildPostCompactReadStateReminderEntries({readFileState:map,maxFileApproxTokens:1,maxTotalApproxTokens:1,maxFiles:3});assert.equal(output.length,3);assert.equal(output[0].content.includes('PRIVATE_TOO_LARGE'),false);assert.equal(output[1].content.includes('1\tabc'),true);assert.equal(output[2].content.includes('xyz'),false);assert.equal(output[2].content.includes('Use Read tool'),true);assert.equal(output[0].metadata.source,'resume_referenced_session_context');
});
const output={kind:'Minimum synthetic validation/identity/privacy/data/error gates only',typescript:ts.version,sourceBindings:bindings,results,passed:results.every(r=>r.passed),ordinaryTestsRun:false,buildsRun:false,projectTypecheckRun:false,lintRun:false,noCanonicalUserData:true,noActualProviderNetworkMemoryStoreFilesystemOsOperation:true,noPredecessorExecution:true,noSourceEmittedMatrix:true};console.log(JSON.stringify(output,null,2));if(!output.passed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1});
