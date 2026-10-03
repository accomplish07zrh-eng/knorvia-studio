# Whole fresh author boundary and output

This is a newly root-allocated complete host/index.ts replacement candidate. Author model requested GPT6.1 Sol/high, saved Fast inherited/unverified. Read ONLY the full index-author-packet.md and /workspace/knorvia-studio/AGENTS.md plus .agents/skills/architecture-governance/SKILL.md. No inherited source, prior drafts/tests/dependency bodies/git/config/environment/other authors/status/network. Curator inspected selected inherited body and derived PUBLIC behavior/ports. No predecessor private helper/state/topology/decomposition/body supplied; choose private structure freely, no forced novelty. Static signatures/imports/string vocabulary are constrained contract data with zero new credit.

Write ONE complete TypeScript module to /tmp/knorvia-host-index-author.ts using ONE literal heredoc (no old-file transforms), then SHA computation ONLY without reopening. No execution/format/compile/tests/install/repository edits/native or network operations. Corrections require a new complete packet/new whole literal file, no previous file reads/transforms. Own authoring memory may persist, not claimed as fresh isolation for each revision. Shared filesystem instructions are not OS clean-room certification. Ask curator for missing public facts before guessing. Chunk-read packet until complete; do not proceed on truncation.

Scope exclusively packages/desktop/src/host/index.ts; do NOT modify accepted startup/controller/attachment/remote registry/media/realtime/etc dependencies, Studio schedule files, main/UI, manifests/licensing/policy. A single cohesive module with freely chosen private helpers is sufficient; no new public exports required. It is an automatically evaluated process entry, with NO public named exports. Preserve all externally observable side effects and public callback/error/data/receiver/event order below; no cleanup/guard policy improvements.

## Public load/ports and diagnostics

- All imports listed later are existing ports; preserve their import identities/public entry paths. @knorvia/server/remote is TYPE-ONLY at module load and runtime-dynamically imported only when actually establishing a remote connection. Do not make local startup load remote backend dependency.
- Capture process.parentPort at evaluation. Set process.title using formatKnorviaHostProcessName(process.env["KNORVIA_PROCESS_LABEL"]). Module later calls captured parentPort.on("message", async handler) unconditionally; do not add an absent-parent graceful startup guard. Other described posts guard presence where stated. Synthetic validation supplies fake process/parent/console and ALL imports; no real process IPC.
- Host media limiter is process-wide, maximum4; acquire returns false unchanged count at >=4 else increments true; release Math.max(0,count−1); state fresh {active,limit:4}. Remote-media preview enabled unless captured process.env["KNORVIA_REMOTE_MEDIA_RANGE_PREVIEW_ENABLED"] exactly "0"; evaluate once at load.
- Capture bound original console.log/warn/error. logger.info/warn/error choose matching originals and add formatLogPrefix("knorvia-host",process.pid), then best-effort HostResponseTypes.Log {level,source:"host",message:args.map(stringifyHostLogArg).join(" ")} including prefix. Parent post/stringify errors suppressed for this log. Progress owner createRemoteConnectionProgressContext({emit}) posts RemoteWorkspaceConnectionLog {requestId,level,message:formatted args} best-effort, no prefix.
- Replace console methods on supplied console object. Each maps arguments through redactDiagnosticValue, calls captured original with safe args, and reports host log plus progress.report(level,safe). console.error always writes original; if !shouldReportHostConsoleError(safe), returns without host/progress error. process.on warning logs warn with name+": "+message.
- Instantiate AutomationRepo at load. registerHostNetworkTelemetry(parentPort). Start host self telemetry with {logger,collectCounters:collectServiceMemoryDiagnostics,postMessage:parentPort? callback :undefined}. RPC debug logger createServiceLogger("rpc"); RPC logger resolveRpcLogLevel(message,...args), debug calls debug(undefined,message,...args), other levels logger[level]. Dynamic log prefixes/message vocabulary later are retained contract literals, no independence credit.
- Local-media authority callback supplied local services returns rejecting Promise Error("parentPort unavailable") absent parent. Generate UUID, associate request handlers before post LocalMediaPreviewPathAuthorizeRequest {requestId,path}. Synchronous post error removes association and rejects SAME Error, or wraps non-Error new Error(String(error)). Result message consumes matching request once BEFORE settle; msg.ok&&msg.path logs OK and resolves path, else Error(msg.error??"本地视频预览路径授权失败"). Unknown IDs ignored. No timeout/cleanup improvements.
- Resource usage responder created once with getAgentService from CURRENT local collection optional Agent service and postMessage optional captured parent; requests/cancel delegate existing responder.

## Startup authority and dependency setup

- One retained database startup owner per entry. Initial local services/network transport/realtime and local resource telemetry absent. Accepted dependency owns database execution; host merely creates once and handles callbacks. Local queued attachment IDs map to callbacks, replace by ID, insertion order; no second startup executor.
- InitLocal uses transferred e.ports[0]. Global dispatch already returns for messages with no port before reaching InitLocal (so no extra missing-port log). If startup owner exists, close new port then coordinator.publish, return. Otherwise subscribe base port.once("close") to record base closed before service initialization.
- createHostDatabaseStartup options: startupId msg.databaseStartupId; cwd msg.agentSpawnFallbackCwd??process.cwd(); workingDirectories msg.agentWarmupTargets?.map(workspacePath) ?? (truthy msg.workspacePath?[path]:[]); env msg.runtimeProcessEnvPatch. publish posts DatabaseStartupState {state}; for ready, iterate queued attachment callbacks, catch/log EACH failure and continue, then clear queue. onFailure logs local database failure using CURRENT coordinator snapshot attemptId.
- initializeServices callback first logs local init; set active realtime=createTaskRealtimeBridgeForHostInit(msg,parentPort). createSettingServiceWithMigrations() yields {service:settingService}; createHostApiNetworkTransport(async settings supplier) reads settingService.get and returns {httpProxy:settings.httpProxy,noProxy:settings.httpProxyNoProxy,caCertPath:settings.httpProxyCaCertPath}.
- Await initializeHostApiNetworkTransportOwner({transport,log:warn callback,establishOwner: synchronous callback}). In establishOwner call createLocalServices with EXACT options: parentPort,settingService,hostApiNetworkTransport,authorizeLocalMediaPreviewPath,runtimeProcessEnvPatch msg,agentRuntimeContext {getDeviceMid:()=>msg.deviceMid,runtimeSurface:"desktop_local_host"},serviceAuthorityMode:"desktop-local",remoteStudioEnvironments supplier below,agentSpawnFallbackCwd,knorviaBuiltinProviderConfigFilePath,processLifecycleReporter,taskRuntimeReporter,forwardSessionMessageSendRequested posts SessionMessageSendRequested {request},onAutomationManualRunRequested dispatch described later,browserControlExecutor created browser bridge,cuaOperationStateReporter only if process.platform==="win32" else undefined.
- Assign local services before finding optional StudioRuntimeService. If Studio exists, dispose prior StudioScheduleOutcomeObserver if any, construct new (studio,AutomationRepo,logger.warn callback), void recover(). Assign active network transport after observer setup, return initialized services. No different authority/grant/provider policy.
- remoteStudioEnvironments supplier queries registry.listSessions and yields ONLY SSH sessions with state AND sourceAvailability "online", truthy workspacePath AND workspaceIdentity. Each resolve exact remote scope via registry; optional Studio service missing or scoped resolution throw -> yieldnone. Result {workspaceIdentity,workspacePath,label:target.username+"@"+target.host,service:studio}. No local fallback/scans/credentials.
- After awaited network owner returns services: optional task service replaced via createReporting facade with reportRunningPromptCount:false (described below); services.register same token. Dispose prior local resource telemetry then subscribe new registerHostServiceResourceTelemetry({services,postMessage optional parent,runtimeSurface:"local",onError:warn}); normal disposal catches and clears this reference in finally.
- Reset host disposed flag false and shutdown-in-flight null after wiring; warmup targets: nonempty msg.agentWarmupTargets SAME list, else truthy workspacePath one target with truthy identity conditional, else[]. For each in order call optional session.initializeWorkspace with path and truthy identity; no extra discovery/replacement. Missing path/service no-op. Detached then handles unavailable provider_not_ready info, other unavailable warn reason??unknown, ready info transportKind??unknown, catchwarn. No warmup scans/Agent App/presentation calls.
- Log expose; if base notclosed registry.attach {requestId:"init-local-"+UUID,attachmentId:"base-"+UUID,clientMode:"desktop-continuous",scope:{kind:"local"},port}. Then topology reason base-attachment-ready and local ready logs. await databaseStartup.coordinator.start() from message handler.
- Runtime process reporters supplied local services: onSpawn/onReady/onError require parent then corresponding AgentProcessSpawned/Ready/Error {type,...event}; onExit AgentProcessExited {...event,signal:event.signal??null}; onException optional post AgentProcessException {...event}. Runtime task reporter posts AgentRunningTaskCountChanged with only runningTaskCount. Windows CUA reporter posts CuaOperationState {...event}.
- Workspace task tracker existing factory callback first optional parent WorkspaceRunningTaskCountChanged {...event}, then registry.setWorkspaceRunningTaskCount(event), then aggregate host count = tracker.getTotalRunningTaskCount()+untrackedPromptRpcCount. No duplicate authoritative accepted queue.

