import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  createAgentStateId,
  type AgentDiagnostic,
  type AgentsCapability,
  type AgentSummary,
} from "@knorvia/shared";
import { migrateSubagentStateFile, migrateUserSubagentMarkdown } from "@knorvia/shared/node";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import {
  builtInNames,
  exists,
  readProfiles,
  savedProfile,
  validateConfig,
} from "./subagentServiceFiles.js";
import { discoverPlugins } from "./subagentServicePlugins.js";
import { normalizeSubagentModelSelection } from "./subagentModelSelection.js";
import {
  migrateDisabledAgentId,
  readState,
  writeState,
  type AgentsStateFile,
} from "./subagentServiceState.js";
import type { ISubagentsService } from "./subagents.js";
import {
  resolveSubagentStateFile,
  resolveUserSubagentRoot,
  resolveWorkspaceSubagentRoot,
  type SubagentStorageOptions,
} from "./subagentStorage.js";

interface SubagentsServiceOptions extends SubagentStorageOptions {
  isDesktopRuntime?: boolean;
}

const logger = createServiceLogger("subagents");

function builtIns(state: AgentsStateFile): AgentSummary[] {
  return builtInNames.map((name): AgentSummary => {
    const modelSelection = state.builtInModelSelectionOverrides[name];
    const general = name === "general-purpose";
    return {
      id: createAgentStateId({ name, scope: "built-in", source: "built-in" }),
      name,
      description: general
        ? "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks."
        : "Read-only search agent for broad fan-out searches.",
      color: general ? "blue" : "cyan",
      injectAgentsMd: general,
      tools: general
        ? ["*"]
        : ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"],
      modelSelection,
      modelSelectionOverride: modelSelection,
      systemPrompt: "",
      path: "built-in:" + name,
      scope: "built-in",
      source: "built-in",
      enabled: true,
      readOnly: true,
    };
  });
}

function workspaceDirectory(workspacePath?: string): string {
  if (!workspacePath?.trim()) {
    throw new Error("Workspace path is required for workspace subagents");
  }
  return resolveWorkspaceSubagentRoot(workspacePath.trim());
}

