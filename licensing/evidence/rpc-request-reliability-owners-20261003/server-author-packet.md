# Fresh complete ChannelServer owner
Implement whole channelServer.ts to /tmp/knorvia-rpc-server-authored/. Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md plus .agents/skills/architecture-governance/SKILL.md. No source/tests/deps/history/otheroutputs/guidance/repo edits/runtime/network. Report exactread/tools/hash. Fresh Sol high/Fast nofork. Curator freezes whole output before source-exposed review; authorcorrections separatelyfreeze. Sharedfs notOSisolation. No novelty/provenanceclaim.
# Ports and exported API
Relative ./buffer.js VSBuffer; ./foundation.js typeIDisposable,CancellationTokenSource,toDisposable; ./serialization.js BufferReader/BufferWriter,deserialize/serialize; typeIMessagePassingProtocol ./protocol.js; ./channels.shared.js types IChannelServer,IRawResponse,IServerChannel,RequestType,ResponseType.
IMessagePassingProtocol send(VSBuffer):void/onMessage(Event<VSBuffer>). Event<T>(listener) returnsIDisposable. CTS .token:CancellationToken and .cancel():void; toDisposable(fn) callsfn onlyfirstdispose. Token source is retainedport; do not addtoken.isCancellationRequested mutation ordisposects.
IServerChannel<TContext> call<T>(ctx:TContext,command:string,arg?:any,cancellationToken?:CancellationToken):Promise<T>;listen<T>(ctx,event,arg?):Event<T>. IChannelServer registerChannel,readyoptional.
Export classChannelServer<TContext=string> implementsIChannelServer<TContext>,IDisposable. Constructor(protocol,ctx,timeoutDelay=1000,deferInit=false); ready():void; registerChannel(name:string,channel):void;dispose():void. Preservegenericctxreference exactly.
Kinds Request Promise100,PromiseCancel101,EventListen102,EventDispose103; ResponseInitialize200,PromiseSuccess201,PromiseError202,PromiseErrorObj203,EventFire204.
# State/init/wire
Ownedchannels Map<string,IServerChannel>,activeRequests Map<number,IDisposable>,pendingRequests Map<string,Array<{request:any,timer:ReturnType<typeof setTimeout>}>>,protocolListener. Constructor subscribesprotocol.onMessage THEN if!deferInit sendsInitialize. ready alwayssendsInitialize, no once/deadguard.
register sets/replaceschannel then setTimeout(()=>flushPendingRequests(name),0) (asynczero timer, no synchronousflush orpromisechain); don'town/cancelthesezerotimersnewly.
sendResponse switchInitialize=>send([type]); allotherknown=>send([type,id],data). send(header:any,body:any=undefined):newwriter,serializeheader thenbody, onlyprotocol.send(writer.buffer) inALLcatchswallow; encodingerrorsoutsidecatch. No wireformatreplacement.
onRaw: readerdeserializesheader thenbody; Promise=>request{type,id:header[1],channelName:header[2],name:header[3],arg:body} tocall; EventListen similarly; Cancel/EventDispose=>disposeActive(header[1]);unknownignore. No validation/newauthorization, trustedupstreamtransport.
# Promise ownership
onPromise lookupregisteredchannel; absentcollectpending andreturn, do NOTdispatchotherchannel/default. Present: newCTS; try channel.call(this.ctx,name,arg,cts.token) assigning returnedpromise; catchsyncthrow =>Promise.reject(original). No Promise.resolve wrapper fornonpromiseat-runtime, .then errors remainexisting.
Create toDisposable(()=>cts.cancel()),activeMap.set(request.id,disposable) AFTERcallreturned. Then promise.then(success,error).finally cleanup:
success sendResponse{ id:request.id,data,typePromiseSuccess }.
Errorinstance: payloadinitialordered keys message:error.message,name:error.name,stack:error.stack?error.stack.split('\n'):undefined; ordered passthrough code,kind,status,retryAfterMs,data,detail,details,taskId,traceId; foreachreaderror[key],if!==undefinedassignpayload; sendResponsePromiseError andreturn.
NonError sendResponsePromiseErrorObj withEXACTerrorpayload. No generalStringmessage, cause, copyingotherkeys, severity/redaction or gatingcancelledresponse.
Finallydisposable.dispose() FIRST thenactiveMap.delete(request.id). No cts.dispose. Chainnotawaited/returned/caught; errorsfromserialization/cleanup canbe unhandled, preserve. Cancellationofactivecall doesn'tpreventlatercompletionresponse; duplicateids replacewithoutdisposingold andoldfinallycandeletecurrentresource. No fixes.
# Events / cancellation
onEventlookupregistered, absentcollectpendingreturn. Present channel.listen(ctx,name,arg)(callback=>sendResponseEventFireiddata), thenactiveMap.set(id,returneddisposable). No trycatch forlisten/callbacksync exceptions. Synchronous eventdeliveryduringlisten canprecedeMap.set. disposeActive lookup; ifnone return (unknownqueuedrequest cancellation notremoved). Elsedelegateddispose THENactiveMap.delete; throws interruptdelete.
# Pending queue / timeout
collectPending(request:any): currentarray=Map.get(channelName)??[]; ifarray.length===0 setmapkeyarray. Create setTimeout(callback,timeoutDelay):
console.error single 'Unknown channel: {request.channelName}' FIRST regardlesskind.
Ifrequest.type!==Promise return. Else sendResponsePromiseError{id,data:{name:'Unknown channel',message:"Channel name '{request.channelName}' timed out after {this.timeoutDelay}ms",stack:undefined}}. Stored requestpropertyreads remain atcallbacktime, no earlysnapshot/expirydeletion.
Push{request,timer}. Timeout doesn'tremovequeuedentry: registrationlatercanstill dispatchandproduce success afterunknownerror; eventtimeout onlylogs. No cancellation/disposalpurgepolicyadded.
flush(name) getarray;ifnone return; foreach livearrayinorder clearTimeout(timer) THENswitchPromise=>onPromise/EventListen=>onEventListen; finallyMap.delete(name). Lookupchanneloccursforeach viahandlers; no clonedqueue/reentrancyguard/trycatch. Unknownmodeentriesignoredaftertimerremoved.
# Dispose / frozen limits
Dispose protocolListener?.dispose();setnull; foreachactiveMap.values dispose,clearactive. No disposedflag/channelclear/pendingtimerclear/zerotimer cleanup/newqueuecancel. Repeateddispose no protocolsecondcall butactive resources added later stilldisposed. Listener/resource errors syncpropagate/noaggregate. This is sourcecompatibility, no securityhardening. Existingtransportcallerowns authorization; registeredchannel dispatch boundary retained.
# Validation limits
Curator canrun one narrowly injectedregistered-vs-unknown channel dispatch/context/id/cancel test ifboundaryreviewwarrants; no realtransport/userdata/timerwait. Encoding viaretainedports; ordinarytests/build/semantictypes deferred. Fixednumericconstants/errorstrings/typesretained, no licenceclaim.