## Remote connection authority and facades

- Registry instantiated once generic services/capabilities. createId randomUUID; connect callback existing behavior below. releaseWorkspace async calls services.get(TaskService).releaseWorkspacePreparation({workspacePath,truthy identity,provider:"knorvia"}), then log workspace identity?.trim()||path. onWorkspaceReleaseError warns currentcontext/same error.
- onSessionClosed: attachmentRegistry.detachRemoteSessionAttachments(id) FIRST; getSession(id); if truthy path AND identity controller.disconnectSource exact remote scope; optional parent RemoteWorkspaceClosed {remoteSessionId,reason:"connection-closed",exitCode,signal,truthy error}; topology reason remote-connection-closed. No duplicate registry/source state.
- Remote connect callback requires current active local services else Error("Local Host services are not initialized."). Pre-aborted signal Error("远程连接已取消"). Build handle-local close listeners; callback iteration synchronous/raw; remote connector's numeric close code broadcasts {exitCode,signal:null}, without caching/replay.
- Require current network transport else Error("Window Host network transport is not initialized"). RemoteAssetNetwork is {fetch:transport.fetch}, preserving fetch reference, no global fetch fallback. For WSL only, optional current settings service get; success runtimeNetwork {authoritative:true,httpProxy:settings.httpProxy,noProxy:settings.httpProxyNoProxy}; missing/service throw->undefined. Non-WSL undefined.
- Lazy await import("@knorvia/server/remote"), await createRemoteBackend(target), then await connectRemote(backend,{...remoteAssets,remoteAssetNetwork,remoteRuntimeNetwork,signal,appVersion:KNORVIA_VERSION,remoteRuntimeEnv:pickRemoteRuntimeEnv(process.env),assetInstallMode:target.kind==="ssh"?target.assetInstallMode:undefined,deployLockMode,onDidRemoteClose:({code})=>notifyNumeric(code)}). Default deploy lock "remote"; handle requests use SSH "caller-serialized", others "remote"; only SSH forwards abort signal, othersundefined. Return shallow {...connection,backend}, no custom environment/credentials.
- After remote connect success, if original signal nowaborted await connection.disposeAndWait({timeoutMs:5000}) THEN cancellation Error; disposal failure can override. All remote handle disposal calls use same 5000 timeout port.
- Materializer callback uses captured backend materializeRemotePromptAttachments(request,{backend}); await then return only {content,attachments}. CreateRemotePromptAttachmentTransferService(backend,{onJanitorError:warn}). Build remote collection using createRemoteWorkspaceServiceCollection({connectionServices:connection.services,sourceServices:CURRENT activeServices??undefined,parentPort,createRemotePromptAttachmentSessionService wrapper factory,createRemotePromptAttachmentTaskService wrapper factory,createReportingRemoteKnorviaTaskService factory with CURRENT realtime??undefined,promptAttachmentTransferService,runtimePreferencesBridge:{onError:warn}}). Attachment wrappers delegate accepted factories with {materializePromptAttachments}.
- Subscribe remote resource telemetry {services,postMessage optional parent,runtimeSurface:"remote",environmentKey:resolveResourceTelemetryEnvironmentKey(target),onError:warn}. If remote media enabled, capability factory creates createRemoteMediaPreviewProxy({fileService:services.get(FileService),logger:{debug:only if CURRENT NODE_ENV!=="production" logger.info,warn:logger.warn},scope SAME,requestLimiter SAME process limiter}); disabled omits.
- Handle returns SAME services; capabilities if "backend" inconnection {browserRecordingUploader:connection.backend,truthy mediafactory conditional}, else{}. onDidClose adds listener and returns {dispose:()=>Set.delete(listener)}. dispose async once: set disposed before work; clear close listeners; telemetry.dispose(); await disposeServiceResourcesAndWait(services); await connection.disposeAndWait5000. No retries/allSettled if throw.
- Browser bridge created early createBrowserControlMainBridge({postToMain:parent requireelse Error unavailable then post,materializeRecording}). Recording callback remoteSessionId truthy requires workspaceIdentity?.trim() else Error("remote Browser recording materialization requires workspaceIdentity"). Resolve exact registry capabilities using {kind:"remote",remoteSessionId,workspacePath,workspaceIdentity}; select optional browserRecordingUploader. Delegate materializeBrowserRecordingArtifact({...input,...(backend?{remoteBackend}: {})}); no fallback/cached process backend.

## Remote task reporting proxy and ACK/ready/lease ordering

