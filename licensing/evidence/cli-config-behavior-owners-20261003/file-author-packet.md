# Complete config file owner

Read ONLY this packet and these instructions: /workspace/knorvia-studio/AGENTS.md, /workspace/knorvia-studio/apps/cli/AGENTS.md, /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md.
Do not inspect any other source, tests, dependencies, history, config, environment, prior drafts or other authors. No network, execution, formatter, builds or repository writes. Choose private structure freely; no novelty requirement. Public declarations/imports below are contract exposure, not implementation-body exposure.
Write ONE complete TypeScript module using ONE literal quoted heredoc (or one apply_patch) to the assigned /tmp output. Do not assemble, copy or transform file fragments. Then compute SHA256 only; do not reopen or execute the draft. Keep whole owner under 400 nonblank/noncomment lines without extraction. Use imported types and preserve runtime schema checks. Report exact reads/writes/exposure and limitations. Zero accepted independence/MIT credit pending parent review.
Preserve property ordering, references, sync/async evaluation and raw failure identity. No added containment/security/permissions policies. Synthetic injected validation belongs to curator; no actual HOME/config/credentials/file writes.

Assigned output: /tmp/knorvia-cli-config-file-author.ts

## Public declarations and permitted imports

import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { RuntimeConfigPatch, UiLocale } from "@knorvia/contracts";
import { z } from "zod";
import { CANONICAL_CUA_PLUGIN_ID, canonicalizePluginId, LEGACY_CUA_PLUGIN_ID, parseConfigFileToRuntimePatchWithDiagnostics, pluginIdAliases, type ConfigDiagnostic, } from "./schema.js";
interface FileConfigOptions {
    baseDir?: string;
    configFileName?: string;
}
export interface LoadedConfig {
    config: RuntimeConfigPatch;
    diagnostics: ConfigDiagnostic[];
    path: string;
    loaded: boolean;
}
export interface UiLocalePatchResult {
    locale: UiLocale;
    path: string;
}
export interface PluginEnabledPatchResult {
    enabled: boolean;
    path: string;
    pluginId: string;
}
export interface PluginOptionsPatchResult {
    clearedOptionKeys: string[];
    options: Record<string, string | number | boolean>;
    path: string;
    pluginId: string;
}
export interface PluginRemovePatchResult {
    path: string;
    pluginId: string;
    removedEnabled: boolean;
    removedOptions: boolean;
}
export function resolvePath(path: string): string;
export function loadFileConfig(filePath?: string, options: FileConfigOptions = {}): LoadedConfig;
export async function updateUiLocaleInFileConfig(filePath: string, locale: UiLocale): Promise<UiLocalePatchResult>;
export async function updatePluginEnabledInFileConfig(filePath: string, pluginId: string, enabled: boolean): Promise<PluginEnabledPatchResult>;
export async function enablePluginsByDefaultInFileConfig(filePath: string, pluginIds: readonly string[]): Promise<{
    enabledIds: string[];
    path: string;
}>;
export async function updatePluginOptionsInFileConfig(filePath: string, pluginId: string, options: Record<string, string | number | boolean>, clearOptionKeys: string[] = []): Promise<PluginOptionsPatchResult>;
export async function removePluginFromFileConfig(filePath: string, pluginId: string): Promise<PluginRemovePatchResult>;
export async function removePluginEnabledFromFileConfig(filePath: string, pluginId: string): Promise<{
    path: string;
    pluginId: string;
    removedEnabled: boolean;
}>;
export interface SuppressedBuiltinPatchResult {
    path: string;
    pluginId: string;
    suppressed: boolean;
}
export async function addSuppressedBuiltinInFileConfig(filePath: string, pluginId: string): Promise<SuppressedBuiltinPatchResult>;
export async function removeSuppressedBuiltinInFileConfig(filePath: string, pluginId: string): Promise<SuppressedBuiltinPatchResult>;
export function getDefaultConfigPath(): string;
export function hasDefaultConfigFile(): boolean;

## External behavior

