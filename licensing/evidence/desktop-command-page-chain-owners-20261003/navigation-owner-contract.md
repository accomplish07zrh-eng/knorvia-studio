# Navigation/state lifetime owner

Output /tmp/knorvia-navigation47-initial.ts. Read common, this file, ports/navigation.d.ts,
ports/shared.d.ts, ports/view.d.ts. Imports types BrowserPageState from @knorvia/shared
and ControlledViewWebContents from ./browserCommandTypes.js only. Retain public
exports/types; class BrowserNavigationTimeoutError extends Error, instance own name
'BrowserNavigationTimeoutError', inherited Error constructor/identity. Default10000.

isAllowedBrowserUrl: exact rawUrl==='about:blank' true; otherwise try new URL(rawUrl),
true only protocol exactly 'http:' OR 'https:'; catch false. No custom parser,
additional schemes/about variants, base URL/coercion/permission policy change.
now():Date.now() once. readState calls bound wc.getURL/getTitle/canGoBack/canGoForward
sequentially in that order, each separate synchronous try/catch fallback '', '',
false,false. Preserve actual returned values/identities; no Promise/coercion,
combined catch or receiver loss. Return object field order url/title/canGoBack/
canGoForward. Missing method fails that field only via same catch.

settleNavigation(loadPromise,timeoutMs,signal?): async Promise<void>:
initial signal?.aborted => fresh DOMException('aborted','AbortError') before timer/
listener, do not use reason or repair unhandled input rejection. Create timeout
promise first, set referenced timer at raw timeoutMs rejecting new exported error
class('Navigation timed out after '+timeoutMs+'ms'). Create abort promise second:
assign onAbort function rejecting fresh fixed abort DOMException; signal?.addEventListener
('abort',same callback,{once:true}) bound signal. No extra signal recheck/race repair.
try await Promise.race([loadPromise,timeout,aborted]) in that exact order, original
load rejection identity. finally if timer TRUTHY clearTimeout; if callback truthy
signal?.removeEventListener('abort',same callback) after timer clear. Preserve token0
nonclear, original callback binding/registration errors, cleanup override boundaries;
no catch/retry/unref/budget validation/promise normalizer. Constructors/methods same.
