import type { Event } from "@knorvia/rpc";
import type { ICreationService } from "../../creation/contract.js";
import type { StudioAgentPolicy } from "../agentToolTypes.js";
import type { StudioImageCodec } from "./imagePort.js";
import type { StudioKernelRegistry, StudioWorkspacePort } from "./ports.js";
import type { StudioClock, StudioRepository } from "./storePort.js";
import type { WorkspaceRuntimePort } from "./workspaceRuntimePort.js";

export interface StudioRuntimeDependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  workspaces: StudioWorkspacePort;
  creation?: ICreationService;
  onDidChange: Event<{ revision: number }>;
  notify(revision: number): void;
  process?: { id: number; alive(id: number): boolean };
  workspaceRuntime?: WorkspaceRuntimePort;
  agentPolicy?: Partial<StudioAgentPolicy>;
  images?: StudioImageCodec;
}
