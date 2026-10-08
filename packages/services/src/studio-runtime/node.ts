import { studioImageCodec } from "./adapters/imageCodec.js";
import { Emitter } from "@knorvia/rpc";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { IKnorviaTaskService } from "../session/contract.js";
import { StudioRuntimeService } from "./app/studioRuntimeService.js";
import { StudioDatabase } from "./adapters/studioDatabase.js";
import { createBuiltinStudioKernel } from "./adapters/builtinKernel.js";
import { createStudioWorkspaceManager } from "./adapters/workspaceManager.js";
import { createWorkspaceRuntimePort } from "./adapters/workspaceRuntimeProcess.js";
import { createStudioKernelRegistry } from "./adapters/kernels/kernelRegistry.js";
import { withStudioSharedCapabilities } from "./adapters/sharedCapabilities.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { ISkillsService } from "../skills/skills.js";
import type { IMcpSyncService } from "../mcp-sync/mcpSync.js";
import type { IPluginManagementService } from "../plugins/pluginManagement.js";
import type { ICreationService } from "../creation/contract.js";
import type { CreationAgentBridge } from "./adapters/creationAgentBridge.js";
import type { RemoteStudioEnvironment } from "./adapters/kernels/remoteKernelBridge.js";
import type { StudioAgentPolicy } from "./agentToolTypes.js";
import { createStudioAgentBridge } from "./adapters/studioAgentBridge.js";

export { createCreationAgentBridge } from "./adapters/creationAgentBridge.js";
export type { CreationAgentBridge };

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
  agentPolicy?: Partial<StudioAgentPolicy>;
  /** Trusted Host runtime placement; never accepted from agent tool arguments. */
  agentToolExecutablePath?: string;
}): StudioRuntimeService {
  const emitter = new Emitter<{ revision: number }>();
  const dataDir = join(options.dataDir, "studio");
  const agentBridge = createStudioAgentBridge(
    (turn, sink, signal) => service.agentTools(turn, sink, signal),
    options.agentToolExecutablePath ?? process.execPath,
  );
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
        agentBridge,
      },
    ),
    workspaces: createStudioWorkspaceManager(dataDir),
    workspaceRuntime: createWorkspaceRuntimePort(),
    creation: options.creationService,
    agentPolicy: options.agentPolicy,
    images: studioImageCodec,
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
    await agentBridge.disposeAllAndWait();
    emitter.dispose();
    await dispose();
  };
  return service;
}