- Each reporting facade owns one existing createHostRemoteWorkspaceProxyState instance; it is a Proxy over original service, generic T returns T. Read target property using Reflect.get(target,property,receiver). Default properties return value RAW (do not bind ordinary reporting-facade functions).
- createTask/resumeTask functions return async wrappers: await value.apply(original target,args), remember qualifying metadata, return SAME result. Metadata qualifies object nonnull with taskId/workspacePath/traceId present and all string. Store SAME meta through accepted proxy state, subscribe workspace events, then optional parent SessionRouteAnnounce {route:{sessionId:taskId}}. Workspace event port: Reflect.get service.onDynamicWorkspaceEvent, require function; invoke .call(service,{workspacePath,truthy identity}); require subscribefunction; proxyState.ensureWorkspaceSubscription(meta,()=>subscribe(listener)); matching event object.type workspace_session_message_send_requested forwards its request as SessionMessageSendRequested, no extra cloning.
- listTasks/listPinnedTasks/listTaskList/listArchivedTasks/getTaskMeta/getTaskSnapshot/getTaskSnapshotWithEtag async wrappers await applytarget, remember metadata recursively for outer arrays; otherwise currentobject qualifies, then items[] eachdirectmeta, snapshot.meta if snapshotobject, then object.meta. Preserve original result and repeat notifications as current contract, no dedup/new validation.
- releaseWorkspacePreparation async wrapper: await original.applytarget(args), then if args[0] nonnullobject workspacePathstring proxyState.clearWorkspace(context) then workspaceTaskTracker.clearWorkspace(context); return SAME result. Rejection leaves proxy/tracker intact.
- sendPrompt wrapped iff reportRunningPromptCount!==false OR realtime truthy OR materializer truthy. Otherwise RAW original function. Wrapped call validates args[0] object with taskId,traceId,content strings. Known metadata -> tracker.begin(taskId,meta). If false, don't setnew ready subscription. Iftrue require target.onDynamicTaskReady function else finish and Error("remote Knorvia Studio task service does not expose onDynamicTaskReady"); call .call(target,taskId), requires subscribefunction else finish and Error("remote Knorvia Studio task ready event is not subscribable"); proxyState.trackTaskReady(taskId,meta,listener=>subscribe(listener),()=>finish). finish first proxyState.disposeTaskReadySubscription then tracker.finish(taskId,meta).
- Known task's successful prompt ACK leaves task tracking active untilready. Catch if newlystarted trackedTask then finish, rethrowsame error. Missing meta validprompt OR invalidparams when count reporting enabled: increment RPC-lifetime count and reportaggregate; finally Math.max0 decrement/report. Missing metadata never creates workspace authority. With count disabled and no metadata no increment.
- Validprompt materialization: no callback -> SAME params; else await options.materializePromptAttachments(params), shallow {...params,...result}. Then mirror: if no realtime/meta call sendPrompt.call(target,params) directly. Else build mirrorTarget {workspacePath,workspaceIdentity,workspaceKey:resolveWorkspaceKey(meta),taskId,runId:traceId,traceId}, await acquireTaskRunLease; rejection logwarn and null, !acquired directsend withoutmirror/release.
- Acquiredlease publishes user_message {messageId:"user-"+traceId,content,attachments,timestamp:Date.now()}; dynamically subscribe onDynamicStreamEvent .call(target,taskId)(listener) ifmethodfunction. For events except task_stream_mirror_batch/task_snapshot_updated publish stream_event SAME event. Subscription/publication happen BEFORE try/finally send; preserve error boundary (no broad cleanup added around setup).
- try return await sendPrompt.call(target,params); finally streamDisposable?.dispose() then realtime.releaseTaskRunLease(mirrorTarget). Disposal throw can prevent release and override original; preserve no allSettled. Sending method is captured bound original value; validprompt extraargs notforwarded, invalidparams original.applytarget(args).

## Controller source and attachment/RPC authority

- createWindowHostControllerRuntime({createId:UUID,onSourceError:warnscope/op/error,resolveSource}). ResolveSource finds exact registry workspace. If remote has truthy path/identity, build exactremote scope; offlineavailability returns {scope,sourceAvailability:"offline"} withoutservices; online resolves services andreturns TaskService required/AgentService optional/sourceAvailability online. If missingremote and requested identityisRemote ->null, NO local fallback. Local optionaltask missing->null; else {scope:{kind:"local",workspacePath,truthy identity},taskService,agentService optional,sourceAvailability:"online"}.
- Attachment registry existing factory with resolveScope: local requires current activeServices else Error("local services 尚未初始化"), returns {services,generation:1}. Remote getSession missing -> Error("未找到远程 logical session，remoteSessionId=<id>"); returns exact registry services,generation=session.generation,capabilities. Expose callback delegates RPC setup below deferInitfalse with SAME port/services/clientMode/scope/capabilities. Dependency owns attachment registry identity/lease rules.
- RPC setup wraps port via wrapElectronPort, constructs MessagePortProtocol(wrapped), ChannelServer(protocol,"host",1000,deferInit), LoggingChannelServer(raw,logRpc), NetworkTelemetryChannelServer(logged). Defaults clientMode desktop-continuous, attachment scope {kind:local}. Optional AgentService creates connection scope via createKnorviaAgentConnectionScope(agent,{connectionId:"host-rpc-"+UUID,clientMode}); clients cannot replace connection identity.
- services.register(WindowControllerService,controllerRuntime.service), createAttachmentService(), overrides Map controllerchannel->attachment service. If scope remote AND clientMode desktop-continuous, invoke optional capability.remoteMediaPreviewFactory(scope), override MediaPreviewchannel service. Mobile replayable neveruses remote preview factory. OptionalTask overrides routedtask Proxy; optionalagentconnectionscope overrides Agentchannel. services.exposeOnChannelServer(server,overrides).
- Routedtask Proxy intercepts pin/archive/unarchive/delete/deletion-batches/unread, delegating existing controller authority. Resolve taskaddress BEFORE mutation with taskId,workspacePath,truthy identity,attachmentScope SAME. pin {kind:"pin",pinned}; archive/unarchive {kind:"archive",archived:property==="archiveTask"}; setUnread {kind:"mark-unread"} iftruthy else {kind:"mark-read",expectedUnreadAt if !=null}. pin/archive/unread missing returned meta -> respective Error("pin mutation 后 task 投影缺失"/"archive mutation 后 task 投影缺失"/"unread mutation 后 task 投影缺失"); returnmeta SAME. delete awaitroute kinddelete resultvoid.
- deleteArchivedTasks empty taskIds returns NEW {deletedTaskIds:[],skippedTaskIds:[],failedTaskIds:[]} no addresscall. Else resolve address with raw workspaceIdentity (evenundefined), firsttaskId,attachmentScope,allowMissingTask:true; then controller.service.deleteArchivedTasks({address,taskIds SAME}). deleteArchivedTask resolves {...params,attachmentScope,allowMissingTask:true}, returns controller.service.deleteArchivedTask({address}). Ordinary routedtask properties typeof function return .bind(originaltarget); othersraw. This differs intentionally from default reportingproxy rawfunctions.
- Connection flow updates serialized through a Promise chain: each append invokes owning scope.setTransportFlowState(state); chain catcheswarn with {state,message} but returnedupdate remainsrejecting. No scope -> fulfilledPromise. protocol.onFlowState callback ignoresafterdisposed and fire-and-forget catches update error. States saturated/drained/closed stayordered; no client-controlled connectionId.
- Port handle returns {server,dispose}. once dispose flag setbefore calls: flowlistener.dispose, controllerattachment.dispose, detached optional media.dispose().catch(warn), append "closed" afteracceptedflowedges then catchvoid and .then(()=>scope?.dispose()), rawServer.dispose,protocol.disconnect. Syncerrorsstopraw; no blanketcatch. port.once close calls samehandle.dispose. Topology logs registry.getStats and attachmentRegistry.size with reason,pid/counts. Captured protocol scope cannot be revived by lateevents.

