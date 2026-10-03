# Complete surface coordinator owner contract

Output /tmp/knorvia-screenshot-surface-initial.ts. Imports @knorvia/shared value
BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS (3000) and types BrowserViewportSize,
BrowserViewScreenshotSurfacePreparePayload/ReadyPayload/ReleasePayload. Retain
./browserScreenshotSurfaceContracts.js ports/types declared in ports/*.d.ts;
reexport BrowserScreenshotSurfaceCoordinator and BrowserScreenshotSurfaceLease
types from that module. Export DesktopBrowserScreenshotSurfaceCoordinator class
implementing the coordinator interface. No other public exports/methods.

Constructor options reference: timeoutMs?,activityTimeoutMs?, acquireActivity?
(windowId:number,payload:PreparePayload):ActivityLease|undefined; sendPrepare
(windowId,payload):boolean; sendRelease(windowId,ReleasePayload):void; log?,warn?
(message:string):void. Capture timeoutMs??3000 and activityTimeoutMs??35000;
other ports are live reads from options. Public prepare input per ports; public
handleReady({windowId:number,senderWebContentsId:number,payload:ReadyPayload}):void,
handleWindowDestroyed(windowId:number):void, dispose():void.

One guest-key map, one ready-requestId map, FIFO queued groups, one active group,
scheduling suspended flag and disposed flag are owned here. Key JSON array in
order windowId/workspaceKey/sessionId/browserId/browserGeneration/tabId/
webContentsId/viewport.width/viewport.height/surfaceScaleMode??current/
viewportMode??emulated. requestId/signal/activityTimeout do not affect key.

prepare rejects asynchronously if disposed (Error 'browser screenshot surface
coordinator disposed'), signal already aborted (fresh Error 'browser screenshot
surface preparation cancelled'), width<=0 or height<=0 (Error 'browser screenshot
surface preparation requires a non-zero viewport'). NaN/Infinity are not rejected.
Existing ready group returns a newly created lease immediately via Promise.resolve;
no new timeout or activity override. New group payload uses retained payload port,
first input's activityTimeoutMs, invalidationController and sets/maps/FIFO. Request
promise arms timeout BEFORE request registration, then adds request to group BEFORE
abort listener registration (once:true), rechecks aborted after registration and
then activates next group. Per-request timeout Error 'browser screenshot surface
preparation timed out after ${timeoutMs}ms'. Abort settles only this request.

Activation returns if active or disposed. Shift FIFO; recurse past released/empty
groups. Mark active and install readyRequestId lookup BEFORE activity acquisition.
If live acquireActivity exists, invoke with original payload; falsey lease errors
'browser screenshot activity could not be acquired'. Do not catch acquire throws.
If activity invalidation signal exists, install once listener then recheck aborted.
Use its Error reason by identity, otherwise Error 'browser screenshot activity was
invalidated'. Store listener for removal. Arm independent activity timer with first
group override??captured default. Callback warns '[browser-screenshot-surface]
activity watchdog released requestId=${id} windowId=${windowId}', then errors
'browser screenshot activity timed out after ${timeout}ms'. Warning throw propagates.
Set prepareSent=true BEFORE sendPrepare; even false send requires release.
try sendPrepare original payload; thrown or falsey result errors 'browser screenshot
surface preparation could not be sent' ONLY if group not ready or released. A sync
ready callback during send wins even if send later throws/returns false.

handleReady ignores missing/nonactive/released/alreadyready group. Match windowId,
requestId/workspaceKey/sessionId/browserId/browserGeneration/tabId/webContentsId/
(viewportMode??emulated), log '[browser-screenshot-surface] ignored ready with
mismatched identity' on failure. Different frozen sender logs '[browser-screenshot-
surface] ignored ready from a different renderer'. Freeze first identity-matching
sender BEFORE viewport/scale checks using nullish assignment. Retained sameViewport
port receives expected and actual references; failure logs '[browser-screenshot-
surface] ignored ready with unstable viewport'. Scale finite and >0, otherwise
'[browser-screenshot-surface] ignored ready with invalid surface scale'. For requested
unscaled, abs(scale-1)>0.001 logs '[browser-screenshot-surface] ignored ready with scaled
recording surface'. No incoming scaleMode comparison. Mark activity prepared BEFORE
setting ready; if reentry released group during markPrepared, stop. Then set ready,
store actual viewport by reference and scale, delete readyId map, snapshot+clear
requests BEFORE resolving each (clear timer/remove abort listener, then lease).

Request error: delete request from group; if absent ignore. Clear timeout/remove
abort listener; reject SAME error. If not ready and no requests, settle group.
Group error: released ignore; abort invalidationController with SAME error BEFORE
snapshot/clear requests (reentrant abort listeners preserved); clear+reject each
SAME error then settle. Normal group release DOES NOT abort invalidation signal.

Lease uses retained once-release port, adds its callback to group release set,
installs once signal abort listener, and invokes release if already aborted before
return. Return original group invalidation signal; scale readyScale??1; webContentsId
from payload; viewport readyViewport??payload.viewport SAME reference. Release
removes signal listener and callback, no-op if group already released; last lease
settles group. Ready input abort races can return an already released lease.

Settlement latches released=true first. Truthy activity timer cleared/reset;
delete both maps, remove exact queued object. try if prepareSent sendRelease using
retained release-payload port. Catch logs '[browser-screenshot-surface] release send
failed'. finally invoke+clear lease release callbacks; remove activity abort listener;
clear stored listener; activityLease?.release(); clear activityLease. Port throws
and partial state propagate; notably activity release throw can leave active group
latched. After finally, if this group active clear active and activate next only if
not scheduling suspended. Do not improve cleanup to conceal baseline partial state.

Window destruction snapshots guest map, captures suspended flag, sets true, errors
each matching group with 'browser screenshot surface preparation window destroyed';
finally restores flag and activates next only if previously not suspended. dispose
idempotently sets disposed first, snapshots guest groups and errors each with a new
disposed Error. No new constructor cleanup/events, receiver rebinding or helper body.

All diagnostic messages are one-line literals: join prose wrapping without extra whitespace or punctuation. Prefix is exactly [browser-screenshot-surface].
