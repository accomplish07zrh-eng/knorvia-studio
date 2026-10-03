# Complete Cron manual-claim lifecycle owner

Use ports/cron.d.ts for the four exported signatures; imported shared types are the two unions in ports/shared.d.ts. No import runtime is needed from @knorvia/shared; keep this boundary type-only. All repository, params and logger object/error identities remain opaque. Public async functions return Promise<void>; heartbeat returns a fresh object with dispose():void. No scheduler/task subscription/admission/state is introduced here.

## Heartbeat: startManualClaimHeartbeat

At invocation, register one referenced setInterval callback with intervalMs ?? 60000, passing explicit zero/negative/NaN unchanged. No immediate renewal, deadline calculation, deduplication, validation, unref or abort policy. Registration failures propagate synchronously. Return a fresh dispose object; each dispose calls clearInterval with that exact original token, including zero, without an idempotency guard. Disposal prevents future scheduling only; it does not cancel an already launched touch promise or silence its callback.

Each interval tick reads the current params.repo and calls its touchManualClaim method bound to that repo with current params.automationId then params.workspaceKey. Immediately call the returned object's .catch method bound to that object. Do not await, Promise.resolve-normalize, catch synchronous touch/catch failures, or add an async callback: such failures remain synchronous to the timer callback, and void discards only the final catch result. On rejected renewal the catch callback reads the current params.logWarn and calls it bound to params, with the exact message below and the original rejection object. Logger or identifier-conversion failure follows the catch promise's existing rejection behavior; no extra catch. A disposed heartbeat may still log an already pending failure. All params and repo/logger properties are live at their original phases; never snapshot them at registration.

Exact failure message interpolation:
`续租 manual automation claim 失败 automation=${params.automationId} runId=${params.runId}`

## Outcome record: recordCronRunOutcomeBestEffort

One guarded sequential flow: await current repo.ensureRunClaimed(params), forwarding the exact entire params object, including extra properties; only after fulfillment call/await current repo.markRunOutcome(current runId, current outcome, current error). The second repo and identity fields are reread after the await; no frozen snapshot or cloned request. Both repo methods are bound calls. The guard covers property reads, method invocation and awaiting both operations. Failure prevents remaining operation and calls current params.logWarn bound to params with original error and exact message below. A successful logger swallows the repository failure; a logger or message-conversion throw rejects the public function. No release, retry, cancellation, status coercion or finally cleanup in this export.

Exact failure message:
`回写定时任务运行结果失败 automation=${params.automationId} runId=${params.runId}`

## Failed manual dispatch: settleManualDispatchFailureBestEffort

First derive errorMessage outside any repository guard: error instanceof Error ? error.message : String(error), using current dispatchError. The instanceof case reads dispatchError again for .message, and the non-Error case reads it again for String. No type/name fallback. Conversion/property failures reject before any repo call, logger or release. Otherwise, in a guard call/await current repo.markRunDispatch with a fresh object whose field order is runId, dispatchStatus, error, values current runId, exact "failed_to_dispatch", derived errorMessage. Bound repo receiver. If it fails, call current params.logWarn bound to params with exact dispatch-write message and original failure. Successful warning permits the subsequent release; a warning/message throw rejects and prevents release.

After successful dispatch recording or successfully warned recording failure, perform the release flow below using live params after the await. Do not throw dispatchError itself on success, mutate it, mark a terminal outcome, or add finally-based release. The original caller-owned dispatch error remains unchanged.

Exact dispatch-write warning:
`回写 manual automation 派发失败状态失败 automation=${params.automationId} runId=${params.runId}`

## Release flow (behavioral port; no required private decomposition)

In a guard, call/await current repo.releaseManualClaim(current automationId, current workspaceKey), bound to repo. Failure calls current params.logWarn bound to params with original failure and exact release message. Successful warning swallows the release failure; warning/message failure rejects. No retry/lease validation/alternate identity/unconditional finally. No cloning or caching current params across preceding awaits.

Exact release warning:
`释放 manual automation claim 失败 automation=${params.automationId} runId=${params.runId}`

## Terminal outcome: settleCronRunTerminalOutcome

First await the same outcome-record behavior using exact params. Only after that fulfilled result read current params.trigger. If it is not exact "manual", return without release. If exact manual, perform release flow. The public outcome type excludes "running"; do not add runtime guards/validation, so injected unchecked data follows the same original calls. Current trigger may be mutated by repo/warning during the preceding await, and that live value decides release. Outcome failure with successful warning still permits manual release. Outcome logger failure rejects before trigger/release; release logger failure rejects. Do not change claim authority, terminal admission, cancellation or A's scheduler policies. The host consumer owns actual terminal subscription and heartbeat disposal; this owner does not acquire that state.

Public field/string types and declaration shape are authoritative. Fixed strings/status/default interval, retained normal glue and any normalized expression/body matches gain zero new independence credit. Runtime/error timing compatibility is required without private-helper-name/layout compatibility claims.