## Automation/run authority and data

- Targetcollection selection FIRST asks registry.findSessionForWorkspace(request). Any returned remote session needs truthy identity else Error("Automation 目标 Remote Host 缺少 workspaceIdentity"); resolve exactremote scope with REQUEST path and sessionidentity. Missing remote + requestidentity&&isRemote -> Error("Automation 目标 Remote Host 当前不可用"). Local requiresactiveServices else Error("Local Host services are not initialized."). No remote-to-local selection fallback.
- Cron dispatch request {automationId,runId,prompt,targetTaskId?,studioWorkflowId?,modelSelection?,mode?,workspacePath,workspaceIdentity?}. await repo.get automation; absentor saved.workspaceKey!==resolveWorkspaceKey(request) -> Error("计划任务已删除或目标项目不匹配").
- If saved.studioWorkflowId OR request.studioWorkflowId: require saved truthy AND requestexactmatch else Error("Studio 工作流计划目标与已保存的任务不一致"); requestremoteidentity -> Error("本地 Studio 工作流计划不能派发到远端 Host"); optional Studio missing -> Error("Studio Runtime 尚未就绪"). await submitScheduledStudioWorkflow({service:studio,automation:saved,runId:request.runId,workspacePath:request.workspacePath,prompt:SAVED prompt}). markrunning and observer?.observe {automationRunId:request.runId,automationId,workspaceKey:saved.workspaceKey,scheduledAt:parse below,trigger,studioRunId:returnid,workflowId:saved.studioWorkflowId}. Return {taskId:runid,sessionId:runid}; no native task creation.
- Native task branch optionaltask missing Error("Knorvia Studio task service is not initialized."); optionalmodelselection missing Error("目标 Host Model Selection service is not initialized."). await repo.getRun(runId), resolveAutomationSubmissionModelSelection({selection:request.modelSelection,fixedSelection:existingRun?.modelSelection,modelSelectionService,readSelection:()=>repo.getModelSelectionForDispatch(automationId,resolveWorkspaceKey(request))}); then await repo.fixRunModelSelection(runId,resolved) BEFORE taskoperations.
- Workspacekeyresolve; trigger runId.includes(":manual:") ?manual:schedule. scheduledAt: only runId starts automationId+":"; Number(firstsegment afterprefix); positive Number.isSafeInteger ->number else null. Outcome subscription key taskId+NUL+traceId.
- try createTask unless truthy targetTaskId. create options {workspacePath,workspaceIdentity rawoptional,model:formatModelPickerValue(fixedselection),mode:request.mode,thoughtLevel:fixed.options?.reasoningLevel,automationId}. Prompt trace ALWAYS request.runId, never createTask's trace. Existing target: awaitresume {taskId,workspacePath,workspaceIdentity,model,thoughtLevel,automationId}, thenapply config: if modelselection truthy awaitsetAutomationSessionConfig {taskId,traceId:runId,modelSelection,thoughtLevel,mode:request.mode?.trim()} and don't also callother config; else trimmedmode -> setConfigOption mode; if no modelapply and model.reasoning exists -> thought_level option. Preserve await order.
- Before send, dispose previous same key subscription, detached recordCronRunOutcomeBestEffort {...params,repo,logWarn,outcome:"running"}. Subscribe task.onDynamicTaskTerminalOutcome(taskId)(resultlistener); inputId!==traceId ignored. Match: detached settleCronRunTerminalOutcome {...params,outcome:result.outcome,error:result.error,repo,logWarn}; detached task.setTaskUnread {taskId,workspacePath,truthy identity,unread:true}; dispose keyed subscription. Manualtrigger starts startManualClaimHeartbeat({...params,repo,logWarn}); composite disposal heartbeat first then terminalsubscription. Register composite AFTER subscription+heartbeat (retain synchronous replay ordering).
- awaittask.sendPrompt {taskId,traceId:runId,content:request.prompt,clientMode:"desktop-continuous",automationId}. If newtask, reportHostSessionCreate(parentPort,{sessionId:task.taskId,messageId:runId,source:"automation_scheduled",workspaceIdentity rawoptional}); targettask skipreport. Returnsameids. Catch only taskoperationblock: dispose trackedkey if set, detached markfailed with context and Error.message/String(error), rethrowsame. Earlier selection/validation failures outside thisblock remain outside.
- Manualcallback receives {automation,run}, logs started. Calls above using automation savedfields, modelSelection run.modelSelection??automation.modelSelection. Dispatchfailure logswarn; awaitsettleManualDispatchFailureBestEffort {repo,automationId,runId,workspaceKey:automation.workspaceKey,scheduledAt:run.scheduledAt??null,trigger:"manual",dispatchError:same,logWarn}; rethrowsame unless settlementthrows. After accepteddispatch, await repo.markManualRunDispatched {runId,sessionId,dispatchedAt:Date.now()} catchwarn only; accepted failure ledgerwrite doesnot release claim or mark dispatchfailed. Finally logaccepted. Terminalowner retainsmanual claim untilactualready/outcome, ACK may be queueonly.

## Incoming public message dispatch (order and error boundaries)

