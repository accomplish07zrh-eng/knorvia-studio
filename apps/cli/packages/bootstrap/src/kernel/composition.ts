// SPDX-License-Identifier: Apache-2.0
// v1 固定组合的唯一事实源：顺序、包名与 config 均按合同 README §三。

import { join } from "node:path";
import { KERNEL_PERSONA_PREFIX } from "./constants.js";

export interface KernelPluginRow {
  readonly id: string;
  readonly name: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly disabled?: boolean;
}

export const KERNEL_PLUGIN_ROWS: readonly KernelPluginRow[] = [
  { id: "timer", name: "@deepseek-ai/cordis-plugin-timer" },
  { id: "llm", name: "@deepseek-ai/dsh-llm" },
  { id: "sessions", name: "@deepseek-ai/dsh-session" },
  {
    id: "session-persistence",
    name: "@deepseek-ai/dsh-session-persistence-jsonl",
    config: { compression: "none" },
  },
  { id: "session-projection", name: "@deepseek-ai/dsh-session-projection" },
  {
    id: "system-prompt",
    name: "@deepseek-ai/dsh-system-prompt",
    config: {
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix: KERNEL_PERSONA_PREFIX,
    },
  },
  { id: "tools", name: "@deepseek-ai/dsh-tools" },
  { id: "agents", name: "@deepseek-ai/dsh-agent" },
  { id: "agent-loop", name: "@deepseek-ai/dsh-agent-loop", config: { agents: [] } },
  { id: "invariants", name: "@deepseek-ai/dsh-invariants" },
  { id: "session-invariant", name: "@deepseek-ai/dsh-session/invariant" },
  { id: "agent-invariant", name: "@deepseek-ai/dsh-agent/invariant" },
  { id: "scope-invariant", name: "@deepseek-ai/dsh-scope/invariant" },
  { id: "agent-loop-invariant", name: "@deepseek-ai/dsh-agent-loop/invariant" },
  {
    id: "agent-instructions",
    name: "@deepseek-ai/dsh-agent-instructions",
    config: { maxBytes: 65536 },
  },
  { id: "skill", name: "@deepseek-ai/dsh-skill" },
  {
    id: "skill-filesystem",
    name: "@deepseek-ai/dsh-skill-filesystem",
    config: { includeDefaultRoots: false, watch: false },
  },
  { id: "mcp-resources", name: "@deepseek-ai/dsh-mcp-resources" },
  { id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers: {} } },
];

export function createKernelPluginRows(dshHome: string): KernelPluginRow[] {
  return KERNEL_PLUGIN_ROWS.map((row) => {
    if (row.id !== "session-persistence") {
      return row.config === undefined ? { ...row } : { ...row, config: { ...row.config } };
    }
    return {
      ...row,
      config: { root: join(dshHome, "sessions"), ...row.config },
    };
  });
}