export function createSubagentsService(options?: SubagentsServiceOptions): ISubagentsService & {
  prepareRuntimeState(): Promise<void>;
} {
  const storageOptions = { homeDir: options?.homeDir };
  let tail = Promise.resolve();
  function queued(callback: () => Promise<void>): Promise<void> {
    const pending = tail.then(callback, callback);
    tail = pending.catch(() => {});
    return pending;
  }
  function capability(): AgentsCapability {
    const available = options?.isDesktopRuntime ?? Boolean(process.env.KNORVIA_PROCESS_LABEL);
    return available
      ? { userScopeAvailable: true }
      : { userScopeAvailable: false, userScopeReason: "desktop_only" };
  }
  return {
    async prepareRuntimeState() {
      const migration = await migrateUserSubagentMarkdown(
        await resolveUserSubagentRoot(storageOptions),
      );
      for (const failure of migration.failures) {
        logger.warn(undefined, "用户 Subagent Markdown 迁移失败，保留原文件", failure);
      }
      await queued(async () => {
        return migrateSubagentStateFile(await resolveSubagentStateFile(storageOptions));
      });
    },
    async list(params) {
      const access = capability();
      const mode = params.mode ?? "allRuntimeScopes";
      const diagnostics: AgentDiagnostic[] = [];
      if (access.userScopeAvailable) {
        const migration = await migrateUserSubagentMarkdown(
          await resolveUserSubagentRoot(storageOptions),
        );
        for (const failure of migration.failures) {
          diagnostics.push({
            code: "agent_read_failed",
            message: "Subagent Markdown migration failed; original file preserved",
            path: failure.path,
          });
        }
      }
      const state = await readState(storageOptions);
      const builtIn = builtIns(state);
      const workspacePath = params.workspacePath;
      const userRoot = access.userScopeAvailable
        ? await resolveUserSubagentRoot(storageOptions)
        : undefined;
      const workspaceRoot =
        mode === "allRuntimeScopes" ? resolveWorkspaceSubagentRoot(workspacePath) : undefined;
      const user =
        userRoot !== undefined
          ? await readProfiles(userRoot, "user", workspacePath, diagnostics)
          : [];
      const workspace =
        workspaceRoot !== undefined
          ? await readProfiles(workspaceRoot, "workspace", workspacePath, diagnostics)
          : [];
      user.sort((left, right) => left.name.localeCompare(right.name));
      workspace.sort((left, right) => left.name.localeCompare(right.name));
      const plugins = await discoverPlugins(
        storageOptions,
        state.pluginAgentModelSelectionOverrides,
        [...builtIn, ...user, ...workspace].map((agent) => agent.name),
        diagnostics,
      );
      const disabled = new Set(state.disabledAgentIds);
      const attachEnabled = (agent: AgentSummary): AgentSummary => ({
        ...agent,
        enabled: agent.scope === "user" ? !disabled.has(agent.id) : true,
      });
      const selected =
        mode === "settingsUserOnly"
          ? [...builtIn, ...user]
          : [
              ...new Map(
                [...builtIn, ...user, ...workspace, ...plugins.runtimeAgents].map((agent) => [
                  agent.name,
                  agent,
                ]),
              ).values(),
            ];
      const agents = selected.map(attachEnabled);
      return {
        agents,
        userAgents: agents.filter((agent) => agent.source === "user"),
        pluginAgents: plugins.profiles.map(attachEnabled),
        capability: access,
        diagnostics,
      };
    },
    async setEnabled(params) {
      await queued(async () => {
        const state = await readState(storageOptions);
        const disabled = new Set(state.disabledAgentIds);
        if (params.enabled) disabled.delete(params.agentId);
        else disabled.add(params.agentId);
        state.disabledAgentIds = [...disabled].sort();
        await writeState(state, storageOptions);
      });
    },
    async setBuiltInModelOverride(params) {
      await queued(async () => {
        const state = await readState(storageOptions);
        const overrides = { ...state.builtInModelSelectionOverrides };
        const selection = normalizeSubagentModelSelection(params.modelSelection);
        if (selection) overrides[params.agentName] = selection;
        else delete overrides[params.agentName];
        await writeState({ ...state, builtInModelSelectionOverrides: overrides }, storageOptions);
      });
    },
    async setPluginAgentModelOverride(params) {
      if (!params.agentId.startsWith("plugin:") || params.agentId.trim() !== params.agentId) {
        throw new Error("无效插件 Subagent 身份");
      }
      await queued(async () => {
        const state = await readState(storageOptions);
        const overrides = { ...state.pluginAgentModelSelectionOverrides };
        const selection = normalizeSubagentModelSelection(params.modelSelection);
        if (selection) overrides[params.agentId] = selection;
        else delete overrides[params.agentId];
        await writeState(
          { ...state, pluginAgentModelSelectionOverrides: overrides },
          storageOptions,
        );
      });
    },
    async getPrimaryUserAgentsDirectory() {
      const path = await resolveUserSubagentRoot(storageOptions);
      await mkdir(path, { recursive: true });
      return { path };
    },
    async createAgent(params) {
      validateConfig(params.config);
      const scope = params.scope ?? "user";
      const directory =
        scope === "workspace"
          ? workspaceDirectory(params.workspacePath)
          : await resolveUserSubagentRoot(storageOptions);
      const path = join(directory, params.config.name.trim().toLowerCase() + ".md");
      await mkdir(directory, { recursive: true });
      if (await exists(path)) throw new Error('Agent file "' + basename(path) + '" already exists');
      const saved = savedProfile(params.config, path, scope, params.workspacePath);
      await writeFile(path, saved.content, { encoding: "utf-8", flag: "wx" });
      return { agent: saved.agent };
    },
    async updateAgent(params) {
      validateConfig(params.config);
      const scope = params.scope ?? "user";
      const directory =
        scope === "workspace"
          ? workspaceDirectory(params.workspacePath)
          : await resolveUserSubagentRoot(storageOptions);
      const path = join(directory, params.config.name.trim().toLowerCase() + ".md");
      await mkdir(directory, { recursive: true });
      if (params.oldFilePath && params.oldFilePath !== path && (await exists(path))) {
        throw new Error('Agent file "' + basename(path) + '" already exists');
      }
      const saved = savedProfile(params.config, path, scope, params.workspacePath);
      await writeFile(path, saved.content, "utf-8");
      await migrateDisabledAgentId(params.agentId, saved.agent.id, storageOptions);
      if (params.oldFilePath && params.oldFilePath !== path) {
        await rm(params.oldFilePath, { force: true });
      }
      return { agent: saved.agent };
    },
    async deleteAgent(params) {
      await rm(params.filePath, { force: true });
      const state = await readState(storageOptions);
      const disabled = new Set(state.disabledAgentIds);
      disabled.delete(params.agentId);
      state.disabledAgentIds = [...disabled].sort();
      await writeState(state, storageOptions);
    },
  };
}
