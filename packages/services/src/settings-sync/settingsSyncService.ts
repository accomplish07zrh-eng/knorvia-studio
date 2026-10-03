import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  SettingsSyncCategorySummary,
  SettingsSyncClaudeAgentsFileCopyResult,
  SettingsSyncClaudeAgentsFileMigrationStatus,
  SettingsSyncImportResult,
  SettingsSyncSelection,
  SettingsSyncSourceRootSummary,
  SettingsSyncSourceScope,
  SettingsSyncTaskImportResult,
} from "@knorvia/shared";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { getKnorviaDataRootDir } from "../paths.js";
import type { ISettingService } from "../setting/setting.js";
import type { ISettingsSyncService } from "./settingsSync.js";
import {
  agentOrder,
  isSyncCategory,
  sourceHome,
  supportedCategories,
} from "./settingsSyncCatalog.js";
import type { SourceCandidate, SyncCategory } from "./settingsSyncCatalog.js";
import { discoverSources, pathPresent } from "./settingsSyncSources.js";
import {
  CollisionPass,
  destinationFor,
  importFilesystem,
  mergeServer,
  registerPlugin,
} from "./settingsSyncImport.js";
import type { SkipReason } from "./settingsSyncImport.js";

interface ItemResult {
  name: string;
  path: string;
  sourceScope: SettingsSyncSourceScope;
  status: "imported" | "skipped" | "failed";
  skipReason?: SkipReason;
  version?: string;
}
interface ProjectedItem {
  name: string;
  path: string;
  importable: boolean;
  skipReason?: SkipReason;
  version?: string;
  description?: string;
  argumentHint?: string;
}
const logger = createServiceLogger("settings-sync");

function itemDetails(candidate: SourceCandidate): Omit<ItemResult, "status"> {
  return {
    name: candidate.name,
    path: candidate.sourcePath,
    sourceScope: candidate.scope,
    ...((candidate.category === "skills" || candidate.category === "plugins") && candidate.version
      ? { version: candidate.version }
      : {}),
  };
}
function selectedPaths(selection: SettingsSyncSelection): string[] | undefined {
  switch (selection.category) {
    case "skills":
      return selection.skillPaths;
    case "commands":
      return selection.commandPaths;
    case "plugins":
      return selection.pluginPaths;
    case "mcpServers":
      return selection.mcpServerPaths;
    default:
      return undefined;
  }
}
function taskWithItems(
  selection: SettingsSyncSelection,
  items: ItemResult[],
): SettingsSyncTaskImportResult {
  const importedCount = items.filter((item) => item.status === "imported").length;
  const skippedCount = items.filter((item) => item.status === "skipped").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const task: SettingsSyncTaskImportResult = {
    agent: selection.agent,
    category: selection.category,
    status: failedCount ? "failed" : importedCount ? "success" : "skipped",
    importedCount,
    skippedCount,
    failedCount,
  };
  switch (selection.category) {
    case "skills":
      task.skillResults = items;
      break;
    case "commands":
      task.commandResults = items;
      break;
    case "plugins":
      task.pluginResults = items;
      break;
    case "mcpServers":
      task.mcpServerResults = items.map((item) => ({
        name: item.name,
        path: item.path,
        sourceScope: item.sourceScope,
        status: item.status,
        ...(item.skipReason ? { skipReason: "sameNameExists" as const } : {}),
      }));
      break;
  }
  return task;
}
async function summarizeCategory(
  category: SyncCategory,
  candidates: SourceCandidate[],
  workspacePath?: string,
): Promise<SettingsSyncCategorySummary> {
  const collisions = new CollisionPass();
  const groups = new Map<
    string,
    { scope: SettingsSyncSourceScope; path: string; items: ProjectedItem[] }
  >();
  for (const candidate of candidates) {
    const key = `${candidate.scope}:${candidate.root}`;
    let group = groups.get(key);
    if (!group) {
      group = { scope: candidate.scope, path: candidate.root, items: [] };
      groups.set(key, group);
    }
    const skipReason = await collisions.conflict(
      candidate,
      destinationFor(candidate, workspacePath),
    );
    group.items.push({
      name: candidate.name,
      path: candidate.sourcePath,
      importable: !skipReason,
      ...(skipReason ? { skipReason } : {}),
      ...((category === "skills" || category === "plugins") && candidate.version
        ? { version: candidate.version }
        : {}),
      ...(category === "commands" && candidate.description
        ? { description: candidate.description }
        : {}),
      ...(category === "commands" && candidate.argumentHint
        ? { argumentHint: candidate.argumentHint }
        : {}),
    });
  }
  const sourceRoots: SettingsSyncSourceRootSummary[] = [...groups.values()]
    .map((group) => {
      const items = group.items.sort((a, b) => a.name.localeCompare(b.name));
      const available = items.filter((item) => item.importable).length;
      const root: SettingsSyncSourceRootSummary = {
        scope: group.scope,
        path: group.path,
        discoveredCount: items.length,
        importableCount: available,
        skippedCount: items.length - available,
      };
      if (category === "mcpServers") {
        root.mcpServers = items.map((item) => ({
          name: item.name,
          path: item.path,
          importable: item.importable,
          ...(item.skipReason ? { skipReason: "sameNameExists" as const } : {}),
        }));
      } else root[category] = items;
      return root;
    })
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.path.localeCompare(b.path));
  const overallCollisions = new CollisionPass();
  let importableCount = 0;
  for (const candidate of candidates) {
    if (!(await overallCollisions.conflict(candidate, destinationFor(candidate, workspacePath))))
      importableCount++;
  }
  return {
    category,
    discoveredCount: candidates.length,
    importableCount,
    skippedCount: candidates.length - importableCount,
    sourcePaths: [...new Set(candidates.map((candidate) => candidate.root))].sort((a, b) =>
      a.localeCompare(b),
    ),
    sourceRoots,
    selectedByDefault: category === "skills" && importableCount > 0,
  };
}
async function instructionStatus(): Promise<SettingsSyncClaudeAgentsFileMigrationStatus> {
  const sourcePath = path.join(sourceHome(), ".claude", "CLAUDE.md");
  const targetPath = path.join(getKnorviaDataRootDir(), "AGENTS.md");
  const sourceExists = await pathPresent(sourcePath);
  const targetExists = await pathPresent(targetPath);
  return {
    sourcePath,
    targetPath,
    sourceExists,
    targetExists,
    supported: sourceExists,
    ...(!sourceExists ? { unavailableReason: "missingSource" as const } : {}),
  };
}

