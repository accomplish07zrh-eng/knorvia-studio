Fresh internal author: read ONLY this packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. User selects substantive whole owners and forbids cosmetic novelty cycles; no novelty requirement, exact behavior/API constraints. Do NOT read source bodies/tests/deps/history/config/env/other outputs/additional repo files; no tests/runtime/typechecks/format/architecture/native/network or repository writes. Explicit scoped user cadence supersedes broad checks in instructions; curator handles them. Write ENTIRE target to designated tmp output using whole literal heredoc/apply_patch; output inspection forbidden except sha256sum. Report exact reads/writes/patch/hash/access limits. Draft copied/frozen/hash-bound before curator review. Retained imports/declarations/constants/error/mode data below uncounted. Curator source-exposed; shared FS not OS isolation. No real data/credentials/PID/files/timers/permissions/security operations.

Target packages/shared/src/node/atomicFileLock.ts; output /tmp/knorvia-lock-atomicFileLock-authored.ts

Substantive complete lock acquisition/reclaim/release owner. Public acquireFileLock API shown. Node fs/path/timer/clock/process/random and observer ports injected only curator; retain imports. ObserveLockInstance=(lockPath:string, lockStat:Stats,observedAt:number)=>number; createLockInstanceObserver returns NEW instance for EACH acquisition, retained actual implementation not authored/tested here. It remembers first observed time for given path/stat identity; replacement resets, never use waiter elapsed time as age. Shared timeout error constant is KNORVIA_FILE_LOCK_TIMEOUT.

Error-code helper returns code ONLY nonnullobject with inherited-or-own code property present and typeofcode string; otherwiseundefined. EEXIST exact. Timestamp admission only number/finite/>=0/<= observedAt + MAX_LOCK_METADATA_CLOCK_SKEW_MS (5*60000); invalidnull. Metadata parse JSON inside catch; createdAt admittedtimestamp, pid positive safeinteger only else null; anyparse/property error returns {createdAt:null,pid:null}. Processalive runs process.kill(pid,0): success true; error ESRCH false, EVERYother error true. No actual processcalls by author/tests.

Owner-file reclaimable sequence: observedAt=Date.now before read; await readFile(ownerFile,'utf-8'), parse metadata. IfcreatedAtnull awaitstatowner, use admittedmtime??observeLockInstance(ownerFile,ownerStat,observedAt). ownerExited=pidnonnull AND !isProcessAlive(pid); ownerlessstale=pidnull AND observedAt-createdAt >= ownerlessGraceMs. Return OR; never age-out live PID. Errors propagate to reclamation caller.

removeAbandonedLock lockfile try: awaitstat. Ifdirectory awaitreaddir, owner names startsWith owner- AND endsWith .json; keepnativeorder. Exactlyoneowner: await ownerreclaimable; falsy=>{removed:false}; else awaitrm ONLYthatowner {force:true}, then awaitrmdir lockdir, {removed:true}; no recursive removal/no tokenbypass. Zero/multiowner: observedAt=Date.now; timestamp=admitted lockStat.mtimeMs??observer(lockFile,stat,observedAt); ifobservedAt-timestamp < grace returnfalse. Checkeach owner awaitreclaimable in order, firstfalse=>false. Ifallvalid awaitPromise.all of rm(join(lockFile,entry),{force:true}) over ALL originalentries thenrmdir true. Newlateowner makesrmdir fail; never remove unobserved newentry. Non-directory legacyfile: first awaitreadFile(lockFile,'utf-8') raw; then awaitownerreclaimable(lockFile) (secondread); false=>false; then thirdread exactbytes equal raw? ifnotfalse; elseawaitrm lockfileforce true=>true. Catch code ENOENT OR ENOTEMPTY=>{removed:false}; ANYothererror=>{removed:false,error} with exactidentity. No policy changes.

Timeout NEW Error exact template `Timed out after ${waitedMs}ms waiting for the Knorvia Studio file lock: ${lockFile}`, typed NodeJS.ErrnoException &cause; assign code timeoutconstant,path ORIGINALfilePath,syscall mkdir,cause ownkey evenundefined; return.

acquire initialization order: lockFile=filePath+'.lock'; token=process.pid+'-'+Date.now()+'-'+Math.random().toString(36).slice(2); ownerFile join(lockFile,'owner-'+token+'.json'); payload JSON.stringify({pid:process.pid,createdAt:Date.now(),token})+'\n' EXACTkeyorder; startedAt=Date.now; effectiveGrace=Math.min(Math.max(ownerlessGraceMs,0),Math.max(Math.floor(maxWaitMs/2),0)); newobserver; lastRemovalErrorundefined. No clamping/validationextra of maxwait/NaN/Infinity/delay. Attemptcounter starts0 monotonicincrements EACHloop including immediate reclaim-success continue.

Eachattempt createdLock=false; try awaitmkdir(lockfile), marktrue, awaitstatcreated, awaitwriteFileowner payload {encoding:'utf-8',flag:'wx'}, awaitstatcurrent, awaitreaddircurrentfilterowners. Ownershipvalid only currentdev===createddev AND ino===createdino AND count===1 AND soleownername===ownname. Invalid=>throw Object.assign(newError EXACT Knorvia Studio file lock ownership changed during acquire,{code:EEXIST}). Success return NEW async releaseclosure: awaitrm OWNownerforce swallowingall via catch; thenawaitrmdir lockdir swallowingall. Closure notmemoized; everycall triescleanup; don'tremoveotherowner orrecursivecleanup.

Catchattempt: ifcreatedLock awaitrmownownerforceswallow, thenrmdirlockswallow BEFOREerrorclassification. lostCreatedLock=createdLock ANDgetcodeerror===ENOENT; ifnotEEXIST AND !lost =>rethrow sameerror (no staleattempt). Thenelapsed=Date.now()-startedAt. Ifelapsed>=maxWait: if lastRemovalError code EACCES/EPERM throwLASTsameerror; else timeoutcause CURRENTmkdir/ownershiperror. IMPORTANT reacheddeadline never runs stale reclaim. Otherwise awaitremoveAbandonedLock(lockfile,effectiveGrace,observer); ifremoved continue immediately to nextattempt, no sleep; ifremovalAttempt.error truthy remember exacterror (retain previous ifnoerror). remaining=Math.max(maxWaitMs-elapsed,0) useselapsedBEFOREreclaim, don'trecomputeclock. IfretryDelaysMs.length===0 OR remaining===0: lastpermissionerror wins; elsetimeoutcause=lastRemovalError??currenterror. Otherwise delay=retryDelaysMs[Math.min(attempt,len-1)]??remaining; await sleep(Math.min(delay,remaining)); nextloop. Sleeperror outside acquisitiontry/catch propagates. No realFs/PID/random/time/timer operation validated; fakeonly. Preserve uniqueinstance ownership and ordering, not forced near-line differences.

Retained declarations/API/static data (no inherited function bodies):
```ts
import { KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE } from "../errors.js";

import { mkdir, readFile, readdir, rmdir, rm, stat, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { setTimeout as sleep } from "node:timers/promises";

import { createLockInstanceObserver, type ObserveLockInstance } from "./lockInstanceObserver.js";

const MAX_LOCK_METADATA_CLOCK_SKEW_MS = 5 * 60000;

interface FileLockMetadata {
    createdAt: number | null;
    pid: number | null;
}

interface LockRemovalAttempt {
    removed: boolean;
    error?: unknown;
}

export async function acquireFileLock(filePath: string, retryDelaysMs: readonly number[], ownerlessGraceMs: number, maxWaitMs: number): Promise<() => Promise<void>>;
```
