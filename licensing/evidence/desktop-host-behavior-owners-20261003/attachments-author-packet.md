# Fresh complete-owner author boundary

You are a fresh internal author in user-authorized G lane. Read only THIS packet, /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect any inherited implementation, tests, dependencies, git/history, specs, config/env, other packets/authors, network or existing drafts. The curator is source-exposed and generated this public API/external behavior contract. No private predecessor helper/state/decomposition/body is supplied. Public names/types/static bindings are compatibility constraints, no novelty requirement or credit. Shared filesystem and instruction-only access limit are not an OS clean room.

Author ONE COMPLETE TypeScript module. Do not execute, format, compile, test, install, or edit repository files. Use ONE literal heredoc to the specified new /tmp draft path, then compute SHA256 only without reopening the draft. Report SHA, intended exports, exact reads, limits and any uncertainties. Correction if requested must be a new complete literal draft using a fresh packet, not reading or transforming an earlier draft. Choose your own private structure/state/helpers. Preserve all described behavior, temporal observation, return/error/object identity and dependency injection. No security changes, real browser/process/files/network/provider/credential/settings/permission operation. Preserve current imports/public signatures. Whole draft will be frozen before curator reads or installs it.

## Output
/tmp/knorvia-host-attachments-author.ts
Complete packages/desktop/src/host/remotePromptAttachments.ts.

## Behavioral contract
- Pure decisions and injected backend exec/upload ONLY; no extra native imports. Remote staging root literal ~/.knorvia-studio/tmp/prompt-attachments; resolved root is absolute HOME with trailing slash removal + /.knorvia-studio/tmp/prompt-attachments. Resolve by backend.exec('printf %s "$HOME"'), attach stdout and stderr data listeners before close callback; concatenate chunk.toString. Close0 success; other codes fail Error remote command failed with exit code <code>: <command> plus ': <stderr>' only when nonempty. Then trim HOME and remove all trailing '/'; require starts '/' else Error remote HOME is not an absolute path. Root '/' becomes empty after removal and errors (compatibility). No onError/polling/extra cleanup listener added.
- For commands that only await success, backend.exec then await onClose; close0 resolves, others Error remote command failed with exit code <code>: <command> (no stderr collection). Exec rejects propagate. No actual commands permitted in author/test; product keeps exact command contract.
- materialize: absent/empty attachments returns shallow spread of ENTIRE input plus uploadedCount0, keeping attachments identity/taskId/traceId/extra runtime properties. Otherwise iterate original array sequentially, original index used in generated filename. Attachment localPath optional trimmed only for nonempty eligibility; actual untrimmed original value used. Missing/blank paths and paths equal to tilde root or starting tilde root+'/' remain same object and don't resolve HOME. Other eligible paths lazily resolve HOME once per materialize call. If path equal to resolved root or starts resolved root+'/' retain same object. Boundary is lexical prefix only, NOT filesystem resolution, dot normalization, realpath, or new policy; do not silently harden. Similar sibling-prefix path NOT admitted.
- Each upload path generated resolvedRoot / sanitized trace / UUID nonce / zero-padded(index+1)-sanitized filename. trace String(traceId),sanitize then slice80 or trace; nonce randomUUID,sanitize then slice64; filename basename split / or backslash, remove empty segments, last or original; sanitize then fallback attachment, slice160. Sanitization NUL -> '-', runs outside [A-Za-z0-9._-] -> '-', strip leading/trailing hyphen, fallback attachment. Dots/underscores preserved. index padStart2 no cap. One UUID per actual upload.
- Before upload, derive parent directory by last slash if index>0 else tilde root. Collect private directories beginning resolved root and every nonempty suffix component leading to parent in order. Exact command: mkdir -p <quoted parent> && command chmod 700 <quoted root and ancestors joined spaces>. quote ALL paths through imported quotePosixPathArg; don't reinvent quoting. Upload(localPath,remotePath,uploadOptions) only if options.uploadOptions truthy; otherwise ONLY2args. Then exact command command chmod 600 <quoted file>. This is existing product permission behavior, NO actual permissions/test transfers.
- If mkdir/upload/chmod fail, attempt cleanupRemotePromptAttachment(backend,remotePath), suppress cleanup failure, then throw NEW Error 远端附件上传失败：<original filename> with cause SAME original error. Earlier uploaded attachments stay staged if later fails; no broad rollback/new semantics. Generated path/root resolution failure before staging block propagates raw, no upload wrapping. Cleanup re-resolves HOME per call, even while first root cached.
- On successful upload shallow-copy attachment preserving all extra fields and changing ONLY localPath. Track old localPath->new path replacement mapping; if duplicate old path uploaded multiple times content uses final map entry. Return uploadedCount, content and attachments only (nonempty case excludes taskId/traceId). If no uploads, attachments is SAME original array; if changed, new array with preserved skipped objects. Content replace paths literally globally via split/join, longest old strings first (stable ties), no escaping/tokenization/URI transformation. No mutation of original input/objects.
- cleanupRemotePromptAttachment always resolve HOME then admit only exact tilde root/resolved root or '/'-bounded prefix. Outside path does nothing after HOME read. Exact admitted delete command rm -f <quoted path> && rmdir <quoted parent> 2>/dev/null || true, await command success. Root itself is admitted; no added restrictions. cleanupStale: default olderThanMinutes1440, minutes Math.max(1,Math.floor(value)) without new NaN/infinity clamps. Exact command if [ -d <quoted root> ]; then find <quoted root> -type f -mmin +<minutes> -delete; find <quoted root> -mindepth 1 -depth -type d -empty -delete; fi.
- Task proxy intercepts string function properties sendPrompt/enqueueTaskCommand. Session proxy only sendPrompt. Proxy get first Reflect.get(target,property,receiver); unselected/nonfunction/symbol returns SAME value unbound. Selected creates fresh async function on EACH get. Called with nonobject/null first arg -> underlying value.apply(target,all args). Object qualification: content typeof string; task id taskId typeof string and truthy, traceId typeof string and truthy. Session: task id sessionId; trace=inputId string nullish-fallback sessionId string; inputId empty string blocks qualification instead of fallback. No trimming. Read content,task,trace in order. Unqualified calls all args unchanged,target receiver,result/rejection untouched via async wrapping.
- Qualified calls await options.materializePromptAttachments({taskId,traceId,content,attachments}) where attachments array only else undefined (property present). Preserve exact original array reference. Next params shallow-copy original and replace content, conditionally add/replace attachments if original has key (including inherited) OR prepared.attachments !== undefined. Invoke original value.call(target,nextParams) with exactly ONE argument even when caller had extras. Capture original value per get so later target replacement doesn't redirect. No method caching/no mutation. Prepared failure prevents service call and propagates same error. Wrappers generic T signature unchanged; private structure unrestricted.