export function createSettingsSyncService(dependencies: {
  settingService: ISettingService;
}): ISettingsSyncService {
  return {
    async detect(request) {
      const category = supportedCategories.find((value) => request.categories?.includes(value));
      if (request.intent !== "manualImport" || !category) return { agents: [] };
      const candidates = await discoverSources(category, request.workspacePath);
      const agents = [];
      for (const agent of agentOrder(category)) {
        const agentCandidates = candidates.filter((candidate) => candidate.agent === agent);
        if (!agentCandidates.length) continue;
        agents.push({
          agent,
          discovered: true,
          categories: [await summarizeCategory(category, agentCandidates, request.workspacePath)],
        });
      }
      return { agents };
    },
    async importSelected(request) {
      const result: SettingsSyncImportResult = {
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        taskResults: [],
      };
      for (const selection of request.selections) {
        let task: SettingsSyncTaskImportResult;
        if (!isSyncCategory(selection.category)) {
          task = {
            agent: selection.agent,
            category: selection.category,
            status: "skipped",
            importedCount: 0,
            skippedCount: 1,
            failedCount: 0,
          };
        } else {
          const collisions = new CollisionPass();
          const candidates = await discoverSources(selection.category, request.workspacePath);
          const paths = selectedPaths(selection);
          const items: ItemResult[] = [];
          for (const candidate of candidates) {
            if (
              candidate.agent !== selection.agent ||
              (selection.sourceScope && candidate.scope !== selection.sourceScope) ||
              (paths && !paths.includes(candidate.sourcePath))
            )
              continue;
            const destination = destinationFor(
              candidate,
              request.workspacePath,
              selection.targetScope,
            );
            const skipReason = await collisions.conflict(candidate, destination);
            if (skipReason) {
              items.push({ ...itemDetails(candidate), status: "skipped", skipReason });
              continue;
            }
            try {
              if (candidate.category === "mcpServers")
                await mergeServer(destination.configPath!, candidate);
              else {
                await importFilesystem(
                  candidate,
                  destination.targetPath!,
                  selection.importMode === undefined ? "symlink" : selection.importMode,
                );
                if (candidate.category === "plugins")
                  await registerPlugin(destination.configPath!, destination.targetPath!);
              }
              await collisions.reserve(candidate, destination);
              items.push({ ...itemDetails(candidate), status: "imported" });
            } catch {
              items.push({ ...itemDetails(candidate), status: "failed" });
            }
          }
          task = taskWithItems(selection, items);
        }
        result.taskResults.push(task);
        result.successCount += task.importedCount;
        result.skippedCount += task.skippedCount;
        result.failedCount += task.failedCount;
      }
      return result;
    },
    async getClaudeAgentsFileMigrationStatus(request) {
      void request.workspaceIdentity;
      void request.workspacePath;
      return instructionStatus();
    },
    async copyClaudeAgentsFileToKnorviaAgentsFile(request = {}) {
      const status = await instructionStatus();
      let result: SettingsSyncClaudeAgentsFileCopyResult;
      const paths = { sourcePath: status.sourcePath, targetPath: status.targetPath };
      if (!status.sourceExists)
        result = {
          ...paths,
          status: "skipped",
          overwritten: false,
          skippedReason: "missingSource",
        };
      else if (status.targetExists && request.overwrite !== true)
        result = { ...paths, status: "skipped", overwritten: false, skippedReason: "targetExists" };
      else {
        await fs.mkdir(path.dirname(status.targetPath), { recursive: true });
        await fs.copyFile(status.sourcePath, status.targetPath);
        result = { ...paths, status: "copied", overwritten: status.targetExists };
      }
      logger.info(undefined, "Claude instructions copy completed", {
        workspacePath: request.workspacePath,
        workspaceIdentity: request.workspaceIdentity,
        ...result,
      });
      return result;
    },
    async getFirstRunPromptState() {
      return {
        handled:
          (await dependencies.settingService.get()).settingsSyncFirstRunPromptHandled === true,
      };
    },
    async markFirstRunPromptHandled() {
      await dependencies.settingService.update({ settingsSyncFirstRunPromptHandled: true });
    },
  };
}