DEFAULT base computed at module evaluation join(resolveKnorviaDataRoot(),"cli"), filename "config.json".
resolvePath("~/...") joins homedir(),path.slice(2); otherwise resolve(path), including literal "~". No containment. getDefaultConfigPath joins resolvePath(default base),filename; hasDefaultConfigFile existsSync.
loadFileConfig(filePath?,options={}): truthy path resolvePath, else join(resolvePath(options.baseDir??defaultBase),options.configFileName??defaultFilename). existsSync OUTSIDE catch. Missing ordered {config:{},diagnostics:[],path,loaded:false}. Existing try readFileSync(path,"utf-8"),JSON.parse,potential migration best-effort sync save, then retained parseConfigFileToRuntimePatchWithDiagnostics(ORIGINAL parsed value), not migrated. Success {config:result.config,diagnostics:result.diagnostics.map(clone add filePath:diag.filePath??path),path,loaded:true}. Catch read/parse/migration-computation/schema error -> {config:{},diagnostics:[{code:"config_file_invalid",filePath,message,severity:"error"}],path,loaded:false}. Message z.ZodError first: issues path.length?path.join("."):"<config>", then ": "+message, joined "; "; else Error.message else "Unable to parse config file.".
Migration nonarray object root/plugins only. enabledPlugins/options records: exact LEGACY_CUA_PLUGIN_ID replaced by CANONICAL_CUA_PLUGIN_ID; keep existing canonical whenever !==undefined inclfalse/null, delete legacy, preserve others. suppressedBuiltins array map exact legacy ->canonical leave other types/duplicates; compare JSON.stringify values for change. Return migrated copy only changed; NEVER mutate original passed parser.
Migration save temp=filePath+".migrate."+process.pid+"."+Date.now()+".tmp", time outside try. try writeFileSync(temp,JSON.stringify(value,null,2)+"\n",{encoding:"utf-8",mode:0o600}),renameSync(temp,path); catch best-effort unlinkSync(temp),swallow cleanup too. No mkdir. Schema still follows.
Async patches resolvePath then readJsonOrEmpty except enable-empty only resolve no I/O. readFile(path,"utf-8") catch new Error("Unable to read config file: "+path,{cause:raw}); JSON.parse catch new Error("Unable to parse config file as JSON: "+path,{cause:raw}); non-record Error("Config file must contain a JSON object: "+path). Record any nonnull object notarray. Missing {} ONLY when wrapper instanceof Error, cause instanceof Error AND "code" in cause AND cause.code==="ENOENT"; others rethrow SAME wrapper.
Atomic save await mkdir(dirname(path),{recursive:true}) BEFORE try; then temp=join(dir,"."+basename(path)+"."+process.pid+"."+Date.now()+"."+Math.random().toString(16).slice(2)+".tmp"), content=JSON.stringify(value,null,2)+"\n" BEFORE try. try awaitwriteFile(temp,content,{mode:0o600}),awaitrename(temp,path); catch awaitunlink(temp).catch(()=>undefined),throw new Error("Unable to write config file: "+path,{cause:raw}). mkdir/path/serialization errors RAW/no cleanup. Ports are virtual in tests; no permission/settings change.
Preserve unknown root/plugin/ui keys and unrelated maps; record fields else {}. ALWAYS save locale,enabled,options even equal. Return original id, caller options/clear array refs, property order per public signatures.
locale clone root/ui setlocale.
enabled canonicalize(id),aliases(canonical),clone enabled map deleteallaliases,setcanonical boolean; preserve options.
enable-default exact ids NOcanonical, select not OWN-property (false/undefined owned count), preserve duplicate selected ids, assign true via Object.fromEntries. Emptyinput/no selected =>NOsave.
options canonicalize/aliases(canonical), currentcanonical record evenempty else aliases[1]record else{}; deletealiases fromouteroptions map, filter current entries by clearset then spread caller options (mayre-addcleared); setcanonical. preserve maps/unknowns.
remove-whole aliases(original), flags some(id INmap) including inherited keys; clone/deletealiases enabled+options; save only eitherflag. Return {path,pluginId,removedEnabled,removedOptions}.
remove-enabled aliases(original), OWN-property flag; falseNOsave;true clone/delete onlyenabled, options preserved. Return {path,pluginId,removedEnabled}.
add-suppressed canonicalize/aliases(canonical),current array filter typeofstring else[],retained excludesaliases. Preserve exact NOsave condition retained.length===current.length ANDcurrent.includes(canonical); elseappendcanonical/save even already present. Return suppressed:true originalid.
remove-suppressed aliases(original),filteredstringcurrent,removealiases; no save if next.len===current.len;elsesavefilterednext. Return suppressed:false originalid.
