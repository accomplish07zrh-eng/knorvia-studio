// Candidate-only minimum synthetic boundary review. No real dependency execution/data/I/O.
const fs = require('fs'), assert = require('assert/strict'), vm = require('vm'), crypto = require('crypto');
const ts = require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet = 'docs/evidence/core-hydration-owner-packet-20261003';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const mediaScope = process.argv[2] || 'media', historyScope = process.argv[3] || 'history';
const mediaOnly = process.argv.includes('--media-only');
const sources = { media: packet + '/' + mediaScope + '/file-part-hydration.ts.txt', history: packet + '/' + historyScope + '/session-history-hydrator.ts.txt' };
const bindings = Object.fromEntries(Object.entries(sources).filter(([s]) => !mediaOnly || s === 'media').map(([s,p]) => { const b = fs.readFileSync(p); return [s, { path:p, bytes:b.length, sha256:hash(b) }]; }));
function load(file, ports) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName:file, compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } });
  const module = { exports:{} };
  vm.runInNewContext(out.outputText, { module, exports:module.exports, require:n => { if (!(n in ports)) throw Error('Unbound import ' + n); return ports[n]; } }, { filename:file });
  return module.exports;
}
const plain = x => JSON.parse(JSON.stringify(x));
const groups = [];
async function group(name, fn) { if(mediaOnly && !name.startsWith('media ') && !name.startsWith('persisted media ')) return; try { await fn(); groups.push({ name, passed:true }); } catch(e) { groups.push({ name, passed:false, error:e.stack }); } }
const media = load(sources.media, { '@knorvia/shared': { isArtifactUri:x => typeof x === 'string' && x.startsWith('artifact://') } });
function file(id, extra = {}) { return { id, type:'file', sessionID:'synthetic', messageID:'synthetic', mime:'image/*', url:'artifact://saved', filename:'fixture', ...extra }; }
function historyPorts() {
  const events = [], mediaCalls = [], options = { selected:undefined, compacted:undefined, tools:undefined, usage:false, presentation:undefined };
  const known = new Set(['task_status','queued_system_notification','todo_reminder','target_continuation','rewind_notice','prompt_attachment','tool_result_warning','incoming_message']);
  const runtime = source => ({ source });
  const append = { addEntries(entries) { assert.equal(this, append); events.push(['entries', entries]); }, addAttachment(source,text) { assert.equal(this,append); events.push(['attachment',source,text]); }, addAssistant(...args) { assert.equal(this,append); events.push(['assistant',...args]); }, addToolResult(...args) { assert.equal(this,append); events.push(['tool',...args]); } };
  const ports = {
    '@knorvia/contracts': {
      modelMessageContentToText:c => { events.push(['contentText']); return typeof c === 'string' ? c : c.map(b => b.text ?? '[media]').join(''); },
      selectActiveConversationBranch:(messages,o) => { events.push(['branch',messages,o]); return options.selected ?? messages; },
    },
    './runtime-input-presentation.js': { runtimeInputMetadata:x => { events.push(['presentation',x]); return x === 'steer' ? { source:'real_user', inputPresentation:'user_steer' } : x === 'guide' ? { source:'legacy_synthetic',inputPresentation:'guide' } : undefined; } },
    '../system-reminder/source.js': {
      getSystemReminderDescriptor:s => ({ source:s,isMeta:true,providerVisibility:'provider_visible',channel:s === 'tool_result_warning' ? 'tool_result' : 'history_continuity' }),
      wrapSystemReminderForSource:(s,t) => { events.push(['wrap',s,t]); return '<system-reminder source="'+s+'">'+t+'</system-reminder>'; },
    },
    '../system-reminder/prompt-attachment.js': { buildPromptAttachmentReminderBodies:x => { events.push(['promptBodies',x]); return ['attached:'+x.kind+':'+x.content,'authority']; } },
    './message-history-usage.js': { persistedTokenUsageBaseline:t => { events.push(['usage',t]); return options.usage; } },
    './message-history.js': {
      isKnownSystemReminderSource:s => known.has(s), legacySyntheticRuntimeMetadata:() => runtime('legacy_synthetic'), realUserRuntimeMetadata:() => runtime('real_user'),
      systemReminderAttachmentEntry:(s,c) => ({ kind:'attachment',content:c,metadata:runtime(s) }),
      systemReminderRuntimeMetadata:runtime, todoReminderRuntimeMetadata:() => runtime('todo_reminder'),
    },
    './compact-session.js': {
      compactActiveSessionMessages:(messages,index,preserve) => { events.push(['compact',messages,index,preserve]); return options.compacted ?? messages.slice(index); },
      isActiveCompactionBoundaryPart:p => p.type === 'compact' && p.active !== false,
    },
    './file-part-hydration.js': {
      filePartToContentBlock:async(p,a) => { mediaCalls.push([p,a]); if (p.fail) throw p.fail; return p.block ?? {type:'text',text:p.metadata?.preview?.text ?? 'fallback'}; },
      projectPersistedToolMediaContent:(layout,blocks) => { events.push(['layout',layout,blocks]); return layout === 'valid' ? [blocks[1],{type:'text',text:'between'},blocks[0]] : undefined; },
    },
    './tool-part-order.js': { selectToolPartsForHistory:parts => { events.push(['toolOrder',parts]); return options.tools ?? parts; } },
  };
  return { events,mediaCalls,options,append,owner:load(sources.history,ports) };
}
const text = (id,value,extra={}) => ({id,type:'text',text:value,...extra});
const message = (id,role,parts,info={}) => ({ info:{id,role,...info},parts });
const tool = (id,status,extra={}) => ({ id,type:'tool',callID:id+'-call',tool:'Read',state:{status,input:{id},output:'legacy',error:'display',...extra.state},...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='state')) });
(async () => {
  await group('media identity, read recovery and immutable write boundary', async () => {
    const p = file('image',{source:{type:'file',path:'/synthetic/old.png',text:{value:'old'}},metadata:{artifactUri:'artifact://durable',sizeBytes:4,sha256:'fixture'}});
    const before = JSON.stringify(p), calls = [];
    const store = { async readToolResultArtifact(...args) { assert.equal(this,store); calls.push(args); return {content:'data:IMAGE/WEBP;base64,YQ=='}; }, writeToolResultArtifact(){throw Error('forbidden write');}, readToolResultBinaryArtifact(){throw Error('forbidden binary');}, primeImageAttachmentPath(){throw Error('forbidden prime');} };
    const b = await media.filePartToContentBlock(p,store);
    assert.deepEqual(plain(b),{type:'image',mediaType:'image/webp',dataUrl:'data:IMAGE/WEBP;base64,YQ==',source:{id:'image',kind:'inline',uri:'artifact://durable',mimeType:'image/*',sizeBytes:4,sha256:'fixture',placeholder:'old'}});
    assert.deepEqual(Object.keys(b.source),['id','kind','uri','path','mimeType','sizeBytes','sha256','placeholder']); assert.equal(b.source.path,undefined);
    assert.equal(JSON.stringify(p),before); assert.deepEqual(plain(calls),[[{uri:'artifact://durable'}]]);
    await media.filePartToContentBlock({...p,url:'data:image/png,a'},store); assert.equal(calls.length,1);
    const badStore={readToolResultArtifact:async()=>{throw Error('synthetic unavailable');}};
    assert.deepEqual(plain(await media.filePartToContentBlock(file('x',{mime:'text/plain',metadata:{preview:{text:''}}}),badStore)),{type:'text',text:''});
    const unsupported=await media.filePartToContentBlock(file('audio',{mime:'audio/wav',url:'data:audio/wav,a'}),store); assert.equal(unsupported.type,'text');
    const pdf=await media.filePartToContentBlock(file('pdf',{mime:' Application/PDF ; charset=x',url:'data:application/pdf,a'}),store); assert.equal(pdf.type,'file'); assert.equal(pdf.mediaType,'application/pdf'); assert.equal(pdf.name,'fixture');
    const emptyOverride=await media.filePartToContentBlock(file('empty',{mime:'text/plain',metadata:{artifactUri:'',storageKind:'local_ref',originalUrl:'original'},source:{type:'file',path:'/synthetic/path',text:{value:''}}}),store); assert.equal(emptyOverride.text,'[Attached text/plain: ]'); assert.equal(calls.length,1);
    const mutable=file('snapshot',{mime:'image/png',source:{type:'file',path:'/synthetic/before',text:{value:'before'}}});
    const snapshot=await media.filePartToContentBlock(mutable,{readToolResultArtifact:async()=>{mutable.id='after';mutable.source.text.value='after';return{content:'data:image/png,a'};}});
    assert.equal(snapshot.source.id,'snapshot'); assert.equal(snapshot.source.placeholder,'before');
  });
  await group('persisted media layout ordering, object identity and all-or-nothing rejection', async () => {
    const a={type:'image',mediaType:'image/png',dataUrl:'data:image/png,a'},b={type:'video',mediaType:'video/mp4',dataUrl:'data:video/mp4,b'};
    const blocks=[a,b], layout=[{type:'attachment',attachmentIndex:1},{type:'text',text:''},{type:'attachment',attachmentIndex:0},{type:'attachment',attachmentIndex:1}];
    const before=JSON.stringify({blocks,layout}), projected=media.projectPersistedToolMediaContent(layout,blocks);
    assert.equal(projected[0],b); assert.equal(projected[2],a); assert.equal(projected[3],b); assert.notEqual(projected[1],layout[1]); assert.equal(projected[1].text,'');
    for(const invalid of [[],{},null,[[]],[{type:'attachment',attachmentIndex:0.5}],[{type:'attachment',attachmentIndex:-1}],[{type:'attachment',attachmentIndex:9}],[{type:'text',text:4}], [...layout,{type:'invalid'}]]) assert.equal(media.projectPersistedToolMediaContent(invalid,blocks),undefined);
    assert.equal(media.projectPersistedToolMediaContent([{type:'attachment',attachmentIndex:-0}],blocks)[0],a);
    assert.equal(media.projectPersistedToolMediaContent([{type:'text',text:'alone'}],[])[0].text,'alone'); assert.equal(JSON.stringify({blocks,layout}),before);
    let attachmentReads=0;const guarded=[];Object.defineProperty(guarded,0,{get(){attachmentReads++;throw Error('attachment accessed before complete layout validation');}});
    assert.equal(media.projectPersistedToolMediaContent([{type:'attachment',attachmentIndex:0},{type:'invalid'}],guarded),undefined);assert.equal(attachmentReads,0);
  });
  await group('history branch versus compaction ordering and legacy kept-ID boundary', async () => {
    const h=historyPorts(), a=message('a','user',[text('a','a')]),c=message('c','user',[{id:'c',type:'compact'}]),z=message('z','user',[text('z','z')]), all=[a,c,z];
    const opts={branchCutAfterMessageId:'cut',rewindTargetMessageId:'a',includeCompactPreservedSegment:false}; h.options.selected=[c,z];h.options.compacted=[z];
    assert.equal(h.owner.activeSessionMessages(all,opts),h.options.compacted); assert.deepEqual(h.events.map(x=>x[0]),['branch','compact']);assert.equal(h.events[0][1],all);assert.equal(h.events[0][2],opts);assert.equal(h.events[1][2],0);assert.equal(h.events[1][3],false);
    h.events.length=0;h.options.selected=undefined;h.options.compacted=[c,z];
    const legacy={rewindKeptMessageIds:['a']};assert.equal(h.owner.activeSessionMessages(all,legacy),h.options.compacted);assert.deepEqual(h.events.map(x=>x[0]),['compact']);
    h.events.length=0;const matching={rewindKeptMessageIds:['z']};h.owner.activeSessionMessages(all,matching);assert.deepEqual(h.events.map(x=>x[0]),['compact','branch']);assert.equal(h.events[1][2],matching);
    h.events.length=0;h.owner.activeSessionMessages(all,{rewindKeptMessageIds:[]});assert.deepEqual(h.events.map(x=>x[0]),['compact']);
  });
  await group('shared-context privacy, user ordering and empty attachment anchor without writes', async () => {
    const h=historyPorts(), artifact={synthetic:true}, pending=message('pending','user',[file('pending')],{source:'shared_context',metadata:{sharedContextStatus:'reserved'}});
    const image=file('image',{block:{type:'image',mediaType:'image/png',dataUrl:'data:image/png,a',source:{id:'immutable'}}});const pdf=file('pdf',{block:{type:'file',mediaType:'application/pdf',dataUrl:'data:application/pdf,a'}});
    const duplicate=text('same','old'),last=text('same','last'),agent={id:'agent',type:'agent',name:'helper'};
    const user=message('u','user',[duplicate,image,pdf,agent,last],{metadata:{inputPresentation:'guide'}});
    const attachment=message('attachment','user',[file('text',{mime:'text/plain',metadata:{preview:{text:''}}})]);
    const all=[pending,user,attachment],before=JSON.stringify(all),result=await h.owner.hydrateMessageHistoryFromSession({history:h.append,messages:all,artifactStore:artifact});
    assert.deepEqual(plain(result),{appliedMessageCount:2,interruptedToolCount:0,messageCount:3,partCount:6}); assert.equal(h.mediaCalls.length,3);assert(!h.mediaCalls.some(x=>x[0].id==='pending'));assert(h.mediaCalls.every(x=>x[1]===artifact));
    const entries=h.events.filter(x=>x[0]==='entries');assert.equal(entries.length,2);const e=entries[0][1][0];
    assert.deepEqual(plain(e.message.content.map(b=>b.type)),['file','text','text','image']);assert.equal(e.message.content[1].text,'last');assert.equal(e.message.content[2].text,'[Selected agent: helper]');assert.notEqual(e.message.content[3],image.block);assert.equal(e.message.content[3].source,image.block.source);assert.equal(e.metadata.source,'legacy_synthetic');
    assert.equal(entries[1][1][0].message.content,'');assert.equal(entries[1][1][0].metadata.source,'real_user');assert.equal(entries[1][1][1].kind,'attachment');assert.equal(entries[1][1][1].metadata.source,'prompt_attachment');
    assert.equal(JSON.stringify(all),before);const branch=h.events.find(x=>x[0]==='branch');assert.deepEqual(Object.keys(branch[2]),['branchCutAfterMessageId','rewindCreatedMessageId','rewindKeptMessageIds','rewindTargetMessageId']);
  });
  await group('raw synthetic attachment source and provider wrapping/metadata precedence', async () => {
    const h=historyPorts();const raw=message('raw','user',[text('raw','raw notice',{synthetic:true,metadata:{source:'task_status'}})]);
    const mixed=message('mixed','user',[text('task','status',{synthetic:true,metadata:{source:'subagent_message',runtimeMessage:{source:'task_status'}}}),text('real','user')]);
    const background=message('background','user',[text('background','done',{synthetic:true,metadata:{source:'background_task',runtimeMessage:{source:'task_status'}}})]);
    const child=message('child','user',[text('child','reply',{synthetic:true,metadata:{source:'subagent_message',runtimeMessage:{source:'queued_system_notification'}}})]);
    const wrapped=message('wrapped','user',[text('wrapped',' <system-reminder>already</system-reminder>',{synthetic:true,metadata:{source:'task_status'}})]);
    await h.owner.hydrateMessageHistoryFromSession({history:h.append,messages:[raw,mixed,background,child,wrapped]});
    assert.deepEqual(h.events.filter(x=>x[0]==='attachment').map(x=>x.slice(1)),[['task_status','raw notice']]);
    const entries=h.events.filter(x=>x[0]==='entries');assert.equal(entries[0][1][0].metadata.source,'real_user');assert.equal(entries[0][1][0].message.content,'<system-reminder source="task_status">status</system-reminder>\n\nuser');
    assert.equal(entries[1][1][0].metadata.source,'legacy_synthetic');assert.equal(entries[1][1][0].message.content,'done');assert.equal(entries[2][1][0].metadata.source,'legacy_synthetic');assert.match(entries[2][1][0].message.content,/queued_system_notification/);assert.equal(entries[3][1][0].message.content,wrapped.parts[0].text);
  });
  await group('assistant usage, selected tool/media ordering, partial failure and immutable session state', async () => {
    const h=historyPorts(),tokens={input:7},reasonMetadata={provider:'fixture'},attach0=file('m0',{block:{type:'image',mediaType:'image/png',dataUrl:'data:image/png,a'}}),attach1=file('m1',{block:{type:'image',mediaType:'image/png',dataUrl:'data:image/png,b'}});
    const completed=tool('c','completed',{metadata:{providerToolName:''},state:{attachments:[attach0,attach1],metadata:{modelContentLayout:'valid'}}});const error=tool('e','error',{state:{metadata:{modelContent:''}}});const interrupted=tool('i','running');
    h.options.tools=[error,completed,interrupted];const m=message('assistant','assistant',[text('t','answer'),{id:'r',type:'reasoning',text:'thought',metadata:reasonMetadata},completed,error,interrupted],{modelId:'m',providerId:'p',tokens});const before=JSON.stringify(m);
    const r=await h.owner.hydrateMessageHistoryFromSession({history:h.append,messages:[m]});assert.equal(r.interruptedToolCount,1);const a=h.events.find(x=>x[0]==='assistant');assert.equal(a.length,6);assert.equal(a[5],tokens);assert.deepEqual(plain(a[2].map(x=>x.id)),['e-call','c-call','i-call']);assert.equal(a[2][1].name,'');assert.equal(a[2][1].input,completed.state.input);assert.notEqual(a[3][0].providerOptions,reasonMetadata);assert.deepEqual(plain(a[4]),{modelId:'m',providerId:'p'});
    const results=h.events.filter(x=>x[0]==='tool');assert.deepEqual(results.map(x=>[x[1],x[2],x[4]]),[['e-call','Read',false],['c-call','',true],['i-call','Read',false]]);assert.equal(results[0][3],'');assert.equal(results[1][3][0],attach1.block);assert.equal(results[1][3][2],attach0.block);assert.equal(results[2][3],'[Tool execution was interrupted before resume]');assert.equal(JSON.stringify(m),before);assert(!h.events.some(x=>x[0]==='usage'));
    const anchor=historyPorts();anchor.options.usage=true;await anchor.owner.hydrateMessageHistoryFromSession({history:anchor.append,messages:[message('anchor','assistant',[],{tokens})]});assert.equal(anchor.events.filter(x=>x[0]==='assistant').length,1);assert.equal(anchor.events.filter(x=>x[0]==='usage').length,1);
    const failing=historyPorts(),failure=Error('synthetic media failure'),bad=message('failure','assistant',[tool('bad','completed',{state:{attachments:[file('bad',{fail:failure})]}})]);
    await assert.rejects(failing.owner.hydrateMessageHistoryFromSession({history:failing.append,messages:[bad]}),e=>e===failure);assert.equal(failing.events.filter(x=>x[0]==='assistant').length,1);assert.equal(failing.events.filter(x=>x[0]==='tool').length,0);
  });
  const passed=groups.every(x=>x.passed);console.log(JSON.stringify({bindings,groups,passed,qualification:'At most six distinct minimum synthetic candidate-only groups; --media-only restricts the initial media boundary review to two. In-memory VM and explicit fake original ports only; isolated transpilation to execute synthetic cases, no semantic/project compilation or source-emitted matrix, real session/media/provider/network/user data, business writes or dependency body execution. Installed exact-byte static binding reuses these checks without repeating them.'},null,2));if(!passed)process.exitCode=1;
})();