- parentPort.on async handler first parseHostIncomingMessageEvent(e); invalid result logs invalidparent with formatZodError(result.error), return BEFORE accessing e.ports[0]. For success msg=result.data then port=e.ports[0]. No extra phase/admission/global dispose checks.
- Branch order: DatabaseStartupControl; CuaPipFocusChanged; ResourceUsageSnapshotRequest; ResourceUsageSnapshotCancel; LocalMediaPreviewPathAuthorizeResult; CronRun; BrowserExecuteResult; Dispose; Broadcast; SessionMessageDeliver; SessionMessageDeliveryResult; ConnectRemoteWorkspace; CancelRemoteWorkspaceConnect; BindRemoteWorkspaceContext; DisposeRemoteWorkspaceSession; AttachServicePort; DetachServicePort; global !port return; InitLocal. Unknownwithport no-op.
- Databasecontrol snapshot->coordinator?.publish; retry->void coordinator?.retry(control.attemptId). CUA focus optionalactive CuaPip service ->void publishFocus(msg.event); absentwarn fixedmessage. Resource request voidresponder.handleRequest(msg), cancelresponder.cancelRequest(msg.requestId).
- CronRun requires databaseStartup?.coordinator.snapshot.phase==="ready" else immediate CronRunResult {runId,ok:false,error:"Local database startup is not ready",failureKind:"transient"}. Ready detached asyncdispatch {...msg,mode cast}; success {type:CronRunResult,runId,ok:true,...dispatchids}; errorcatch {runId,ok:false,error:message/String,failureKind:"transient"}. Failure serialization doesn't categorize otherwise.
- BrowserExecuteResult voidbridge.handleResult({requestId,result}); Dispose await shutdown("parent dispose"), fake/realprocess.exit(result.exitCode), return; Broadcast return.
- SessionMessageDeliver: optionallocaltask absent immediate result failed {error:"Knorvia Studio task service is not initialized.",messageId:request.messageId,requestId:request.requestId,sessionId:request.fromSessionId,status:"failed"}. Else voiddeliverSessionMessage(msg.request).then post SAME deliveryresult, catch posts samefailedprojection error. DeliveryResult optionaltask absentwarn, else voidsendSessionMessageDeliveryResult(msg.result).catchwarn. No remote task selection for these local delivery ports.
- ConnectRemoteWorkspace default workspacePath msg.workspacePath??"/"; identity msg.workspaceIdentity??buildRemoteWorkspaceIdentity(path,target), preserving emptyexplicitvalues. Log target ssh username@host:port??22; wsl distro??default and trimmeduser onlyiftruthy; docker container. voidprogress.run(requestId,()=>registry.connect({requestId,target SAME,remoteAssets SAME,workspacePath,workspaceIdentity})).then(async descriptor=> replacement sequencebelow).catch post RemoteWorkspaceConnectFailed {requestId,error:message/String}. No rollbackafterresponsepostfailure.
- Successfulconnect selects registry.listSessions othersame EXACTr aw path/identity with state==="disconnected", exclude descriptorid. For each: if oldtruthypath+identity buildprevious/nextscopes; tryresolve newservices and awaitcontroller.replaceDisconnectedSource(previous,{scope:next,taskService:services.get(Task),sourceAvailability:"online"}), catchwarn but KEEP pending/offlineprojection and continue. Then detacholdattachments, awaitregistry.disposeSession(oldid), post RemoteWorkspaceClosed {remoteSessionId:oldid,reason:"disposed"}. Afterall post RemoteWorkspaceConnected {requestId,descriptor SAME}, topology remote-connected. Error earlier/later flows shared connectfailurecatch. No fabricated new connectionfailure for oldsessiondisposal.
- Cancel registry.cancelConnect(requestId) synchronousreturn.
- Bind: snapshot previous, try synchronousregistry.bindWorkspaceContext exactid/path/identity catchwarn return. Snapshotcurrent; ifexistsdetachStaleRemoteSessionAttachments(id,current.generation) BEFORE awaitingbarrier. Detached ready.catchwarn. Ifprevious truthypath/identity controller.removeSource previousscope immediately. Logbound, return (no await barrier). Preserve oldsource removal even sameidentity.
- DisposeRemote: capture oldsnapshot, detachremoteattachments FIRST; voidregistry.disposeSession(id).then(removecontroller source ifoldtruthypath/identity, postClosed reason disposed, topology), catchwarn. No successresponse beforeasyncdisposal.
- Attach requiresportelse logmissing andreturn. Local and startupnotready: queue callback byattachmentId for registry.attach({...msg,port}); port.once close deletespending ID; return, no await/startnewowner. Otherwise try: remote awaitregistry.waitForScopedServices(msg.scope) beforeexposure, then registry.attach EXACT {requestId,attachmentId,clientMode,scope SAME,port}; logattached/topology. Catch rejectUnavailableAttachedServicePort(port,false) thenwarnsameerror; never expose localfallback.
- Detach deletespending ID then registry.detach(id), logs/topology.

## Ordered teardown and exceptional process notifications

- Graceful shutdown async calledby parentDispose/SIGTERM/SIGINT/disconnect/fatal. EVERY call first databaseStartup?.dispose() then clearpending startupcallbacks, even if alreadydisposed. If alreadydisposed return (awaitexistinginflight)??default {exitCode:0,failedPhases:[],timedOutPhases:[]}. Otherwise set disposed flag BEFORE launching/storing async cleanup Promise.
- Cleanup order: logreason; stopHostNetworkTelemetry; hostSelfResourceTelemetry.stop; dispose localtelemetry catchfinallyclear; attachmentRegistry.dispose; controller.dispose; composite cron subscriptions in currentkeyinsertionorder; Studioobserver?.dispose thennull; AutomationRepo.close; active realtime.dispose thennull; capturelocalservices then setactiveServices=null.
- Await runHostShutdownPhases([ {name:"remote-registry-dispose",run:()=>registry.dispose(),timeoutMs:6000}, ...(capturedlocal?[{name:"service-dispose",run:()=>disposeServiceResourcesAndWait(capturedlocal),timeoutMs:20000}]:[]) ], {phaseTimeoutMs:5000,log:logger.warncallback}). No allSettledrewiring and remote failure mustnotpreventdep'slocalphase. IfexitCode!=0warn {failedPhases,reason,timedOutPhases}. Then active network=null; returnSAME shutdownResult.
- Firstcaller afterawaitstoredPromise flushHostE2ECoverage(error=>warn("[e2e-coverage] host coverage flush failed",error)), returnresult. Repeat callers takeearlierreturn, no secondflush. Synccleanupcallbackerrors beforefirstawait are rejected via asyncwrapper; preserveassignment timing.
- Best-effort exit hook separate: ifdisposedreturn; markdisposed; log; stopHostNetworkTelemetry; localtelemetrydispose; attachmentRegistrydispose; controllerdispose; croncompositesdispose; Studioobserverdispose/null; repo.close; voidregistry.dispose (no swallowedcatch); ifactivelocal trydisposeServiceResources sync catchlogger.error finallylocal=null/network=null; active realtime.dispose/null. This path doesNOT databaseStartup.dispose/clearpending/selftelemetry.stop/phasewait/coverageflush; don't silently improve it.
- process.once SIGTERM and SIGINT voidgraceful(reason).then(result=>process.exit(result.exitCode),()=>process.exit(1)). once disconnect voidgraceful("disconnect").finally(()=>process.exit(1)); unhandled rejection semantics preserved. once exit invokesbest-effort("exit").
- process.on uncaughtException existing createHostUncaughtExceptionHandler({onRecovered,onFatal}). Recovered reads process.memoryUsage and warns contained TLS allocation failure with arrayBuffers,external,heapUsed,message,origin,rss. Fatal: if alreadyhandling process.exit(1) (no explicitreturn; fakeexit maycontinue), setflagtrue, loggererror origin+sameerror; voidgraceful("uncaughtException:"+origin).finally(()=>process.exit(1)). No security/nativeexception policy change.

## Exact public declaration/import and retained vocabulary appendix

The following imports and static strings/template PIECES are constrained external port/observable data catalogs. They contain no implementation expressions or bodies. Preserve public shapes/semantics; private helpers/names/layout remain yours. All matching expressions/catalogs get zero new independence/MIT credit. Ask for opaque port argument/return type facts rather than reading dependency implementation.

