# Complete transparent presentation owner

Output /tmp/knorvia-bootstrap45-initial.ts. No imports. Export public window/bootstrap
interfaces, TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS=100, and function
startBrowserScreenshotTransparentWindowBootstrap(options):Bootstrap|false|undefined
per ports/bootstrap.d.ts. No new exports. This owner does not arm a timer itself.

Capture win=options.win once. Early return undefined if !options.enabled OR
win.isVisible?.()!==false OR win.isMinimized?.()===true (short circuit order).
Require truthy isFocused,getOpacity,setOpacity,showInactive,hide,on,removeListener,
and if options.hideTaskbarDuringBootstrap truthy require setSkipTaskbar. Missing=>
log exact '[browser-screenshot-activity] transparent bootstrap unavailable windowId=${windowId} webContentsId=${webContentsId} requestId=${requestId}', return false.
No extra initial destroyed check. Try originalOpacity=win.getOpacity() with win
receiver; failure logs '[browser-screenshot-activity] transparent bootstrap opacity read failed windowId=${windowId}', false. Do not normalize opacity.

One released latch and taskbarHidden latch initially false. Single internal release
(preserveVisibility): if released return; latch true BEFORE all cleanup. try remove
focus listener using optional win.removeListener; catch log '[browser-screenshot-activity] transparent bootstrap listener cleanup failed windowId=${windowId}'. Then
win.isDestroyed() outside catch; true returns. try if !preserveVisibility AND
!win.isFocused?.() =>win.hide?.(); catch log '[browser-screenshot-activity] transparent bootstrap hide failed windowId=${windowId}'. finally if !win.isDestroyed():
try win.setOpacity?.(originalOpacity); catch log '[browser-screenshot-activity] transparent bootstrap opacity restore failed windowId=${windowId}'. If taskbarHidden:
try win.setSkipTaskbar?.(false); catch log '[browser-screenshot-activity] transparent bootstrap taskbar restore failed windowId=${windowId}'. Preserve logs throwing,
destroyed checks throwing and ordinary finally propagation; no global catch.

Focus callback invokes release(true), preserving visibility. Setup try: if truthy
hideTaskbar option, optional setSkipTaskbar(true), THEN taskbarHidden=true. Next
win.setOpacity(0), win.on('focus',same callback), win.showInactive(), all bound win
calls. Reentrant focus during setup may latch released; do not add guards after it.
Catch setup failure calls release(true) FIRST, then logs '[browser-screenshot-activity] transparent bootstrap failed windowId=${windowId} webContentsId=${webContentsId} requestId=${requestId}', returns false. Cleanup throw can escape before failure log.
On setup success return {release:()=>release(false)}; repeat release/focus idempotent.
Once focus takes ownership, later release must never hide again. No visibility/
taskbar/opacity writes outside this existing order, no retained-helper inlining.
