# Complete config factory owner

Read ONLY this packet and these instructions: /workspace/knorvia-studio/AGENTS.md, /workspace/knorvia-studio/apps/cli/AGENTS.md, /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md.
Do not inspect any other source, tests, dependencies, history, config, environment, prior drafts or other authors. No network, execution, formatter, builds or repository writes. Choose private structure freely; no novelty requirement. Public declarations/imports below are contract exposure, not implementation-body exposure.
Write ONE complete TypeScript module using ONE literal quoted heredoc (or one apply_patch) to the assigned /tmp output. Do not assemble, copy or transform file fragments. Then compute SHA256 only; do not reopen or execute the draft. Keep whole owner under 400 nonblank/noncomment lines without extraction. Use imported types and preserve runtime schema checks. Report exact reads/writes/exposure and limitations. Zero accepted independence/MIT credit pending parent review.
Preserve property ordering, references, sync/async evaluation and raw failure identity. No added containment/security/permissions policies. Synthetic injected validation belongs to curator; no actual HOME/config/credentials/file writes.

Assigned output: /tmp/knorvia-cli-config-factory-author.ts

## Public declarations and permitted imports

import { resolve } from "node:path";
import type { ConfigPort, HookConfigSource, LoggerFactory, McpServerConfig, RuntimeConfig, RuntimeConfigPatch, WorkspaceHookBundleSnapshot, } from "@knorvia/contracts";
import { ConfigScope, DefaultRuntimeConfig, createWorkspaceHookBundleSnapshot, } from "@knorvia/contracts";
import { buildWorkspaceHookBundleSnapshot, resolveWorkspaceHookRuntimeRoot, type WorkspaceHookRuntimeRoot, } from "@knorvia/shared/workspace-hook-discovery";
import { createConfigPort } from "./index.js";
import { loadFileConfig, getDefaultConfigPath, type LoadedConfig } from "./file-config.adapter.js";
import { parseEnvConfig } from "./env-config.adapter.js";
import { mergeConfigs, createPrioritizedConfig } from "./config-merger.js";
import { createNodeLoggerFactory } from "../logging/index.js";
import { loadProjectConfigFile, loadProjectConfigs, summarizeProjectConfigs, type ProjectConfigDiscovery, type ProjectConfigFile, } from "./project-config.adapter.js";
export interface ConfigFactoryOptions {
    userConfigPath?: string;
    projectConfigPath?: string;
    workingDirectory?: string;
    workspaceIdentity?: string;
    env?: Record<string, string | undefined>;
    cliOverrides?: RuntimeConfigPatch;
    skipUserConfig?: boolean;
    loggerFactory?: LoggerFactory;
}
export interface ConfigResult {
    configPort: ConfigPort;
    config: RuntimeConfig;
    sources: {
        user: {
            diagnostics: LoadedConfig["diagnostics"];
            path: string;
            loaded: boolean;
            hasMcpServers: boolean;
            hasUiLocale: boolean;
            hasUiTheme: boolean;
            mcpServerNames: string[];
        };
        project: {
            diagnostics: LoadedConfig["diagnostics"];
            path: string | undefined;
            paths: string[];
            loaded: boolean;
            hasUiLocale: boolean;
            hasUiTheme: boolean;
            hasMcpServers: boolean;
            mcpServerNames: string[];
            uiLocalePath: string | undefined;
            uiThemePath: string | undefined;
            workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
            workspaceHookRuntimeRoot?: WorkspaceHookRuntimeRoot;
        };
        plugins: PluginConfigSources;
        mcp: {
            serverSources: Record<string, McpServerConfigSource>;
        };
        env: boolean;
        cli: boolean;
    };
}
export type McpServerConfigSource = "system" | "project" | "user" | "env" | "cli";
export type PluginConfigScope = "user" | "workspace";
export interface PluginConfigSources {
    dirs: {
        user: string[];
        workspace: string[];
    };
    enabled: Record<string, PluginConfigScope>;
    marketplaces: Record<string, PluginConfigScope>;
    options: Record<string, Record<string, PluginConfigScope>>;
    paths: {
        user: string;
        workspace: string | undefined;
    };
}
export function createConfig(options: ConfigFactoryOptions = {}): ConfigResult;
export function resolveWorkspaceStorageDir(input: {
    env?: Record<string, string | undefined>;
    workingDirectory: string;
}): string;

## External behavior