~~~ts
import { createHostDatabaseStartup } from "./hostDatabaseStartup.js";
import { randomUUID } from "node:crypto";
import { MessagePortProtocol, ChannelServer, type IDisposable, type IChannelServer, LoggingChannelServer, NetworkTelemetryChannelServer, } from "@knorvia/rpc";
import { registerHostNetworkTelemetry, stopHostNetworkTelemetry } from "./hostNetworkTelemetry.js";
import { registerHostServiceResourceTelemetry } from "./hostServiceResourceTelemetry.js";
import { resolveResourceTelemetryEnvironmentKey } from "./hostResourceTelemetryEnvironment.js";
import { reportHostSessionCreate } from "./hostSessionCreateTelemetry.js";
import { createBrowserControlMainBridge } from "./browserControlMainBridge.js";
import { submitScheduledStudioWorkflow } from "./studioWorkflowSchedule.js";
import { StudioScheduleOutcomeObserver } from "./studioScheduleOutcome.js";
import { materializeBrowserRecordingArtifact } from "./browserRecordingArtifactMaterializer.js";
import { ServiceCollection, IFileService, IMediaPreviewService, IModelSelectionService, ISettingService, IStudioRuntimeService, IWindowControllerService, IKnorviaAgentService, IKnorviaTaskService, IKnorviaSessionService, ICuaPipSessionService, createKnorviaAgentConnectionScope, type KnorviaAgentV4ClientMode, collectServiceMemoryDiagnostics, } from "@knorvia/services";
import { createLocalServices, disposeServiceResources, disposeServiceResourcesAndWait, AutomationRepo, createServiceLogger, createHostApiNetworkTransport, createSettingServiceWithMigrations, type HostApiNetworkTransport, } from "@knorvia/services/node";
import { createHostResourceUsageResponder } from "./hostResourceUsage.js";
import { HostMessageTypes, HostResponseTypes, KNORVIA_VERSION, formatLogPrefix, formatKnorviaHostProcessName, formatZodError, buildRemoteWorkspaceIdentity, isRemoteWorkspaceIdentity, resolveWorkspaceKey, formatModelPickerValue, redactDiagnosticValue, type KnorviaPromptAttachment, type KnorviaStreamEvent, type KnorviaTaskMeta, type TaskStreamMirrorableEvent, type TraceId, type KnorviaTaskMode, type WindowHostAttachmentScope, type KnorviaAutomation, type KnorviaAutomationRun, type KnorviaAutomationRunOutcome, type ModelSelection, } from "@knorvia/shared";
import { parseHostIncomingMessageEvent, rejectUnavailableAttachedServicePort, } from "./hostMessagePortGuard.js";
import type { ConnectOptions, DeployLockMode, IRemoteBackend, RemoteRuntimeNetworkOptions, RemoteAssetNetworkPort, RemoteConnection, } from "@knorvia/server/remote";
import type { RemoteTarget } from "@knorvia/shared";
import { wrapElectronPort } from "./electronPort.js";
import { createTaskRealtimeBridgeForHostInit } from "./taskRealtimeBridge.js";
import { resolveRpcLogLevel } from "./rpcLogLevel.js";
import { createHostWorkspaceTaskTracker } from "./hostWorkspaceTaskTracker.js";
import { createRemoteMediaPreviewProxy, type RemoteMediaPreviewProxy, } from "./remoteMediaPreviewProxy.js";
import { createHostRemoteWorkspaceProxyState } from "./hostRemoteWorkspaceProxyState.js";
import { createRemoteWorkspaceServiceCollection } from "./remoteWorkspaceServiceCollection.js";
import { createRemotePromptAttachmentTransferService } from "./promptAttachmentTransferService.js";
import { shouldReportHostConsoleError, stringifyHostLogArg } from "./hostLog.js";
import { flushHostE2ECoverage } from "./e2eCoverage.js";
import { runHostShutdownPhases, type HostShutdownResult } from "./hostShutdownPhases.js";
import { initializeHostApiNetworkTransportOwner } from "./hostInitialization.js";
import { createHostUncaughtExceptionHandler } from "./hostUncaughtExceptionGuard.js";
import { recordCronRunOutcomeBestEffort, startManualClaimHeartbeat, settleCronRunTerminalOutcome, settleManualDispatchFailureBestEffort, } from "./cronRunLifecycle.js";
import { createRemotePromptAttachmentSessionService, createRemotePromptAttachmentTaskService, materializeRemotePromptAttachments, } from "./remotePromptAttachments.js";
import { createWindowHostAttachmentRegistry } from "./windowHostAttachmentRegistry.js";
import { createWindowRemoteConnectionRegistry, type WindowRemoteConnectionCloseEvent, type WindowRemoteConnectionHandle, } from "./windowRemoteConnectionRegistry.js";
import { createWindowHostControllerRuntime } from "./windowHostControllerService.js";
import { resolveAutomationSubmissionModelSelection } from "./automationModelSelection.js";
import { createRemoteConnectionProgressContext } from "@knorvia/server/remote/remoteConnectionProgressContext.js";
import { startHostSelfResourceTelemetry } from "./hostSelfResourceTelemetry.js";
~~~

