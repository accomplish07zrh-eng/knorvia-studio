// SPDX-License-Identifier: Apache-2.0
// 项目记忆代理上下文的兼容面（B45）：实现见 ./memory/memory-agent-context.js。
import * as agentContext from "./memory/memory-agent-context.js";

export type ProjectMemoryAgentContext = agentContext.ProjectMemoryAgentContext;
export const captureProjectMemoryAgentContext = agentContext.captureProjectMemoryAgentContext;
export const buildProjectMemoryAgentProviderMessages =
  agentContext.buildProjectMemoryAgentProviderMessages;
export const createProjectMemoryAgentToolExecutor =
  agentContext.createProjectMemoryAgentToolExecutor;
