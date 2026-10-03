# Complete video transaction owner

Output /tmp/knorvia-video45-initial.ts. Import rm/stat from node:fs/promises, join
from node:path; type BrowserRecordingArtifact/BrowserViewportSize from @knorvia/shared.
Public declarations in ports/video.d.ts/shared.d.ts. Export interfaces factory
input/session, factory type and async recordBrowserVideo(input):Promise<Artifact>.
No new public exports. Keep optional callbacks and method/property forms per declarations.

Before try compute outputPath=join(input.tempRoot,`${input.recordingId}.webm`) and
capture now=input.now??Date.now. No sanitation/clock clamp beyond rules below. Local
session initially undefined and completed flag false. At abort checkpoints, if
input.signal.aborted throw NEW DOMException('Browser recording cancelled','AbortError'),
not signal.reason. Checkpoints: before factory, after awaited factory, after awaited
scenario, after awaited stop. No new check after stat or earlier output path derivation.

Inside try createRecorder receiver is input; pass NEW object with outputPath,
targetFrame SAME, viewport SAME, fps and signal SAME. Await session. Read captured
now() immediately after postfactory abort check to start duration. Invoke live
input.onPhase?.('capturing'), await live input.executeScenario() with input receiver.
Check abort. Compute durationMs=max(0,round(now()-start)). Then onCaptureComplete?.()
BEFORE onPhase?.('finalizing') BEFORE awaiting session.stop(). This releases surface
watchdog before final-chunk flush. Callback throws enter finally as ordinary failures.

Poststop abort check then await stat(outputPath). Require isFile() true and size!==0
(not >0 rule), else Error 'Browser recording produced an empty WebM artifact'. Set
completed=true BEFORE constructing return object. Return {path:outputPath,mimeType:
'video/webm',width:input.viewport.width,height:input.viewport.height,fps:input.fps,
durationMs,frameCount:max(1,round((durationMs/1000)*input.fps))}. Preserve live input
reads after stat; extra errors during artifact construction occur after completed flag.

finally only if !completed: await optional session.cancel().catch(()=>undefined),
then await rm(outputPath,{force:true}).catch(()=>undefined). Promise rejection is
swallowed independently; synchronous throws/accessor throws aren't newly normalized,
can prevent later cleanup. Original scenario/factory/stop/stat errors otherwise
propagate by identity. Success performs no cancel/rm. No new retries, disposal waits,
empty-header validation or persistent state.
