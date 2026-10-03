# Transient retry state/budget owner

Output /tmp/knorvia-retry47-initial.ts. Read common, this file and ports/retry.d.ts.
No imports/new public exports. isTransientScreenshotCaptureError(error): if instanceof
Error use .message else String(error), then case-sensitive .includes('UnknownVizError').
Preserve String/getter throws by identity, no catches or exact-match replacement.

DesktopBrowserScreenshotTransientRetry constructor optional options default new {}
{delayMs?:number,budgetMs?:number,log?(message:string):void}; keep SAME live options
reference, not copy/default normalized fields. Own startedAt optional number initially
undefined, attempts initially0. retryDelayMs returns options.delayMs??100 each call.

schedule(context{target:'owner'|'guest',windowId,webContentsId}): boolean. First
startedAt??=Date.now() (clock only read if timestamp nullish; zero valid), then
increment attempt count unconditionally. Then read Date.now() again, subtract start,
compare >= (live options.budgetMs??2000). Exhausted: optional bound options.log message
'[browser-screenshot-activity] transient capture retry budget exhausted target='+
target+' windowId='+windowId+' webContentsId='+webContentsId+' attempts='+count,
return false. No implicit reset, count still increments on later exhausted calls.
Otherwise optional bound options.log message '[browser-screenshot-activity] transient
capture retry scheduled target='+target+' windowId='+windowId+' webContentsId='+
webContentsId+' attempt='+count+' delayMs='+this.retryDelayMs(), return true. Evaluate
context getters/delay only if optional logger exists, preserve interpolation order
and receiver. No clamp/positive validation, timer/sleep/scheduler/extra fallback.
Logging throws propagate while timestamp/count already updated. reset sets startedAt
undefined then attempts0. Private field names not public API, behavior/data unchanged.
