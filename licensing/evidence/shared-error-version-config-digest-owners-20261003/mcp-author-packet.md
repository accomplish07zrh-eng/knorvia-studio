# Complete owner API and behavior packet

Exact target: packages/shared/src/mcp.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-mcp-config-authored/mcp.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import type { SettingsDirectoryLocation } from "./settings-source.js";

import type { McpServerFailureKind } from "./protocol/index.js";

export type McpSource = "mcp" | "knorviaagentmcp";

export type CliMcpSource = Exclude<McpSource, "mcp">;

export type McpScope = "common" | "user" | "workspace";

export type McpFileFormat = "json";

export interface McpServerConfig {
    type?: string;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
    http_headers?: Record<string, string>;
    oauth?: McpOAuthConfig;
    apiKey?: string;
    projectId?: string;
    issueType?: string;
    personalAccessToken?: string;
    fileId?: string;
    nodeId?: string;
    organizationName?: string;
    projectName?: string;
    dsn?: string;
    apiEndpoint?: string;
    [key: string]: any;
}

export type McpServerStatus = "connected" | "disconnected" | "error" | "connecting" | "unknown";

export interface CliMcpConfig {
    mcpServers: Record<string, McpServerConfig>;
    projects: Record<string, Record<string, McpServerConfig>>;
}

export interface SaveCliMcpToUserDirectoryRequest {
    action: "upsert" | "delete" | "set-enabled";
    source: CliMcpSource;
    name: string;
    config?: McpServerConfig;
    enabled?: boolean;
    projectPath?: string;
    location?: SettingsDirectoryLocation;
}

export interface NativeMcpFileReference {
    format: McpFileFormat;
    filePath: string;
}

export interface NativeMcpServerRecord {
    source: McpSource;
    scope: McpScope;
    name: string;
    config: McpServerConfig;
    enabled?: boolean;
    projectPath?: string;
    location?: SettingsDirectoryLocation;
    file?: NativeMcpFileReference;
}

export interface LoadCliMcpFromUserDirectoryRequest {
    workspacePath?: string;
}

export interface LoadCliMcpFromUserDirectoryResult {
    servers: NativeMcpServerRecord[];
}

export interface MigrateLegacyCommonMcpRequest {
    legacyStorageDir?: string;
}

export interface MigrateLegacyCommonMcpResult {
    servers: Record<string, McpServerConfig>;
    sourcePath?: string;
    totalCount: number;
    importedCount: number;
    skippedCount: number;
}

export interface McpConfig {
    mcp: {
        mcpServers: Record<string, McpServerConfig>;
    };
    knorviaagentmcp: CliMcpConfig;
}

export interface KnorviaMcpServer {
    id: string;
    name: string;
    config: McpServerConfig;
    enabled: boolean;
    changed?: boolean;
    status?: McpServerStatus;
    lastConnected?: Date;
    error?: string;
    failureKind?: McpServerFailureKind;
    serverRequestId?: string;
    toolCount?: number;
    authorization?: {
        type: "oauth_authorization_code";
        authorizationUrl: string;
        startedAt: string;
    };
    source: McpSource;
    projectPath?: string;
    scope: McpScope;
    location?: SettingsDirectoryLocation;
    file?: NativeMcpFileReference;
}

export interface McpServerListItem {
    id: string;
    name: string;
    enabled: boolean;
    status: McpServerStatus;
    hasConfig: boolean;
    error?: string;
    toolCount?: number;
    source: McpSource;
    projectPath?: string;
    scope: McpScope;
    file?: NativeMcpFileReference;
}

export interface McpTestResult {
    success: boolean;
    error?: string;
    tools?: Array<{
        name: string;
        description?: string;
        input_schema?: any;
    }>;
    serverInfo?: {
        name: string;
        version: string;
    };
    response_time?: number;
}

export type KnorviaAgentMcpServer = {
    name: string;
    command: string;
    args: string[];
    env: Array<{
        name: string;
        value: string;
    }>;
    isolation?: "session" | "workspace";
    protocolVersion?: "legacy" | "auto" | "2026-07-28";
    timeoutMs?: number;
} | {
    name: string;
    type: "http" | "sse";
    url: string;
    isolation?: "session" | "workspace";
    protocolVersion?: "legacy" | "auto" | "2026-07-28";
    headers: Array<{
        name: string;
        value: string;
    }>;
    oauth?: McpOAuthConfig;
    timeoutMs?: number;
};

export interface McpClientCredentialsOAuthConfig {
    type: "client_credentials";
    clientId: string;
    clientSecret: string;
    clientName?: string;
    scope?: string;
}

