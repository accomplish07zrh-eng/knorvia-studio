# Remote-cache preparation and initial-request refresh qualification

These are functional clarifications for root's separate cache owner. No predecessor body or implementation patch is supplied, no root source is integrated into E and the frozen packet remains unchanged.

## Local preparation before artifact request

For a component download, first create the cache's `staging` directory recursively. Next create the selected unique component staging directory's `extract` child recursively; this also creates the unique staging directory. Both preparations must resolve successfully before the first artifact fetch. The archive path is `component.tar.gz` beside `extract`, but no empty archive file is opened before fetch. Once local preparation succeeds, request the artifact, log the chosen successful URL, stream to the archive, verify its SHA, extract into the already prepared child, require nonempty output, write the ready marker and commit.

If either preparation fails, no artifact request begins. In the predecessor, these preparations also precede the download/extract cleanup-protected operation; no subsequent stage cleanup is attempted by that operation for their failures. The original packet omitted the explicit pre-request gate, as recorded in E's static review. Preserve that omission as chronology; any root correction is separately bound to its frozen author draft.

## Refresh caller versus the kind of initial task

Two overlapping calls that start/join initial refresh-designated work share that request. At an empty cache, the initiating request is refresh-designated when it is a public refreshManifest=true fetch or uses the applicable cached-result refresh-decision callback (the content-addressed ensure policy). Its registration must identify it as active refresh work even before a retained manifest exists.

A different sequence remains intentional: an initial ordinary non-refresh fetch is pending; a refreshManifest=true caller then arrives. That caller waits for the initial ordinary task. On a nonnull result, if no refresh has started while it waited/decided, it starts one refresh rather than treating the initial non-refresh request as the requested refresh. Other refresh callers share that refresh. On null there is no retained result to refresh; the call returns null and later calls can retry. If the pending ordinary task rejects, that error propagates. A refresh that starts while a caller waits is joined.

Thus the published review's initial duplicate-request defect is bounded to initial work that should already have been refresh-designated, not a rule forbidding an ordinary initial fetch followed by one requested refresh. Ordinary selected-component ensure without the content-addressed refresh policy should not acquire that callback/designation solely for implementation convenience.
