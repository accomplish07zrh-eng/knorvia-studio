import { Emitter } from "@knorvia/rpc";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { IKnorviaTaskService } from "../session/contract.js";
import { StudioRuntimeService } from "./app/studioRuntimeService.js";
import { StudioDatabase } from "./adapters/studioDatabase.js";
import { createBuiltinStudioKernel } from "./adapters/builtinKernel.js";
import { createStudioWorkspaceManager } from "./adapters/workspaceManager.js";
import { createStudioKernelRegistry } from "./adapters/kernels/kernelRegistry.js";
import { withStudioSharedCapabilities } from "./adapters/sharedCapabilities.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { ISkillsService } from "../skills/skills.js";
import type { IMcpSyncService } from "../mcp-sync/mcpSync.js";
import type { IPluginManagementService } from "../plugins/pluginManagement.js";
import type { ICreationService } from "../creation/contract.js";
import type { CreationAgentBridge } from "../creation/creationAgentBridge.js";
import type { RemoteStudioEnvironment } from "./adapters/kernels/remoteKernelBridge.js";

const logger = createServiceLogger("studio-runtime");

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export function createStudioRuntimeService(options: {
  dataDir: string;
  taskService: IKnorviaTaskService;
  skillsService: Pick<ISkillsService, "list" | "buildPromptContext">;
  mcpSyncService: Pick<IMcpSyncService, "loadMcpFromUserDirectory">;
  pluginManagementService: Pick<IPluginManagementService, "listPlugins">;
  creationService?: ICreationService;
  creationBridge?: CreationAgentBridge;
  remoteEnvironments?: () => RemoteStudioEnvironment[];
}): StudioRuntimeService {
  const emitter = new Emitter<{ revision: number }>();
  const dataDir = join(options.dataDir, "studio");
  const service = new StudioRuntimeService({
    db: new StudioDatabase(join(dataDir, "studio.sqlite")),
    clock: { now: Date.now, id: randomUUID, delay },
    kernels: withStudioSharedCapabilities(
      createStudioKernelRegistry({
        dataDir,
        builtin: createBuiltinStudioKernel(options.taskService),
        remoteEnvironments: options.remoteEnvironments,
      }),
      {
        skills: options.skillsService,
        mcp: options.mcpSyncService,
        plugins: options.pluginManagementService,
        dataDir,
        creationBridge: options.creationBridge,
      },
    ),
    workspaces: createStudioWorkspaceManager(dataDir),
    creation: options.creationService,
    onDidChange: emitter.event,
    notify: (revision) => emitter.fire({ revision }),
    process: {
      id: process.pid,
      alive: (id) => {
        try {
          process.kill(id, 0);
          return true;
        } catch (error) {
          return (error as NodeJS.ErrnoException).code !== "ESRCH";
        }
      },
    },
  });
  const timer = setInterval(() => {
    try {
      service.tick();
    } catch (error) {
      logger.error("runtime tick failed", error);
    }
  }, 250);
  timer.unref();
  const dispose = service.disposeAllAndWait.bind(service);
  service.disposeAllAndWait = async () => {
    clearInterval(timer);
    emitter.dispose();
    await dispose();
  };
  return service;
}