export interface McpAuthorizationCodeOAuthConfig {
    type: "authorization_code";
    clientId?: string;
    clientSecret?: string;
    clientName?: string;
    redirectPath?: string;
    scope?: string;
}

export type McpOAuthConfig = McpAuthorizationCodeOAuthConfig | McpClientCredentialsOAuthConfig;

export function getMcpServerRequestHeaders(config: McpServerConfig): Record<string, string> | undefined;

export function isKnorviaCuaMcpCommand(command: string): boolean;

export function isKnorviaCuaMcpPackageArg(value: string): boolean;

export function convertToKnorviaAgentMcpServer(name: string, config: McpServerConfig): KnorviaAgentMcpServer | null;
```

Complete behavior owner with unchanged publictypes/constants, no reimplementation credit for declaration-only surface. Retainexactconstants KNORVIA_CUA_OFFICIAL_PLUGIN_ID='computer-use@knorvia-plugins-bundled', KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME='plugin:computer-use:computer-use', KNORVIA_PLUGIN_ID_ENV_KEY='KNORVIA_PLUGIN_ID'. No actual credential/env/native/server/auth actions. Platform probing exists in conversion, but testsyntheticonly; author neverexecuteprobe. PreserveallAPIdeclarations/imports frompacket (any indexsignature intentionallyretained).
getMcpServerRequestHeaders(config) returnsSAMEconfig.headers??config.http_headers reference, empty{}authoritative, noredaction/merge/coercion. CUAargleaf: stripall trailingbackslash/slash /[\\/]+$/ then split /[\\/]/ last ??originalvalue; nopathnormalize/trim/lower. Package candidate normalizeALL'_' to'-'; recognize EXACT 'cua' ORprefix 'cua[','cua@','cua==','cua.'; case-sensitive, no knorvia-prefix aliases despite legacy comment, no'-'suffixaccept(cua-proxyfalse). Command andarg predicates both candidatewhole ORleaf using shortcircuit; detectpaths/gitURLasstrings, no URL/network/process operations. Preserve existing classification/securityboundary without hardening or claimingpolicychange.
convert: inferredType=config.type; ifFALSY prefertruthyconfig.command=>stdio elsetruthyurl=>http. If inferredTypeexactstdio ANDcommandtruthy, stdiobranch. Otherwise if urltruthy ANDinferredTypetruthy, HTTPbranch eventypeunknown orstdio withmissingcommand; sseonlywheninferredtype==='sse', elsehttp. Otherwise null. Command/args stdio first config.command,config.args||[] (ifprovidedarrayretainSAMEref unlessunwrapped). Windows detection (typeofprocess!=='undefined' && process.platform==='win32') OR (typeofnavigator!=='undefined' && /win/i.test(navigator.platform)), bothpossiblehostglobals; no otherenv. Windowsonly: lowercasecommand exactlycmd/cmd.exe (notpath/trimming), args[0] EXACT '/c', args[1] truthy =>command=args[1],args=args.slice(2), no inputmutation. Onotherplatformdon'tunwrap. Chinese doublewrapper rationale.
STDIOreturn{name,command,args,env}, envtruthyconfig.env=>Object.entries own enumerableorder.map({name:key,value}),elsedistinct[]; do not stringcoerce values. HTTPreturn{name,type:http|sse,url,headers}, headerporttruthy=>same ownorderedentryconversion freshpair objects,else[]. All branches optional timeoutMs onlytypeofnumberinteger>0 (Infinityfalse,numericstringsdeny), isolation exactlysession/workspace, protocolVersion exactlylegacy/auto/2026-07-28; fieldsinvalidomit, no defaults. HTTPONLY OAuth ifrecordobjectnon-nullnonarray and valid: client_credentials type requiresclientId/Secrettypeofstring trimnonempty, optionalclientName/scope undefinedORstring; authorization_code optionclientId/Secret/clientName/redirectPath/scope undefinedORstring (emptyallowed), no requiredID. UnknownOAuthextra fields permitted, acceptedoauthSAMEobjectreference, no normalization/trim/secrets read beyond predicate, STDIOneveroauth. Invalidoptional valuesomittedwithoutinvalidatingremainingserver. No nestedclone/redaction/trust/runtimeIO. Do notaddactualconfigurationflags/permissions. Fixed DTO/type/optional/schema/regex expressionsmayrecur; no novelty/MIT.

No numeric similarity threshold/novelty requirement. Complete behavior authoring preserves public data declarations/constants uncounted. Report required expression/structure recurrence honestly without inherited-source comparison.
