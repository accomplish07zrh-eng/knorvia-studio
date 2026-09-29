// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { getWorld, record } from "./state.mjs";

export function loadPluginMcpServerDefinitions(input) {
  record("mcp.loadDefinitions", {
    pluginId: input.loaded?.id,
    diagnosticCount: input.diagnostics?.length ?? 0,
  });
  const configuredDiagnostics = structuredClone(getWorld().config?.mcpLoadDiagnostics ?? []);
  input.diagnostics?.push(...configuredDiagnostics);
  return structuredClone(getWorld().config?.mcpDefinitions ?? {});
}

export function resolvePluginMcpServers(input) {
  record("mcp.resolveServers", {
    pluginId: input.loaded?.id,
    workingDirectory: input.workingDirectory,
  });
  const configuredDiagnostics = structuredClone(getWorld().config?.mcpResolveDiagnostics ?? []);
  input.diagnostics?.push(...configuredDiagnostics);
  return structuredClone(getWorld().config?.mcpServers ?? {});
}
