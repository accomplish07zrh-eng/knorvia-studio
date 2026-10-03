# Fresh complete-owner boundary

User explicitly authorizes this selected G owner. Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No inherited implementations, tests, dependency bodies, git/history, other packets/authors, config/env/network/previous drafts. Curator had selected inherited-source exposure and generated public API/external behavior facts. No predecessor private helper/state/decomposition/body is supplied. Names/types/static vocabulary are constrained contract data, no novelty requirement or credit.

Produce ONE complete TypeScript module with ONE literal heredoc to the stated fresh /tmp path, then SHA256 computation ONLY without reopening. No repo edits, test/execution/format/compile/install/network or actual host/process/browser/SSH/userfile/permission operations. Choose private structure freely. Report exact reads, whole-draft SHA, exports and uncertainty; ask curator for missing public-port facts before guessing. Later corrections require a fresh complete packet and new whole literal file, no previous draft reads/transforms. Shared filesystem access is instruction-limited, not OS clean-room certification.

## Output
/tmp/knorvia-host-recording-author.ts
Complete packages/desktop/src/host/browserRecordingArtifactMaterializer.ts.

## External behavior
- Public function is async and returns shallow artifact copy changing ONLY path; retain all other data/reference identities. No native operations in author/tests; existing fs/remote imports will be entirely injected.
- Branch on input.remoteSessionId truthiness. Remote branch requires input.remoteBackend, otherwise Error remote Browser recording materialization is unavailable for this session BEFORE output normalization/validation. No fallback to local IO.
- Remote workspace normalize backslashes to '/' with posix.normalize. Output raw segments split on runs of forward/back slashes. Reject if ANY raw segment equals '..', '.', or empty; OR normalized output equals '..', starts '../', or is posix.isAbsolute. Error recording outputPath must stay inside the remote workspace. Do not add stronger policies: original remote branch doesn't require absolute workspacePath and doesn't resolve remote filesystem. Both raw validation and normalized path semantics preserved. Require normalized output case-insensitive endsWith .webm else Error recording outputPath must end with .webm. Then target posix.join(normalizedWorkspace,normalizedOutput); await live input.remoteBackend.upload(input.localPath,target) with two args and backend receiver. Return {...input.artifact,path:target}; artifact read at return time after await. Preserve original upload rejection/error identity and no cleanup/local fs.
- Local branch: root resolve(workspacePath); target resolve(root,outputPath); relation relative(root,target). Reject if relation empty, startsWith('..') (also rejects legitimate names like ..name), OR resolve(root,relation)!==target. Error recording outputPath must stay inside the workspace. Require case-insensitive .webm else same extension error. Validation relies on imported platform path semantics, no new native realpath/permissions/security checks. Source localPath isn't separately constrained.
- Local order: await mkdir(dirname(target),{recursive:true}) BEFORE staging UUID and staging try/finally. Staging target + '.knorvia-studio-recording-' + randomUUID() + '.tmp'. Inside caught cleanup lifecycle await copyFile(input.localPath,staging); await rm(target,{force:true}); await rename(staging,target). Destructive target removal is existing cross-platform replacement behavior; do not alter ordering/semantics. Finally ALWAYS await rm(staging,{force:true}).catch(()=>undefined), suppress rejected cleanup promise, original copy/remove/rename failure propagates by identity. A synchronous cleanup invocation throw remains raw and can override prior failure (don't broaden catch). mkdir/UUID failures before staging lifecycle don't perform staging cleanup. After successful cleanup return shallow input.artifact copy plus final path, reading live artifact after await. No added fs checks, atomicity claims or actual execution.

## Body-free public declarations and imports

```ts
import { copyFile, mkdir, rename, rm } from "node:fs/promises";

import { dirname, posix, relative, resolve } from "node:path";

import { randomUUID } from "node:crypto";

import type { IRemoteBackend } from "@knorvia/server/remote";

import type { BrowserRecordingArtifact } from "@knorvia/shared";

export async function materializeBrowserRecordingArtifact(input: {
    artifact: BrowserRecordingArtifact;
    localPath: string;
    outputPath: string;
    workspacePath: string;
    remoteSessionId?: string;
    remoteBackend?: Pick<IRemoteBackend, "upload">;
}): Promise<BrowserRecordingArtifact>;
```