~~~json
{
  "credit": 0,
  "limit": "String literals and template literal pieces ONLY; no source expressions, helper/state layout or bodies. Constrained observable contract vocabulary, no novelty credit.",
  "strings": [
    "./hostDatabaseStartup.js",
    "node:crypto",
    "@knorvia/rpc",
    "./hostNetworkTelemetry.js",
    "./hostServiceResourceTelemetry.js",
    "./hostResourceTelemetryEnvironment.js",
    "./hostSessionCreateTelemetry.js",
    "./browserControlMainBridge.js",
    "./studioWorkflowSchedule.js",
    "./studioScheduleOutcome.js",
    "./browserRecordingArtifactMaterializer.js",
    "@knorvia/services",
    "@knorvia/services/node",
    "./hostResourceUsage.js",
    "@knorvia/shared",
    "./hostMessagePortGuard.js",
    "@knorvia/server/remote",
    "./electronPort.js",
    "./taskRealtimeBridge.js",
    "./rpcLogLevel.js",
    "./hostWorkspaceTaskTracker.js",
    "./remoteMediaPreviewProxy.js",
    "./hostRemoteWorkspaceProxyState.js",
    "./remoteWorkspaceServiceCollection.js",
    "./promptAttachmentTransferService.js",
    "./hostLog.js",
    "./e2eCoverage.js",
    "./hostShutdownPhases.js",
    "./hostInitialization.js",
    "./hostUncaughtExceptionGuard.js",
    "./cronRunLifecycle.js",
    "./remotePromptAttachments.js",
    "./windowHostAttachmentRegistry.js",
    "./windowRemoteConnectionRegistry.js",
    "./windowHostControllerService.js",
    "./automationModelSelection.js",
    "@knorvia/server/remote/remoteConnectionProgressContext.js",
    "./hostSelfResourceTelemetry.js",
    "upload",
    "remote",
    "KNORVIA_REMOTE_MEDIA_RANGE_PREVIEW_ENABLED",
    "0",
    "mockCdnDir",
    "remoteCdnBaseUrl",
    "remoteCdnBaseUrls",
    "remoteCacheDir",
    "KNORVIA_PROCESS_LABEL",
    "info",
    "warn",
    "error",
    "parentPort unavailable",
    "remote Browser recording materialization requires workspaceIdentity",
    "host",
    " ",
    "knorvia-host",
    "Automation 目标 Remote Host 缺少 workspaceIdentity",
    "Automation 目标 Remote Host 当前不可用",
    "Local Host services are not initialized.",
    ":",
    "schedule",
    "manual",
    "mode",
    "thought_level",
    "running",
    "计划任务已删除或目标项目不匹配",
    "Studio 工作流计划目标与已保存的任务不一致",
    "本地 Studio 工作流计划不能派发到远端 Host",
    "Studio Runtime 尚未就绪",
    ":manual:",
    "Knorvia Studio task service is not initialized.",
    "目标 Host Model Selection service is not initialized.",
    "desktop-continuous",
    "automation_scheduled",
    "failed",
    "warning",
    "processLifecycleReporter",
    "taskRuntimeReporter",
    "cuaOperationStateReporter",
    "object",
    "taskId",
    "workspacePath",
    "traceId",
    "string",
    "task_stream_mirror_batch",
    "task_snapshot_updated",
    "onDynamicWorkspaceEvent",
    "function",
    "workspace_session_message_send_requested",
    "Remote runtime realtime lease failed:",
    "user_message",
    "onDynamicStreamEvent",
    "stream_event",
    "onDynamicTaskReady",
    "remote Knorvia Studio task service does not expose onDynamicTaskReady",
    "remote Knorvia Studio task ready event is not subscribable",
    "createTask",
    "resumeTask",
    "listTasks",
    "listPinnedTasks",
    "listTaskList",
    "listArchivedTasks",
    "getTaskMeta",
    "getTaskSnapshot",
    "getTaskSnapshotWithEtag",
    "releaseWorkspacePreparation",
    "sendPrompt",
    "provider_not_ready",
    "unknown",
    "rpc",
    "debug",
    "ssh",
    "wsl",
    "default",
    "docker",
    "Window Host network transport is not initialized",
    "远程连接已取消",
    "caller-serialized",
    "remote prompt attachment janitor failed",
    "remote runtime preferences bridge failed",
    "remote resource telemetry subscription failed",
    "production",
    "backend",
    "knorvia",
    "connection-closed",
    "remote-connection-closed",
    "online",
    "offline",
    "local",
    "local resource telemetry subscription failed",
    "pin",
    "archive",
    "delete",
    "mark-read",
    "mark-unread",
    "setTaskPinned",
    "pin mutation 后 task 投影缺失",
    "archiveTask",
    "unarchiveTask",
    "archive mutation 后 task 投影缺失",
    "deleteTask",
    "deleteArchivedTasks",
    "deleteArchivedTask",
    "setTaskUnread",
    "unread mutation 后 task 投影缺失",
    "saturated",
    "drained",
    "closed",
    "failed to forward attachment connection flow state",
    "failed to dispose remote media preview proxy",
    "close",
    "local services 尚未初始化",
    "remote-registry-dispose",
    "service-dispose",
    "host resource cleanup completed with errors",
    "[e2e-coverage] host coverage flush failed",
    "failed to dispose local services:",
    "SIGTERM",
    "SIGINT",
    "disconnect",
    "exit",
    "uncaughtException",
    "contained host allocation failure from native TLS callback",
    "message",
    "invalid parentPort message:",
    "snapshot",
    "retry",
    "[cua-pip-session] focus event dropped: service unavailable",
    "local media preview path authorization OK",
    "本地视频预览路径授权失败",
    "ready",
    "Local database startup is not ready",
    "transient",
    "parent dispose",
    "session message delivery result received before Knorvia Studio task service initialized",
    "failed to forward session message delivery result:",
    "/",
    "disconnected",
    "failed to atomically replace disconnected Controller source",
    "disposed",
    "remote-connected",
    "remote-session-disposed",
    "attach-service-port message missing MessagePort",
    "attachment-added",
    "attachment-removed",
    "init-local message missing MessagePort",
    "startup attachment failed",
    "initializing local services",
    "desktop_local_host",
    "desktop-local",
    "win32",
    "exposing services on ChannelServer...",
    "base-attachment-ready",
    "local services ready, all channels registered"
  ],
  "templateLiteralPieces": [
    "",
    "\u0000",
    ":",
    "direct manual automation dispatch started automation=",
    " runId=",
    "direct manual automation dispatch failed automation=",
    "回写 manual automation dispatched 状态与运行次数失败 automation=",
    "direct manual automation dispatch accepted automation=",
    " taskId=",
    ": ",
    "user-",
    "Knorvia Studio agent warmup waiting for provider/model (",
    ") workspace=",
    "Knorvia Studio agent warmup unavailable (",
    " reason=",
    "Knorvia Studio agent warmup ready (",
    " transport=",
    "Knorvia Studio agent warmup failed (",
    "ssh:",
    "@",
    "wsl:",
    "docker:",
    "released WSL workspace runtime, workspaceKey=",
    "failed to release WSL workspace runtime, workspaceKey=",
    "window Controller source ",
    " failed, scope=",
    ", workspaceKey=",
    "creating ChannelServer (deferInit=",
    ")",
    "host-rpc-",
    "service connection ready mode=",
    "未找到远程 logical session，remoteSessionId=",
    "window Host topology, reason=",
    ", pid=",
    ", connections=",
    ", logicalSessions=",
    ", attachments=",
    "disposing host resources, reason=",
    "uncaughtException origin=",
    "uncaughtException:",
    "connecting window-scoped remote source, requestId=",
    ", target=",
    "failed to bind remote workspace context, remoteSessionId=",
    "failed to prepare bound remote workspace, remoteSessionId=",
    "bound remote workspace context, remoteSessionId=",
    ", workspacePath=",
    "failed to dispose remote logical session, remoteSessionId=",
    "attached scoped service port, attachmentId=",
    ", scope=",
    ", clientMode=",
    "failed to attach scoped service port, attachmentId=",
    "detached service port, attachmentId=",
    "local database startup failed attempt=",
    "local host init (",
    "/",
    "init-local-",
    "base-"
  ]
}
~~~

# Exact public port spellings and argument/results

This addendum supplies public dependency contract facts, never private helper/state/body layout. Initial author asked before drafting and wrote no file. Existing semantic facts in the core remain authoritative. Imported type identities in the import appendix can be used directly; declarations below describe consumed surfaces only, not replacement dependencies or new exports.

