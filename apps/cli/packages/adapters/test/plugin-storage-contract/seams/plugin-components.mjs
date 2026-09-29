// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { getWorld, record } from "./state.mjs";
import { loadPluginMcpServerDefinitions } from "./mcp.mjs";

export function enumeratePluginComponents(rootPath, manifest, options = {}) {
  record("pluginComponents.enumerate", {
    rootPath,
    hasManifest: manifest !== null,
    diagnosticCount: options.diagnostics?.length ?? 0,
    hasLoaded: options.loaded !== undefined,
  });
  const groups = structuredClone(getWorld().config?.pluginComponents ?? []);
  if (manifest && Object.hasOwn(manifest, "mcpServers") && options.loaded) {
    const definitions = loadPluginMcpServerDefinitions({
      diagnostics: options.diagnostics ?? [],
      loaded: options.loaded,
    });
    const items = Object.keys(definitions)
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .map((name) => ({ name }));
    if (items.length > 0) groups.push({ kind: "mcp", items });
  }
  return groups;
}