## Body-free public API and imports

```ts
import type { IRemoteBackend, RemoteUploadOptions } from "@knorvia/server/remote";

import { quotePosixPathArg } from "@knorvia/server/remote/posixShell.js";

import type { TraceId, KnorviaPromptAttachment } from "@knorvia/shared";

import { randomUUID } from "node:crypto";

interface RemotePromptAttachmentMaterializeInput {
    taskId?: string;
    content: string;
    traceId: TraceId | string;
    attachments?: KnorviaPromptAttachment[];
}

interface RemotePromptAttachmentMaterializeResult {
    content: string;
    attachments?: KnorviaPromptAttachment[];
    uploadedCount: number;
}

export async function materializeRemotePromptAttachments(input: RemotePromptAttachmentMaterializeInput, options: {
    backend: Pick<IRemoteBackend, "exec" | "upload">;
    uploadOptions?: RemoteUploadOptions;
}): Promise<RemotePromptAttachmentMaterializeResult>;

export async function cleanupRemotePromptAttachment(backend: Pick<IRemoteBackend, "exec">, remotePath: string): Promise<void>;

export async function cleanupStaleRemotePromptAttachments(backend: Pick<IRemoteBackend, "exec">, olderThanMinutes = 24 * 60): Promise<void>;

export function createRemotePromptAttachmentTaskService<T extends object>(service: T, options: {
    materializePromptAttachments: (params: RemotePromptAttachmentMaterializeInput & {
        taskId: string;
    }) => Promise<Pick<RemotePromptAttachmentMaterializeResult, "content" | "attachments">>;
}): T;

export function createRemotePromptAttachmentSessionService<T extends object>(service: T, options: {
    materializePromptAttachments: (params: RemotePromptAttachmentMaterializeInput & {
        taskId: string;
    }) => Promise<Pick<RemotePromptAttachmentMaterializeResult, "content" | "attachments">>;
}): T;
```