Allowed ports/import names in public contract: createConfigPort(merged).getAll(); parseEnvConfig(env); loadFileConfig(userPath); loadProjectConfigs(cwd,path); loadProjectConfigFile(path,options); summarizeProjectConfigs(files); merger; hook discovery/build/schema snapshot; createNodeLoggerFactory. Raw errors propagate preserving receiver/order.
createConfig order:
1 System DefaultRuntimeConfig priority. User skip truthy->{config:{},diagnostics:[],path:getDefaultConfigPath(),loaded:false}, ignore suppliedpath;else loadFileConfig(options.userConfigPath). Loadeduser append User priority with hook-source tag {kind:"user",path}. Tag ONLY if hooks.events truthy, else sameconfigref. Clone config/hooks/events; event matchers optional map preserving undefined;clone matcher/hooks; hook.source??providedsource preserving existingref.
2 Project workingDirectory truthy->loadProjectConfigs(cwd,projectPath);else projectPath truthy->summarize([loadProjectConfigFile(path,{discoveryOrder:0,explicitProjectConfig:true})]);else summarize([]). Use discovery files/diagnostics.
3 Log NOW userdiagnostics thenproject before projectmerge/env/hook operations. No diagnostics=>no loggercreated. Else options.loggerFactory??createNodeLoggerFactory({env:options.env}),createLogger("knorvia").child({module:"adapters.config"}). Each warn(message,{configPath:filePath,configScope:user|project,diagnosticCode:code,diagnosticMessage:message,diagnosticPath:path,event,severity}), include undefinedkeys. code config_mcp_server_invalid message "MCP server config skipped",event "config.mcp_server.skipped"; config_project_hooks_pending_trust message "Project hooks pending workspace trust",event "config.project_hooks.pending_trust";else "Config file failed to load","config.file.invalid".
4 Project effective metadata/plugin summary: nofiles->{config:{},diagnostics:[],path:undefined,loaded:false};else config=mergeConfigs(...files asProject),diagnostics flatmap,path last?.path,loaded:true. UI locale/theme path last reversefile whose config.ui?.locale/theme!==undefined. Append each projectconfig asProject nohooktag.
5 env=parseEnvConfig(options.env??process.env); keys>0 append tagged internal hooks Env. Truthy cliOverrides append tagged internal hooks Cli evenempty{}. flags envkeys>0,cli!!.
6 runtimeRoot=resolveWorkspaceHookRuntimeRoot([DefaultRuntimeConfig.hooks,userResult.config.hooks,...discovery.hookCandidates.map(c=>c.hooks),env.hooks,options.cliOverrides?.hooks]); includeunloadeduserhooks ifportprovided. workspacePath=resolve(options.workingDirectory??process.cwd());identity=options.workspaceIdentity?.trim()||path. buildWorkspaceHookBundleSnapshot({workspaceIdentity,workspacePath,sources:discovery.hookCandidates,runtimeRoot});truthydata=>createWorkspaceHookBundleSnapshot.
7 merged=mergeConfigs(...allconfigs). Pluginmetadata ONLY user/projectsummary, notenv/cli/default: dirs user/project dirs??[] refs;enabled scopes userkeys thenworkspacekeys evenfalse;marketplaces ONLYuserkeys;options perplugin/peroption scopes userthenworkspace. PlainobjectmapJS keybehavior. paths user.path/projectsummary.path.
8 MCP separate priority system,PROJECT,USER,ENV,CLI. Object.entries(patch?.mcp?.servers??{}) lastserver exactref/map source. Includesuserconfig evenunloaded;projectsummaryconfig. merged.mcp={...merged.mcp,servers:effective}. Other config precedence system/user/project/env/cli.
9 configPort=createConfigPort(merged),return{configPort,config:configPort.getAll(),sources} declarationkeyorder. user diagnostics/path/loaded,presence flags mcp.servers/ui.locale/ui.theme!==undefined (empty mapcounts),names Object.keys. Project diagnostics discoveryref, path summary.path,paths discovery.pathsref,loadedsummary,presenceflags fromsummary,mcpServerNames discoveryref,UI sourcepaths above,optional snapshot onlytruthy,workspaceHookRuntimeRoot ALWAYSkey evenundefined. Thenplugins,mcp:{serverSources},env,cli.
resolveWorkspaceStorageDir: firstcreateConfig({env:input.env}).config.storage.dir no cwd/skip;thenloadProjectConfigs(input.workingDirectory),lastnonnull file.config.storage?.dir;thenparseEnvConfig(input.env??process.env).storage?.dir. Return env??project??base no truthiness/no write.

## Superseding body-free contract correction

Use createPrioritizedConfig(config,scope) and exact internal source {kind:"internal"} for both environment and CLI; no label or other fields. User source remains {kind:"user",path:userResult.path}. ConfigScope public members are System,User,Project,Env,Cli.
The initial whole draft is frozen. You are authorized ONE NEW WHOLE literal heredoc/apply_patch at /tmp/knorvia-cli-config-factory-correction-1.ts. Do not reopen or transform the predecessor; author the whole module from packet and your own design. SHA only afterward. Read only this correction packet and three previously permitted instructions. No further source/tests/execution/network/repository writes.
