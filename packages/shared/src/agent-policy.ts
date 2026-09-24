import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { KnorviaProvider } from "./task-types-core.js";

export const KNORVIA_AGENT_PROVIDER = "knorvia" satisfies KnorviaProvider;
export const KNORVIA_AGENT_PROVIDER_LABEL = "Knorvia Studio Agent";
export const KNORVIA_COMMAND_AGENT_SOURCE = "agent" satisfies CommandAgentSource;

export const agentProviderSchema = z.literal(KNORVIA_AGENT_PROVIDER);

// 仅在旧任务元数据读取边界迁移；新请求仍使用严格的新内核 schema。
export const persistedAgentProviderSchema = z
  .union([agentProviderSchema, z.literal("glm")])
  .transform((): typeof KNORVIA_AGENT_PROVIDER => KNORVIA_AGENT_PROVIDER);

export const KNORVIA_COMMAND_AGENT_SOURCES = [
  KNORVIA_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToKnorviaAgent(
  _provider?: KnorviaProvider | null,
): KnorviaProvider {
  return KNORVIA_AGENT_PROVIDER;
}

export function isKnorviaAgentProvider(
  provider: KnorviaProvider | null | undefined,
): provider is typeof KNORVIA_AGENT_PROVIDER {
  return provider === KNORVIA_AGENT_PROVIDER;
}