- ServiceCollection is imported runtime class/type. Calls are services.get(token) for required service, services.getOptional(token) for optional (undefined absent), services.register(token,service) and services.exposeOnChannelServer(server,overrides). Tokens are imported IFileService, IMediaPreviewService, IModelSelectionService, ISettingService, IStudioRuntimeService, IWindowControllerService, IKnorviaAgentService, IKnorviaTaskService, IKnorviaSessionService, ICuaPipSessionService; use token.channelName (string) as overrides key, NOT token.channel. Optional lookup's generic return is the token's declared service type. No string-token substitutions.
- Controller returned object has .service, .resolveTaskAddress(params), .createAttachmentService(), .replaceDisconnectedSource(previousScope,nextSource), .disconnectSource(scope), .removeSource(scope), .dispose(). resolveTaskAddress async input is taskId/workspacePath/workspaceIdentity?/attachmentScope plus allowMissingTask?; returned address opaque, pass SAME to controller.service methods. .service.mutateTask({address,mutation}) returns Promise<meta or nullish>; task metadata return SAME. service.deleteArchivedTasks({address,taskIds}) and service.deleteArchivedTask({address}) return existing opaque result. createAttachmentService returns the service object ITSELF with .dispose(), not {service,...}; store returned object directly in controller-channel override. Replacement nextSource {scope,taskService,sourceAvailability:"online"} as described.
- Registry factory createWindowRemoteConnectionRegistry<TServices,TCapabilities=never>. connect option receives {target:RemoteTarget,remoteAssets:{mockCdnDir?:string,remoteCdnBaseUrl?:string,remoteCdnBaseUrls?:string[],remoteCacheDir?:string},signal:AbortSignal}, returns Promise<WindowRemoteConnectionHandle<TServices,TCapabilities>>. Handle imports expose {services:TServices,capabilities?:TCapabilities,dispose():void|Promise<void>,onDidClose?(listener:(event:{exitCode:number|null,signal:string|null,error?:string})=>void):{dispose():void}}. Index capability data consumed is {browserRecordingUploader?:Pick<IRemoteBackend,"upload">,remoteMediaPreviewFactory?:(scope:Extract<WindowHostAttachmentScope,{kind:"remote"}>)=>RemoteMediaPreviewProxy}; private local type names free. Registry options createId,onSessionClosed,releaseWorkspace,onWorkspaceReleaseError are exactly named as core. Returned public methods connect/cancelConnect/bindWorkspaceContext/resolveScopedServices/resolveScopedCapabilities/getSession/listSessions/findSessionForWorkspace/getStats/setWorkspaceRunningTaskCount/waitForScopedServices/disposeSession/dispose. Service/capability refs exact, queries snapshot optional raw workspace identity/path and target/generation/state/sourceAvailability. Do not reimplement registry.
- createHostRemoteWorkspaceProxyState returns .rememberTaskMeta(meta), .getTaskMeta(taskId), .ensureWorkspaceSubscription(context,subscribe), .trackTaskReady(taskId,context,subscribe,onReady), .disposeTaskReadySubscription(taskId), .clearWorkspace(context). Meta minimum {taskId:string,traceId:string,workspacePath:string,workspaceIdentity?:string}; returned getTaskMeta same ref orundefined. Context {workspacePath:string,workspaceIdentity?:string}. ensure subscribefn ()=>IDisposable ->boolean. track subscribe(listener:()=>void)->IDisposable; all cleanup portsvoid. Existing dependency owns synchronous replay/stale events; delegate exactly.
- createHostWorkspaceTaskTracker(onEvent) returns .begin(taskId,meta):boolean, .finish(taskId,meta), .clearWorkspace(context), .getTotalRunningTaskCount():number. Its callback event consumed workspacePath/workspaceIdentity?/runningTaskCount; forward SAME event. Don't duplicate its accepted task state.
- createTaskRealtimeBridgeForHostInit(msg,parentPort) returns nullable object with .acquireTaskRunLease(mirrorTarget):Promise<{acquired:boolean,...opaque data}>, .publishStreamOp(mirrorTarget,operation), .releaseTaskRunLease(mirrorTarget), .dispose(). Only .acquired field read; release/publication return ignored, do not add await. Exact names as core, not acquireLease/publish/release. mirrorTarget fields in core. TaskStreamMirrorableEvent and KnorviaStreamEvent imported type identities.
- createKnorviaAgentConnectionScope(agentService,{connectionId,clientMode}) returns {service,setTransportFlowState(state):Promise<void>,dispose()}; use scope.service for Agent-channel override. protocol.onFlowState(listener)->IDisposable. Channel wrappers expose existing IChannelServer plus ready(), but index exposes server object without callingready itself. Attachment registry returns .attach(request),.detach(id),.detachRemoteSessionAttachments(id),.detachStaleRemoteSessionAttachments(id,generation),.dispose(),.size():number and is sole owner.
- createHostDatabaseStartup(options) consumes {startupId,cwd,workingDirectories,env,publish:(state)=>void,onFailure:(error)=>void,initializeServices:()=>Promise<void>}. It returns {coordinator:{snapshot:{phase,attemptId,...opaque},publish():void,retry(attemptId):Promise<...opaque>,start():Promise<...opaque>},dispose():void}. initializeServices takes NO arguments, returns void after described host setup (not a collection return). Retained dependency controls when callback/publication occur. No actual DB/files/process launched.
- createBrowserControlMainBridge options materializeRecording receives {artifact:BrowserRecordingArtifact,localPath:string,outputPath:string,workspacePath:string,workspaceIdentity?:string,remoteSessionId?:string}, returns Promise<BrowserRecordingArtifact>. Input's optional remoteBackend is not required public bridge field; registry-derived uploader supplied separately as described. bridge .handleResult({requestId,result}) returns promise/void as existing; .execute etc opaque service executor implementation delegated unchanged. materializeBrowserRecordingArtifact input shape same minus identity unused, plus remoteBackend?:Pick<IRemoteBackend,"upload">; returns Promise<BrowserRecordingArtifact>. BrowserRecordingArtifact at least path:string with other imported opaque fields retained; don't define narrowed replacement exported schema.
- IRemoteBackend.upload(localPath,remotePath,options?) existing async port; no actual invocation here except accepted materializer delegates. Local remote-asset type is Pick<ConnectOptions,"mockCdnDir"|"remoteCdnBaseUrl"|"remoteCdnBaseUrls"|"remoteCacheDir">. Message passes msg.remoteAssets SAME reference to registry. Connector receives shallow spread ALL fields of that supplied object followed by explicit overrides in core, NO own filtering. Nominal keys have optionalstring/string[] shapes above.
- Runtime dynamic import("@knorvia/server/remote") yields .createRemoteBackend(target):Promise<IRemoteBackend>, .connectRemote(backend,options):Promise<RemoteConnection>, .pickRemoteRuntimeEnv(env):existing opaque record. pickRemoteRuntimeEnv is destructured from that same lazy import, hence not a staticimport in appendix. Its existing allowlist is opaque and MUST be delegated; don't read/copy/recreate its list or enumerate environment manually. Pass process.env SAME to it, SAME returned object to remoteRuntimeEnv. connectRemote's options exactly {...remoteAssets,remoteAssetNetwork,remoteRuntimeNetwork,signal,appVersion,remoteRuntimeEnv,assetInstallMode,deployLockMode,onDidRemoteClose}. RemoteConnection .services:ServiceCollection, .disposeAndWait({timeoutMs:5000}):Promise<void>, other data opaque; returned entry handle remains shallowconnectionwithbackend. RemoteAssetNetworkPort {fetch:existing transport.fetch}; RemoteRuntimeNetworkOptions fields authoritative/httpProxy/noProxy consumed in core.
- Task config exact public methods: taskService.setAutomationSessionConfig({taskId,traceId,modelSelection,thoughtLevel,mode}) Promise<void>; taskService.setConfigOption({taskId,traceId,configId:"mode",value:trimmedMode}) or {configId:"thought_level",value:reasoningLevel}. Models use imported ModelSelection with .options?.reasoningLevel; no new parsing/registrypolicy. Creation/resume/send/terminal event field spellings and arguments all given in core. onDynamicTaskTerminalOutcome(taskId)(listener) returns disposable. Task metadata type imported KnorviaTaskMeta, TraceId may branded but prompt correlation uses runId asTraceId unchanged.
- registerHostServiceResourceTelemetry(options)->IDisposable; createRemoteMediaPreviewProxy(options)->{service,dispose():Promise<void>} per imported RemoteMediaPreviewProxy. Existing network transport has .fetch property; initialization delegated to initializeHostApiNetworkTransportOwner and setting migration per core. Existing HostShutdownResult {exitCode:number,failedPhases:string[],timedOutPhases:string[]} consumed fields, exact result returned without cloning. runHostShutdownPhases methods/options ordering in core.

All opaque result objects remain references and existing imported types. No new security/grant/provider/env allowlist or port implementation. The author is allowed to define freely named private consumed-shape interfaces when useful, but cannot substitute runtime dependency bodies.
