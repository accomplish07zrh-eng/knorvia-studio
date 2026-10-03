// Minimum synthetic write/authority/privacy/error gates. No predecessor execution or ordinary suite.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),path=require('node:path');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet='docs/evidence/core-media-memory-reminder-author-packet-20261003';
const manifest=JSON.parse(fs.readFileSync(packet+'/curator-input-manifest.json'));
const results=[],bindings=[];
function load(scope,depFor){
 const cache=new Map(),entry=manifest.scopes[scope].source;
 const allowed=new Set(JSON.parse(fs.readFileSync(`${packet}/${scope}/curator-draft-manifest.json`)).files.filter(r=>r.target).map(r=>r.target));
 function module(file){
  if(cache.has(file))return cache.get(file);
  assert(allowed.has(file),'Unapproved owner file '+file);
  const b=fs.readFileSync(file);bindings.push({scope,path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});
  const exports={};cache.set(file,exports);
  const js=ts.transpileModule(b.toString(),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,Buffer,Error,DOMException,AbortController,require:id=>{
   const resolved=id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),id.replace(/\.js$/,'.ts'))):id;
   if(allowed.has(resolved))return module(resolved);
   const deps=depFor(file);if(!(id in deps))throw Error('Unapproved opaque dependency '+id);return deps[id];
  }},{filename:file});return exports;
 }
 return module(entry);
}
async function probe(scope,name,run){try{await run();results.push({scope,name,passed:true})}catch(error){results.push({scope,name,passed:false,error:error.message})}}
(async()=>{
let writes=0,parsedPdf,parsedVideo,writeError;
const resource={url:'knorvia-artifact://synthetic/a',metadata:{artifactUri:'knorvia-artifact://synthetic/a',recoverability:'durable',storageKind:'artifact'}};
const mediaDeps={
 '@knorvia/contracts':{VIDEO_INPUT_MAX_BYTES:31457280},
 '../../deps.js':{basename:path.basename,resolvePath:path.resolve,isFileSystemPortError:e=>e?.ported===true},
 '../../types.js':{INLINE_MEDIA_ATTACHMENT_MAX_BYTES:20971520},
 '../attachment-artifacts.js':{persistAttachmentDataUrl:async()=>{writes++;if(writeError)throw writeError;return resource}},
 '../attachment-image.js':{inferImageMimeFromPath:()=> 'image/png',prepareImageDataUrl:async(dataUrl,mediaType)=>({dataUrl,mediaType})},
 '../attachment-pdf.js':{PDF_INPUT_MAX_BYTES:20971520,parseInlinePdfDataUrl:()=>parsedPdf,isPdfBytes:()=>true},
 '../attachment-video.js':{inferVideoMimeFromPath:()=> 'video/mp4',parseInlineVideoDataUrl:()=>parsedVideo},
 '../attachment-placeholder.js':{resolvedPlaceholderAttachment:(attachment,placeholder,errorCode,options)=>({errorCode,placeholder,options})},
 '../attachment-path-reference.js':{resolvedPathReferenceAttachment:(attachment,placeholder,options)=>({placeholder,options})},
};
const resolver=load('resolver',()=>mediaDeps),mediaOptions={workingDirectory:'/synthetic',traceContext:{}};
await probe('resolver','Invalid/oversized inline material never reaches durable write',async()=>{
 parsedPdf=undefined;assert.equal((await resolver.resolveInlineMediaAttachment({type:'pdf',content:'synthetic'},0,undefined,mediaOptions)).errorCode,'attachment_pdf_invalid');
 parsedPdf={sizeBytes:20971521,mediaType:'application/pdf'};assert.equal((await resolver.resolveInlineMediaAttachment({type:'pdf',content:'synthetic'},0,undefined,mediaOptions)).errorCode,'attachment_pdf_invalid');
 parsedVideo={sizeBytes:31457281,mediaType:'video/mp4'};const v=await resolver.resolveInlineMediaAttachment({type:'video',content:'synthetic'},0,undefined,mediaOptions);assert.equal(v.options.reason,'video_too_large');assert.equal(Object.hasOwn(v.options,'source'),false);assert.equal(writes,0);
});
await probe('resolver','Durable failure escapes media catches without success downgrade',async()=>{
 writeError=new Error('synthetic durable failure');await assert.rejects(resolver.resolveInlineMediaAttachment({type:'image',content:'data:image/png,synthetic'},0,'image/png',mediaOptions),e=>e===writeError);writeError=undefined;
});
await probe('resolver','Local caps and typed bounded-read failures preserve no-write gates',async()=>{
 const before=writes;let reads=0;
 const fileSystemPort={async stat(){assert.equal(this,fileSystemPort);return{kind:'file',sizeBytes:31457281}},async readBinaryFile(){reads++;throw Error('unexpected read')}};
 assert.equal((await resolver.resolveLocalMediaAttachment({type:'video',path:'synthetic.mp4'},0,{...mediaOptions,fileSystemPort})).options.reason,'video_too_large');assert.equal(reads,0);
 fileSystemPort.stat=async()=>({kind:'file',sizeBytes:1});fileSystemPort.readBinaryFile=async request=>{assert.equal(request.maxBytes,20971520);throw {ported:true,code:'too_large'}};
 const ref=await resolver.resolveLocalMediaAttachment({type:'pdf',path:'synthetic.pdf'},0,{...mediaOptions,fileSystemPort});assert.equal(ref.options.reason,'pdf_too_large');assert.equal(Object.hasOwn(ref.options,'sizeBytes'),false);assert.equal(writes,before);
});
await probe('resolver','Local durable references retain PDF URI and image/video URI absence',async()=>{
 const fileSystemPort={async stat(){return{kind:'file',sizeBytes:2}},async readBinaryFile(){return{content:Buffer.from('xx'),bytesRead:2,sizeBytes:2}},async readTextFile(request){assert.equal(Object.hasOwn(request,'maxBytes'),false);return{content:'eHg='}}};
 for(const type of ['image','video','pdf']){const r=await resolver.resolveLocalMediaAttachment({type,path:'synthetic.'+type},0,{...mediaOptions,fileSystemPort});assert.equal(r.metadata.artifactUri,resource.url);assert.equal(Object.hasOwn(r.contentBlock.source,'uri'),type==='pdf');}
});
let invocation,headers,executorOptions,providerRequest;
const denied={},permissionConfig={},executor={},wrappedModel={};
const memory=load('memory-agent',()=>({
 '../deps.js':{PermissionService:class{constructor(config){assert.equal(config,permissionConfig)}},createDenyPermissionBroker:()=>denied,defaultPermissionConfig:permissionConfig,createToolExecutor:options=>{executorOptions=options;return executor},traceContextToLogContext:()=>({trace:'synthetic'})},
 '../methods/session-shell-environment.js':{getSessionShellSelectionFromConfig:()=> 'synthetic-shell'},
 '../methods/model-runtime-headers.js':{createRefreshRuntimeHeadersBeforeModelAttempt:(runtime,options)=>{headers=options;return ()=>{}}},
 '../methods/runtime-model.js':{createRuntimeModel:()=>{throw Error('supplied model unexpectedly replaced')},withModelInvocationContext:(base,callback)=>{invocation=callback;return wrappedModel}},
 './runtime-provider-request-messages.js':{buildRuntimeProviderRequestMessages:(runtime,request)=>{providerRequest=request;return{messages:request.entries}}},
}));
const entry={message:{content:'synthetic memory',role:'user'}},value={},tool={name:'synthetic'},trace={};
const memoryRuntime={config:{midConversationSystem:'synthetic-system'},agentTelemetry:{captureCausation:()=> 'synthetic-cause'},messageHistory:{borrowReadOnlyRuntimeEntries:()=>[entry]},readFileState:new Map([['synthetic',value]]),getTools:()=>[tool],workingDirectory:'/synthetic/work',workspaceRoot:'/synthetic/root'};
const context=memory.captureProjectMemoryAgentContext(memoryRuntime,{memoryRoot:'/synthetic/memory',model:{},operation:'project_memory_extract',traceContext:trace});
await probe('memory-agent','Snapshot and invocation preserve transcript privacy and deferred headers',async()=>{
 assert.equal(headers,undefined);assert.equal(context.providerEntries[0],entry);assert.notEqual(context.readFileState,memoryRuntime.readFileState);assert.equal(context.readFileState.get('synthetic'),value);assert.notEqual(context.tools[0],tool);
 const signal={};const options=invocation({abortSignal:signal});assert.equal(options.metadata.skipTranscript,true);assert.equal(headers.abortSignal,signal);assert.equal(headers.model,wrappedModel);
 const messages=memory.buildProjectMemoryAgentProviderMessages(memoryRuntime,context,'synthetic prompt');assert.equal(messages,providerRequest.entries);assert.equal(messages[0],entry);assert.equal(providerRequest.applyCacheControl,true);
});
await probe('memory-agent','Memory execution delegates original deny policy and separate existing roots',async()=>{
 assert.equal(memory.createProjectMemoryAgentToolExecutor(memoryRuntime,context),executor);assert.equal(executorOptions.permissionBroker,denied);assert.equal(executorOptions.getMemoryRoot(),'/synthetic/memory');assert.equal(executorOptions.getWorkingDirectory(),'/synthetic/work');assert.equal(executorOptions.getWorkspaceRoot(),'/synthetic/root');assert.notEqual(executorOptions.readFileState,context.readFileState);assert.equal(executorOptions.readFileState.get('synthetic'),value);
});
let snapshots=[],scheduledExecute,scanOptions,loopOptions,finish=[],scanError;
const extractionContext={...context},telemetry={run:callback=>callback(),finishCancelled:reason=>finish.push(reason),finishCompleted:()=>finish.push('completed'),finishFailed:(phase,type,error)=>finish.push(error)};
const extraction=load('extraction',()=>({
 '../deps.js':{selectActiveConversationBranch:messages=>messages},
 '../../memory/extraction.js':{buildMemoryExtractionPrompt:()=> 'synthetic prompt',createMemoryExtractionScheduler:callback=>{scheduledExecute=callback;return{schedule(snapshot){snapshots.push(snapshot)},drain:async()=>{}}}},
 '../../memory/memory-agent-loop.js':{runMemoryAgentLoop:async options=>{loopOptions=options}},
 '../../memory/recall/index.js':{scanMemoryManifest:async options=>{scanOptions=options;if(scanError)throw scanError;return []}},
 './project-memory-agent.js':{captureProjectMemoryAgentContext:()=>extractionContext,buildProjectMemoryAgentProviderMessages:()=>[],createProjectMemoryAgentToolExecutor:()=>({execute:()=>{}})},
 './project-memory.js':{resolveEnabledProjectMemoryRoot:()=> '/synthetic/memory'},
}));
const scheduleRuntime={...memoryRuntime,fileSystemPort:{},agentTelemetry:{detached:()=>telemetry},sessionId:'synthetic-session',latestConversationMessageId:'boundary',isRemoteWorkspace:()=>false,sessionStore:{messages:async()=>[{info:{id:'early'}},{info:{id:'boundary'}},{info:{id:'late'}}],getSession:async()=>({})}};
await probe('extraction','Disabled/remote extraction avoids store reads; captured boundary excludes later data',async()=>{
 const blocked={config:{memory:{extractionEnabled:false}},get workspaceRoot(){throw Error('disabled gate leaked')},get sessionStore(){throw Error('disabled store read')}};extraction.scheduleProjectMemoryExtraction(blocked,{model:{},traceContext:trace});
 const remote={...scheduleRuntime,isRemoteWorkspace:()=>true,get sessionStore(){throw Error('remote store read')}};extraction.scheduleProjectMemoryExtraction(remote,{model:{},traceContext:trace});assert.equal(snapshots.length,0);
 extraction.scheduleProjectMemoryExtraction(scheduleRuntime,{model:{},traceContext:trace});scheduleRuntime.latestConversationMessageId='late';const snapshot=await snapshots[0];assert.deepEqual(Array.from(snapshot.durableMessages,m=>m.info.id),['early','boundary']);
});
await probe('extraction','Missing captured boundary rejects and fake loop retains write-root/abort/error ownership',async()=>{
 scheduleRuntime.latestConversationMessageId='absent';extraction.scheduleProjectMemoryExtraction(scheduleRuntime,{model:{},traceContext:trace});await assert.rejects(snapshots[1],/Extraction boundary is missing/);
 const signal={aborted:false};assert.equal(await scheduledExecute({abortSignal:signal,messageCount:2,snapshot:extractionContext}),'success');assert.equal(scanOptions.rootDir,'/synthetic/memory');assert.equal(loopOptions.rootDir,'/synthetic/memory');assert.equal(loopOptions.workspaceRoot,'/synthetic/root');assert.equal(loopOptions.maxTurns,5);
 scanError=new Error('synthetic failure');scanError.name='AbortError';assert.equal(await scheduledExecute({abortSignal:signal,messageCount:2,snapshot:extractionContext}),'error');assert.equal(finish.at(-1),scanError);
 scanError=undefined;assert.equal(await scheduledExecute({abortSignal:{aborted:true},messageCount:2,snapshot:extractionContext}),'aborted');assert.equal(finish.at(-1),'abort_signal');
});
const reminder=load('reminders',()=>({'../../agent/message-history.js':{legacySyntheticRuntimeMetadata:()=>({}),systemReminderRuntimeMetadata:()=>({}),todoReminderRuntimeMetadata:()=>({}),isRuntimeAttachmentEntry:()=>false},'@knorvia/contracts':{ASK_USER_QUESTION_TOOL_NAME:'AskUserQuestion',EXIT_PLAN_MODE_TOOL_NAME:'ExitPlanMode'},'../../subagent/explore.js':{EXPLORE_AGENT_TYPE:'Explore'}}));
await probe('reminders','Disabled mode avoids history reads and output style omits private prompt',async()=>{
 assert.equal(reminder.buildRuntimeModeReminderBody(new Proxy([],{get(){throw Error('disabled history read')}}),'plan',false),null);const output=reminder.buildRuntimeOutputStyleReminderBody({name:'Synthetic',prompt:'PRIVATE_SYNTHETIC_GUIDELINES'});assert.equal(output.includes('PRIVATE_SYNTHETIC_GUIDELINES'),false);assert.equal(reminder.buildRuntimeOutputStyleReminderBody({name:'Synthetic',prompt:' \n '}),null);
});
const types={UnknownError:'unknown',TurnCancelled:'cancelled',ModelContextExceeded:'context',ModelError:'model'},eventTypes={TurnComplete:'complete',TurnError:'error'};
const errors=load('turn-errors',()=>({'../deps.js':{CoreErrorType:types,SessionEventType:eventTypes,createCoreError:(type,message,options)=>Object.assign(new Error(message),{core:true,type,...options}),isCoreError:error=>error?.core===true,createModelUsageSummaryFromEvents:()=>({synthetic:true}),traceContextToLogContext:()=>({})},'../../errors/error-payload.js':{ErrorPayloadRole:{Wrapper:'wrapper'},withErrorPayloadRole:()=>({role:'wrapper'}),projectExecutionErrorPayload:()=>({message:'synthetic'})},'./model-errors.js':{isModelContextExceededError:()=>false}}));
await probe('turn-errors','External faults override cancellation while ordinary abort and bounded cause traversal remain',async()=>{
 const fault=errors.createExternalTurnFaultError('synthetic-fault');const signal={aborted:true,reason:fault};assert.equal(errors.isTurnCancellationError(new Error('synthetic'),signal),false);const result=errors.createTurnFailureError(new Error('synthetic'),signal,'fallback');assert.equal(result.type,types.UnknownError);assert.equal(result.cause,fault);assert.equal(Object.hasOwn(result,'retryable'),false);
 assert.equal(errors.createTurnFailureError(new Error('synthetic'),{aborted:true},'fallback').type,types.TurnCancelled);let cause={name:'AbortError'};for(let i=0;i<6;i++)cause={cause};assert.equal(errors.isTurnCancellationError(cause),true);assert.equal(errors.isTurnCancellationError({cause}),false);const cycle={};cycle.cause=cycle;assert.equal(errors.isTurnCancellationError(cycle),false);
});
await probe('turn-errors','Append failure prevents local event/log mutation; cancelled outcome preserves queue flags',async()=>{
 const coreError=errors.createTurnCancelledError(undefined),events=[];let logs=0,created;
 const runtime={createEvent(type,payload){created={type,payload};return created},async appendEvent(){throw Error('synthetic append failure')},logger:{error(){logs++}}};const params={coreError,events,durationMs:1,turnPhase:'synthetic',traceContext:trace,fallbackMessage:'fallback',logEvent:'synthetic',logLabel:'synthetic',preserveQueueAutoDrainOnCancel:true};await assert.rejects(errors.appendTurnOutcomeEvent(runtime,params),/synthetic append failure/);assert.equal(events.length,0);assert.equal(logs,0);runtime.appendEvent=async event=>assert.equal(event,created);await errors.appendTurnOutcomeEvent(runtime,params);assert.equal(events[0],created);assert.equal(created.type,eventTypes.TurnComplete);assert.equal(created.payload.resultType,'cancelled');assert.equal(created.payload.preserveQueueAutoDrainOnCancel,true);assert.equal(logs,1);
});
const output={kind:'Minimum synthetic write/authority/privacy/error gates only',typescript:ts.version,sourceBindings:bindings,results,passed:results.every(r=>r.passed),ordinaryTestsRun:false,buildsRun:false,projectTypecheckRun:false,lintRun:false,noCanonicalDataUsed:true,noActualProviderNetworkStoreFilesystemOsOperation:true,noPredecessorExecution:true,noSourceEmittedMatrix:true};console.log(JSON.stringify(output,null,2));if(!output.passed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1});
