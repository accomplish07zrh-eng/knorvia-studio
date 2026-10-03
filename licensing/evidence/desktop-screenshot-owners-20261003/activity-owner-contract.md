# Complete screenshot activity controller contract

Output /tmp/knorvia-screenshot-activity-initial.ts. Import type ActivityLease from
./browserScreenshotSurfaceContracts.js, retry class and classifier from
./browserScreenshotTransientRetry.js; bootstrap function/grace constant/types from
./browserTransparentWindowBootstrap.js. Declarations in ports/*.d.ts, implementations
are retained ports. Export only DesktopBrowserScreenshotActivityController class.
Constructor options live reference: fromId(windowId:number):WindowForActivity|null;
fromWebContentsId(id:number):GuestForActivity|null; allowTransparentWindowBootstrap?,
hideTaskbarDuringTransparentWindowBootstrap?, log?(message:string):void. Public only
acquire({windowId:number,webContentsId:number,requestId:string,reason:'browser-screenshot'})
:ActivityLease|undefined. Keep parameter/return types and imported base window type.

Map key `${windowId}:${webContentsId}` owns state: tokens symbol=>{prepared}, restore
generation, active flag, invalidationController, bootstrap?, pump permission/start
timer?, owner+guest runtimes {running,wakeDelay?,transientRetry}. One shared rect
object {x:0,y:0,width:1,height:1} used in every capture call; guest pacing200ms.
Shared outcome objects successful {ok:true}, fatal {ok:false,transient:false},
transient {ok:false,transient:true}. Do not inline retained retry or bootstrap policy.

acquire existing inactive state is deleted then treated missing. For new state,
resolve targets: fromId first; require window, !window.isDestroyed(),
!window.webContents.isDestroyed(); then fromWebContentsId; require guest,
!guest.isDestroyed(), guest.id===requested id and guest.hostWebContents?.id===owner.id.
Invalid returns undefined and logs '[browser-screenshot-activity] acquire skipped
windowId=${windowId} webContentsId=${id} requestId=${requestId}'. Call bootstrap with
SAME window, enabled:allow===true, windowId/id/requestId, hideTaskbarDuringBootstrap:
hideOption===true, log:options.log. false means undefined acquisition. Truthy
bootstrap means pumps initially disallowed; undefined means allowed. Create owner
then guest retry instances with {log:options.log}; map state BEFORE scheduling grace,
and schedule grace BEFORE registering token. Reusing active state increments restore
generation, resets owner retry then guest retry. Symbol(requestId) token unprepared;
wake owner then guest; ensure pumps owner then guest only if allowed. Return same
invalidation signal plus closure markPrepared/release.

markPrepared no-op if released/token missing/alreadyprepared; set prepared=true,
maybe release bootstrap, wake then ensure pumps. release once latches closure before
releaseToken. releaseToken requires map identity and actual token deletion; wakes
pumps, if other tokens remain return. Increment generation, queueMicrotask checks
same map state/no tokens/same generation. Then active=false, release bootstrap,
wake pumps, delete only if map still same state. Normal release DOES NOT abort
signal. Rapid reacquire before queued microtask cancels old stop via generation.

Pump modes: !active or tokens empty=>stopped. Any token unprepared=>continuous for
both; all prepared=>owner stopped, guest paced. ensure checks allowed/running/mode,
then void run pump without new catch. Runtime running=true, initial start time
Date.now(), initial captureOnce promise BEFORE try. while pending:
- stopped: await pending; failed outcome invalidates activity; clear pending, loop.
- continuous: start NEXT probe and its start time BEFORE awaiting current (max2).
  Current fatal failure invalidates then continue with SAME current pending; do not
  adopt/drain NEXT, which may never finish. Current transient failure delegates
  recover with NEXT then sets pending=recovered?.pending; preserve prior
  pendingStartedAt (do not update). Current success resets retry, adopts NEXT,
  updates pendingStartedAt=next start, waits wakeable zero timer if still continuous.
- paced: await pending; failure invalidates then clear pending; success clear
  pending, wait remaining max(0,200-(Date.now()-start)) only if guest still paced
  and remainder nonzero. If stopped after wait continue; otherwise set new start,
  capture once.
finally clears wakeDelay, running=false, restarts only if mode not stopped.

recover continuous transient must await NEXT. NEXT success resets retry and returns
an OBJECT {pending:captureOnce(...)} (do not return promise directly and assimilate).
NEXT fatal or retry.schedule({target,windowId,webContentsId}) false invalidates,
returns undefined. Otherwise wakeable wait retry.retryDelayMs() unless stopped;
check stopped again, else return object with a new capture. Do not start retry
before draining both transient probes. Fatal fail-fast does not wait on NEXT.

captureOnce resolves targets again outside capture try, invalid target=>sharedfatal.
try await targets[target].capturePage(SAME global rect), sharedsuccess. catch log
'[browser-screenshot-activity] capture failed target=${target} windowId=${windowId}
webContentsId=${id} error=${error instanceof Error?error.message:String(error)}';
classifier port chooses sharedtransient/fatal. Port exceptions propagate.

Wakeable timer promise: set settled=false; finish once sets true, clears timer,
clears runtime.wakeDelay only if same finish, resolves. Arm timer then assign
wakeDelay=finish. Wake invokes owner then guest wakeDelay. No sync timer assumption.
Continuous zero turn only if still continuous; retry wait only if not stopped.

invalidate no-op if inactive/no tokens; active=false, release bootstrap, wake,
delete if same map state, abort same controller (if not already) with new Error
'browser screenshot activity capture failed for ${target}'. Tokens are retained.
release bootstrap clears truthy grace timer/reset, invokes bootstrap?.release(),
then clears bootstrap (throws not caught). Grace scheduling only if bootstrap:
on timer clear stored handle, check active+mapidentity, allow pumps, ensure owner
then guest, then maybe release bootstrap. maybeRelease only if allowed and every
token prepared; otherwise return. Mark prepared before grace does not start owner.
No dispose/public methods, input validation or policy normalization beyond above.
