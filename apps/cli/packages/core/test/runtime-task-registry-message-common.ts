import type {
  RuntimeTaskPendingMessage,
  RuntimeTaskRegistry,
  RuntimeTaskSnapshot,
} from "../src/runtime-task/registry.js";

export type RegistryFactory = () => RuntimeTaskRegistry;
type Observation = Record<string, unknown>;
export interface MessageCase {
  name: string;
  observe: (create: RegistryFactory) => Observation | Promise<Observation>;
}

export const TASK_ID = "owned-message-task";
export function task(patch: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
  return {
    taskId: TASK_ID,
    type: "local_agent",
    agentId: "owned-message-agent",
    agentType: "general",
    description: "owned message observation",
    status: "running",
    startedAt: new Date(0),
    ...patch,
  };
}
export function message(id: string): RuntimeTaskPendingMessage {
  return { id, message: "owned fixture", queuedAt: new Date(0) };
}
export function install(owner: RuntimeTaskRegistry, snapshot: RuntimeTaskSnapshot) {
  owner.register(task());
  owner.update(TASK_ID, () => snapshot);
}
