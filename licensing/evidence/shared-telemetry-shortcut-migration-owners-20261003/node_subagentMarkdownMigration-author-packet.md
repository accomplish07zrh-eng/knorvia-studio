Fresh internal author: read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No source bodies/tests/deps/history/config/env/other outputs/additional repository reads. User explicitly defers ordinary validation; do NOT run architecture/runtime/tests/typechecks/formatting/network/native operations or write repository. Author entire target file at designated tmp path using whole literal heredoc or apply_patch. Do not inspect/re-read output (sha256sum permitted). Report exact read/write/patch/hash/access limits. Whole draft frozen/hash-bound before curator review. No novelty requirement; exact public declarations/static data below retained uncounted. Curator source-exposed; shared filesystem not OS isolation. No user data/credentials/account/Library/native IO/security actions.

Target packages/shared/src/node/subagentMarkdownMigration.ts; output /tmp/knorvia-telemetry-node_subagentMarkdownMigration-authored.ts

Whole atomic legacy-state/Markdown migration lifecycle owner, with exact imports/result interface/public APIs retained. All actual operations run ONLY curator in-memory fake ports; author no file/native/userrootaction. Private migrateFile(path,transform) sequence: await lstat initial; !isFile=>false; return withFileLock(path,async cb). In lock: await lstat again; !isFile OR (mode & 0o222)===0=>false; await readFile(path,'utf8'); next=transform(original) synchronously; if next===original=>false; directory=dirname(path); physicalDirectory=await realpath(directory); temp=join(directory,'.'+basename(path)+'.'+randomUUID()+'.tmp'). Enter try: await writeFile(temp,next,{flag:'wx',mode:before.mode & 0o777}), await chmod(temp,before.mode &0o777), awaitlstatpath current; reject if !current.isFile OR current.ino!==before.ino OR current.dev!==before.dev OR (await realpath(directory))!==physicalDirectory OR (await readFile(path,'utf8'))!==original, preserving left-to-right short-circuit IO. Throw NEW Error EXACT Subagent file changed during migration. Ifallpass await rename(temp,path), true. finally ALWAYS await rm(temp,{force:true}), includingwrite/chmod/CAS/renamefailure; cleanupfailureoverridesexistingreturn/error exactly. No extraCASmode/linkchecks/retry/ownflag/permissionchange. Beforetry failures don'tcleanup; locks delegatedexistingport.

migrateSubagentStateFile wraps awaitmigrateFilepath JSONtransform. JSON.parseoriginal unknown; falsy/nonobject/array=>original unchanged. next=importSubagentStateSelections(parsed record); compactJSON.stringify(next)===JSON.stringify(parsed)?original:JSON.stringify(next,null,2). Preserve call order and stringifyerrorbehavior; no JSONrewritewhencompactequal, no newvalidation. Catch: instanceof SyntaxError OR error.code===ENOENT =>return, othersrethrow sameobject; keep existing code property lookup behavior (no newdefensivefallback). migrateUserSubagentMarkdown returnsfresh{migrated:[],failures:[]}; recurse depthfirst directory. Each visit outertry awaitlstatdir;if !isDirectory=>return (symlinksnotfollowed); awaitreaddir(dir,{withFileTypes:true}), iterateentryorder, path=join(dir,entry.name). if entry.isDirectory recurseawait; else if entry.isFile AND regex /\.(md|markdown)$/iu matches name then innertry awaitmigrateFile(path,migrateSubagentMarkdownProvider), iftrue pushpath; catchpush{path,error} exactidentity and continue. Outer errors ENOENT ignored elsepush{path:directory,error}; traversal result orderingdepthfirst, no parallel/missingrootfailure, directorieslinksneverentered. PublicJSONmissing/syntaxsilent, MarkdownfileSyntaxErrorfailurecollected (no blanketignore). Mode/identity/trustguard literals andfsoptions retained required compatibility constraints, not counted as newsecuritypolicy. No actual user data/credentials/permissions/securitysettings changes.

Retained API/static declarations (behavior owner bodies removed):
```ts
import { randomUUID } from "node:crypto";

import { chmod, lstat, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";

import { basename, dirname, join } from "node:path";

import { migrateSubagentMarkdownProvider } from "../subagent-markdown-selection.js";

import { importSubagentStateSelections } from "../subagent-state-migration.js";

import { withFileLock } from "./privateFilePersistence.js";

interface SubagentMarkdownMigrationResult {
    migrated: string[];
    failures: Array<{
        path: string;
        error: unknown;
    }>;
}

export async function migrateSubagentStateFile(path: string): Promise<void>;

export async function migrateUserSubagentMarkdown(userRoot: string): Promise<SubagentMarkdownMigrationResult>;
```
