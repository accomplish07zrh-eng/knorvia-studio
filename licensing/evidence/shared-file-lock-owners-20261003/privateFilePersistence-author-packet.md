Fresh internal author: read ONLY this packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. User selects substantive whole owners and forbids cosmetic novelty cycles; no novelty requirement, exact behavior/API constraints. Do NOT read source bodies/tests/deps/history/config/env/other outputs/additional repo files; no tests/runtime/typechecks/format/architecture/native/network or repository writes. Explicit scoped user cadence supersedes broad checks in instructions; curator handles them. Write ENTIRE target to designated tmp output using whole literal heredoc/apply_patch; output inspection forbidden except sha256sum. Report exact reads/writes/patch/hash/access limits. Draft copied/frozen/hash-bound before curator review. Retained imports/declarations/constants/error/mode data below uncounted. Curator source-exposed; shared FS not OS isolation. No real data/credentials/PID/files/timers/permissions/security operations.

Target packages/shared/src/node/privateFilePersistence.ts; output /tmp/knorvia-lock-privateFilePersistence-authored.ts

Substantive whole process-local FIFO/private persistence/retry owner. Retain imports/default constants/public SharedFileLockOptions/API shown; processFileLockTails per-path module state owner, one queue only; no consumer integration. getErrorCode nonnullobject/inherited code present/string only otherwiseundefined. Rename retry predicate EPERM OR EBUSY OR EACCES exactcase. renameWithRetry loopattempt0: awaitrename temp->file returns; catch delay=retryDelaysMs[attempt], ifundefined OR errornotretryable throw SAMEerror; otherwise await sleep(delay), attempt++; no extra clamp/noEEXISTretry, sleepfailurepropagates.

withFileLock<T>(filePath,operation,options={}): previousTail=map.get(filePath)??Promise.resolve; create NEW currentTail Promise<void> and obtain releaseProcessQueue resolver; map.set path currentTail BEFOREawaitpreviousTail. AwaitpreviousTail before try. Intry awaitmkdir(dirname(filePath),{recursive:true}); awaitacquireFileLock(filePath,options.lockRetryDelaysMs??DEFAULT_LOCK_RETRY_DELAYS_MS,options.lockOwnerlessGraceMs??DEFAULT_LOCK_OWNERLESS_GRACE_MS,options.lockMaxWaitMs??DEFAULT_LOCK_MAX_WAIT_MS). Store releasefn; return awaitoperation(). Outerfinally innertry awaitreleaseLock?.(); innerfinally ALWAYSreleaseProcessQueue(); delete map path ONLY ifmap.get(path)===currentTail (laterqueuedtailmustremain). Preserve releaseerror overridingoperationerror/result butqueue alwaysprogresses; failedmkdir/acquire stillreleasesFIFO; samepathserialized, distinctpathindependent; argument/operation/result/erroridentity. No validation of options or filename normalization. Defaultdata exact. No global scheduler change.

atomicWritePrivateTextFile(filePath,content,renameRetryDelaysMs=DEFAULT_RENAME_RETRY_DELAYS_MS): directorydirname; temp join(directory,'.'+basename+'.'+process.pid+'.'+Date.now()+'.'+Math.random().toString(16).slice(2)+'.tmp') computedBEFOREmkdir; awaitmkdir(directory,{recursive:true}) OUTSIDEtry; try awaitwriteFile(temp,content,{encoding:'utf-8',mode:0o600}), awaitrenameWithRetry; catchawaitrmtemp{force:true}.catch ignore thenRETHROW ORIGINALerror. Success no rm extra; no explicitwx, nochmod/noextraFs flush/hardening. Mkdirmisfailure no cleanup. Content exact callerbytes; filemode existing policy unchanged.

backupCorruptFile(filePath): awaitreadFile(filePath) noencoding rawbytes. createHash('sha256').update(content).digest('hex').slice(0,24) contentId; backup=filePath+'.corrupt-'+id+'.bak'; tryawaitwriteFile(backup,content,{flag:'wx',mode:0o600}); catch ONLYgetcodeEEXIST ignore, others SAMEerrorthrow. After successfulwrite OR EEXIST awaitchmod(backup,0o600); returnpath. No actualcredentialfile/mode/securityoperation by author/tests. Stable fakebytes used, no actual native hash proof. Preserve mode/corrupt evidence policy notchangingpermissions. Fixed FS/hash/name vocabulary and retry values retained constraints/uncredited, whole FIFO/retry/error lifecycle authored.

Retained declarations/API/static data (no inherited function bodies):
```ts
import { createHash } from "node:crypto";

import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { basename, dirname, join } from "node:path";

import { setTimeout as sleep } from "node:timers/promises";

import { acquireFileLock } from "./atomicFileLock.js";

const DEFAULT_LOCK_RETRY_DELAYS_MS = [25, 50, 100, 200, 400] as const;

const DEFAULT_LOCK_OWNERLESS_GRACE_MS = 100;

const DEFAULT_LOCK_MAX_WAIT_MS = 8000;

const DEFAULT_RENAME_RETRY_DELAYS_MS = [50, 100, 200, 400, 800] as const;

const processFileLockTails = new Map<string, Promise<void>>();

export interface SharedFileLockOptions {
    lockRetryDelaysMs?: readonly number[];
    lockOwnerlessGraceMs?: number;
    lockMaxWaitMs?: number;
}

export async function withFileLock<T>(filePath: string, operation: () => Promise<T>, options: SharedFileLockOptions = {}): Promise<T>;

export async function atomicWritePrivateTextFile(filePath: string, content: string, renameRetryDelaysMs: readonly number[] = DEFAULT_RENAME_RETRY_DELAYS_MS): Promise<void>;

export async function backupCorruptFile(filePath: string): Promise<string>;
```
