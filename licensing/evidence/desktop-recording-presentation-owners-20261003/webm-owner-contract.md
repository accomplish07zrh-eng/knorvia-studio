# Complete Electron WebM lifecycle owner

Output /tmp/knorvia-webm45-initial.ts. Import randomUUID from node:crypto;
mkdir/open/rm/writeFile/type FileHandle from node:fs/promises; dirname/join from
node:path; BrowserWindow/MessageChannelMain/session/types MessagePortMain,Session,
WebFrameMain from electron. Import three factory input/factory/session types from
./browserVideoRecorder.js. Export async createElectronBrowserWebmRecorder(input,
debug?:(message:string)=>void):Promise<BrowserWebmRecorderSession>, and const
defaultElectronBrowserWebmRecorder:BrowserWebmRecorderFactory EXACT SAME function
reference. No new exports. Existing one-owner >400-line lint exemption may remain;
do not split transaction to satisfy line count. Node import.meta.dirname required.

Fixed channel 'knorvia-browser-video-recorder:port'; start and stop budgets15000.
Errors are Error('Electron WebM recorder failed: '+message). Abort fresh DOMException
('Browser recording cancelled','AbortError'), not signal.reason. Deferred phases
ready/started/stopped each settle once, hang until resolved/rejected; preattach
catch(()=>undefined) to each original promise so unused phase rejections observed.
Timeout awaits Promise.race with referenced timer rejecting prefixed recorder Error;
finally clears truthy timer. Preserve same Error identity if failure input instanceof
Error, otherwise normalize String(input) through prefix error. No extra catches.

Initial signal.aborted=>abort before frame/IO. Capture targetFrame=input.targetFrame;
require truthy frame, typeof isDestroyed==='function', !isDestroyed(), !detached,
otherwise prefixed 'target WebFrameMain is unavailable'. await mkdir(dirname(output),
{recursive:true}); recorder document path join(same dirname,`.${randomUUID()}-browser-video-recorder.html`). Create session fromPartition(`knorvia-browser-video-recorder-${randomUUID()}`),
new BrowserWindow {show:false,width:max(1,input.viewport.width),height likewise,
webPreferences:{session:SAME session,preload:join(import.meta.dirname,'../preload/browserVideoRecorder.cjs'),
sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
webSecurity:true}}. setWindowOpenHandler(()=>({action:'deny'})). Preserve these exact
security values; no native execution. Create MessageChannelMain port1=main/port2=renderer.
No try around these initial setup steps and no extra signal recheck.

Transaction state: optional fileHandle, unknown writeError, serialized writeChain
initially resolved, closed=false, stopping=false. fail(error) normalizes once and
rejects all3 phase deferreds SAME error. mainPort message listener obtains event.data,
ignore falsey/non-string .type; then debug '[browser-recording] recorder message type=${type}'
BEFORE branching. 'ready' resolve ready. 'started' requires MIME exact vp8 string or
'video/webm'; invalid fail prefixed 'unexpected MediaRecorder MIME type: '+String(mime),
else started resolve. 'stopped' resolves stopped. 'error' fail prefixed string message
if typeofstring else 'unknown error'. 'diagnostic' debug '[browser-recording] '+
String(message??''). 'cancelled'/unknown message types ignored after generic debug.

'chunk': convert ArrayBuffer using Buffer.from(value); ArrayBuffer.isView=>Buffer
from value.buffer/byteOffset/byteLength (shared backing memory); else Buffer.isBuffer
value or null. If absent/zero length debug '[browser-recording] ignored empty chunk value=${Object.prototype.toString.call(data)}', return. Otherwise debug '[browser-recording] received WebM chunk bytes=${byteLength}'. Chain then async: if no handle throw prefixed
'output file is already closed'; await live fileHandle.write(buffer). Chain catch
sets writeError??=error (first nonnullish); chain stays fulfilled, no immediate fail.
Do not copy buffer, retry partial writes, drop further chunks or test failure flags
instead of the existing truthy writeError check at stop.

Register mainPort on('message',same callback), on('close',()=>if!closed fail prefixed
'recorder MessagePort closed unexpectedly'), then start. Window webContents on
'render-process-gone' callback(_event,details:{reason?:string}): if!closed fail prefixed
`recorder renderer exited: ${details.reason??'unknown'}`. on('console-message') gets
FIRST event details {level?,message?}, debug '[browser-recording] recorder console level=${level??unknown} message=${message??empty}'. Not positional legacy fields.

