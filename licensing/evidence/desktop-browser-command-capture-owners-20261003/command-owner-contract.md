# Complete command executor

Output /tmp/knorvia-command44-initial.ts. Imports BrowserCommand/BrowserCommandResult
types from @knorvia/shared; ControlledView type from ./browserCommandTypes.js;
now/readState from ./browserCommandState.js; named interaction/page/Playwright
handler ports declared in ports files. Reexport isAllowedBrowserUrl from state;
reexport BrowserPoint,ControlledView,ControlledViewCdp,ControlledViewWebContents
types from types module. Export async executeBrowserCommandOnView(view:ControlledView,
command:BrowserCommand,opts?:{navigateSettleMs?:number;signal?:AbortSignal})
:Promise<BrowserCommandResult>. No other public owner exports.

Per call read startedAt=now() BEFORE the try/catch (clock throw means rejected
outer promise, not structured fallback). Completion callback accepts
Omit<BrowserCommandResult,'elapsedMs'>, returns {...partial,elapsedMs:now()-startedAt},
so elapsed overwrites any extra supplied field and never clamps. Callback closure
is unique per invocation. Handler returns are passed through by identity without
automatic wrapping or an extra now() call; handlers may call the callback.

Inside try select by command.method. All delegation must await within try so async
rejections are classified there. Use original view, SAME command and SAME completion
callback, with argument/port rules:
- navigate: handleNavigate(view,command,done,SAME opts including undefined).
- getState: handleGetState(view,done), no command argument.
- screenshot/snapshot/evaluate: corresponding page handlers(view,command,done).
- click/type/press/cuaKeypress/scroll/cuaScroll/domCuaScroll/hover/select/check/drag/
  cuaDrag/elementInfo: corresponding interaction handlers(view,command,done).
- playwright: handlePlaywrightAction(view,command.action,done,opts?.signal).
- back/forward/reload: synchronously invoke view.webContents.goBack/goForward/
  reload with normal webContents receiver, then completion {ok:true,state:
  readState(view.webContents)}. No navigation await/promise normalization.
- All other methods complete {ok:false,error:{code:'capability_unsupported',message:
  `command ${command.method} is not supported by executor (available: navigate/getState/back/forward/reload/screenshot/snapshot/click/type/press/scroll/hover/select/check/drag/elementInfo/evaluate)`}}.
  This exact legacy list omits CUA/dom methods but is preserved. No new support for
  fill/waitFor/capabilities/getDialog/handleDialog/close/list/playwrightWaitForTimeout;
  manager owns some of those. No global aborted precheck or skip before dispatch.

Catch error after sync actions/awaited handler work. Cancelled is opts?.signal?.aborted
===true OR error instanceof Error && error.name==='AbortError'. Timeout only if
not cancelled AND instanceof Error AND (name==='TimeoutError' OR message matches
/\b(?:timed out|timeout exceeded)\b/iu). Cancellation precedence wins. Complete
{ok:false,error:{code:cancelled?'cancelled':timedOut?'timeout':'execution_error',
message:cancelled?'Browser command cancelled':error instanceof Error?error.message:
String(error)}}. Preserve non-Error conversion and names; do not treat ordinary
objects with name/message fields as Error. Completion exceptions inside catch can
reject outer promise; no new catch/retry. Successful handlers stay successful even
if signal became aborted. No reimplementation of handlers/readState/url policy.
