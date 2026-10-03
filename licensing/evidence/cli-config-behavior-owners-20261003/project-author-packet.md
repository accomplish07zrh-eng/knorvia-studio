# Complete config project owner

Read ONLY this packet and these instructions: /workspace/knorvia-studio/AGENTS.md, /workspace/knorvia-studio/apps/cli/AGENTS.md, /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md.
Do not inspect any other source, tests, dependencies, history, config, environment, prior drafts or other authors. No network, execution, formatter, builds or repository writes. Choose private structure freely; no novelty requirement. Public declarations/imports below are contract exposure, not implementation-body exposure.
Write ONE complete TypeScript module using ONE literal quoted heredoc (or one apply_patch) to the assigned /tmp output. Do not assemble, copy or transform file fragments. Then compute SHA256 only; do not reopen or execute the draft. Keep whole owner under 400 nonblank/noncomment lines without extraction. Use imported types and preserve runtime schema checks. Report exact reads/writes/exposure and limitations. Zero accepted independence/MIT credit pending parent review.
Preserve property ordering, references, sync/async evaluation and raw failure identity. No added containment/security/permissions policies. Synthetic injected validation belongs to curator; no actual HOME/config/credentials/file writes.

Assigned output: /tmp/knorvia-cli-config-project-author.ts

## Public declarations and permitted imports

import { basename, dirname, isAbsolute, resolve } from "node:path";
import type { McpServerConfig, RuntimeConfigPatch } from "@knorvia/contracts";
import { createWorkspaceHookSourceInput, discoverWorkspaceHookConfigPaths, workspaceHooksConfigSchema, type WorkspaceHookSourceInput, } from "@knorvia/shared/workspace-hook-discovery";
import { loadFileConfig, type LoadedConfig } from "./file-config.adapter.js";
export interface ProjectConfigFile {
    baseDir: string;
    config: RuntimeConfigPatch;
    diagnostics: LoadedConfig["diagnostics"];
    hookCandidate?: WorkspaceHookSourceInput;
    loaded: boolean;
    path: string;
}
export interface ProjectConfigDiscovery {
    files: ProjectConfigFile[];
    diagnostics: LoadedConfig["diagnostics"];
    hookCandidates: WorkspaceHookSourceInput[];
    loaded: boolean;
    paths: string[];
    mcpServerNames: string[];
}
export function loadProjectConfigs(workingDirectory?: string, explicitProjectConfigPath?: string): ProjectConfigDiscovery;
export function loadProjectConfigFile(path: string, options: {
    discoveryOrder?: number;
    explicitProjectConfig?: boolean;
    workingDirectory?: string;
} = {}): ProjectConfigFile;
export function summarizeProjectConfigs(files: ProjectConfigFile[]): ProjectConfigDiscovery;

## External behavior

Ports: loadFileConfig(path)->LoadedConfig; discoverWorkspaceHookConfigPaths({workingDirectory,explicitProjectConfigPath?})->ordered refs {path,explicitProjectConfig}; createWorkspaceHookSourceInput({path,workingDirectory,hooks,discoveryOrder,explicitProjectConfig})->WorkspaceHookSourceInput; workspaceHooksConfigSchema.parse(hooks) mandatory runtime validation.
loadProjectConfigs resolves workingDirectory??process.cwd() (emptystring passed), include explicitProjectConfigPath only truthy. Discover once then load refs in order with discoveryOrder=index,explicitProjectConfig=ref value,workingDirectory=resolvedcwd; summarize.
loadProjectConfigFile calls loadFileConfig once; baseDir dirname(result.path), but if basename(that)===".knorvia-studio" its parent. Copy diagnostics. Hooks only loaded AND config.hooks truthy; append {code:"config_project_hooks_pending_trust",filePath:result.path,message:"Project hooks are pending workspace trust and remain blocked",path:"hooks",severity:"warning"}. Never enable/trust.
Return ordered {baseDir,config,diagnostics,...optional hookCandidate,loaded,path}. Failed config={},no candidate. Loaded config copy, remove only truthy hooks; falsey hooks retained. If mcp.servers truthy clone mcp/server map; nonstdio server exact ref; stdio clone fields and cwd=server.cwd??"." unchanged absolute else resolve(baseDir,cwd). Empty cwd resolves; no containment policy. Other fields refs preserved. Config normalization evaluated BEFORE schema.parse. Candidate only truthy hooks: parse then createWorkspaceHookSourceInput({path,workingDirectory:resolve(options.workingDirectory??baseDir),hooks:parsed,discoveryOrder:options.discoveryOrder??0,explicitProjectConfig:options.explicitProjectConfig}), include undefined key. Raw errors propagate.
summarize: diagnostics ALL files incl failed; files loaded exact refs; candidates loaded truthy refs; loaded boolean; paths loaded; MCP names Set encounter/Object.keys order. No writes/mutation.