cleanup(cancel) async: closed=>return immediately (NOT cached cleanup promise).
Latch closed=true first; remove input.signal abort listener. If cancel, try main
postMessage({type:'cancel'}), swallow post error. Await writeChain.catch(()=>undefined);
await optional fileHandle.close().catch(()=>undefined); handle=undefined. Remove
main message listener, close main then renderer port with independent catches;
try session.setDisplayMediaRequestHandler(null) catch ignored; remove window gone
then console listeners; if !window.isDestroyed() destroy (throw not globally caught);
await rm(document,{force:true}).catch(()=>undefined). No removal of output file here.
onAbort fail fresh abortError then void cleanup(true). Add once:true listener after
window/port setup. If signal was aborted between first check and listener registration,
do not add a recheck or repair that frozen race.

Startup try: await writeFile(document,HTML below,{encoding:'utf8',mode:0o600}). Install
setDisplayMediaRequestHandler((request,callback)=>...): deny callback({}) if closed
OR request.frame!==recorderWindow.webContents.mainFrame OR !request.videoRequested
OR request.audioRequested OR targetFrame.isDestroyed() OR targetFrame.detached,
in this short circuit order. Else callback({video:SAME targetFrame}). No alternative
frame/current-session fallback, no policy broadening. await open(input.outputPath,'w');
await window.loadFile(document); await rm(document,{force:true}).catch ignore;
webContents.postMessage(channel,null,[rendererPort]); await ready with15s message
'recorder renderer did not become ready'; mainPort.postMessage({type:'start',fps:
input.fps,width:input.viewport.width,height:input.viewport.height}); await started
with15s message 'MediaRecorder did not start'. Catch startup error: fail SAME normalization,
await cleanup(true), throw ORIGINAL error (cleanup may override if it throws).

Return session stop async/cancel closure. stop: ifclosed throw prefixed 'recorder is
already closed'. If stopping, await stopped deadline15s 'MediaRecorder did not stop',
RETURN without drain/cleanup join. Otherwise stopping=true; main postMessage({type:
'stop'}) BEFORE try (post throw leaves stopping latched and no cleanup). try await
stopped15s, await writeChain, if writeError truthy throw SAME unknown writeError;
finally await cleanup(false). cancel calls cleanup(true), no wait for cancelled ack,
idempotent closed behavior not memoized. Preserve these partial-failure boundaries.

Renderer HTML is complete new literal implementing protocol, not imported source.
DOCTYPE/html/head charset utf-8/CSP exact `default-src 'none'; script-src 'unsafe-inline'`,
body inline JS. Event window.addEventListener('message',handler,{once:true}); ignore
if event.source!==window OR event.data!==channel; take event.ports[0], missingreturn.
Set port.onmessage async, port.start(), post ready. Existing once listener may be
consumed by invalid first event; no security-policy change. Shared renderer lifecycle
fields recorder/captureStream/canvasStream/video/canvas/drawTimer/chunkQueue/cancelling.
No added duplicate-start rejection. Error text instanceof Error?message:String.

Renderer start try: MIME candidates ['video/webm;codecs=vp8','video/webm'] first
MediaRecorder.isTypeSupported; absent Error 'Chromium does not support VP8 WebM MediaRecorder'.
fps=Number(data.fps)||25; width/height Number(...), require integer>0 else Error
'invalid recorder viewport'. Await navigator.mediaDevices.getDisplayMedia({video:
{frameRate:fps},audio:false}). First video track. Diagnostic message 'track='+JSON
of {active:stream.active,muted:track?.muted,readyState:track?.readyState,settings:
track?.getSettings?.()}. Track events mute/unmute/ended emit exact 'track muted',
'track unmuted','track ended'. Create video muted=true,playsInline=true,srcObject:
capture stream,style.position='fixed',style.opacity='0', append body, await play().
Create canvas width/height, context2d {alpha:false}, missing Error '2D canvas recorder is unavailable'.
Draw video to(0,0,width,height) immediately, then interval max(1,round(1000/fps));
canvas.captureStream(fps); new MediaRecorder(canvas stream,{mimeType}).

dataavailable: emit diagnostic 'dataavailable bytes='+chunkEvent.data?.size; ignore
absent/size===0. Append to promise chunkQueue; await data.arrayBuffer(), post
{type:'chunk',data:bytes} with NO transfer-list argument (structured clone).
recorder error posts {type:'error',message:text(event.error??'MediaRecorder error')}.
stop listener once:true async: try await chunkQueue THEN post {type:cancelling?
'cancelled':'stopped'}, catch post error message, finally stop tracks/DOM below.
start(1000), then post started with recorder.mimeType||chosen. Start catch stop
tracks/DOM and post error. No retry or extra stop handshake.

Renderer stop message: if recorder state recording OR paused call stop(); else
post error 'MediaRecorder is not recording'. Renderer cancel sets cancelling=true;
same active states stop(), otherwise stopTracks then post cancelled. stopTracks:
stop every capture stream getTracks?.()??[] track THEN canvas stream tracks; set
streams null; if drawTimer!==null clearInterval and reset null; remove video and
canvas using optional calls then null. Exceptions retain original propagation;
no new broad catch. HTML whitespace/new internal names are not novelty credit.
