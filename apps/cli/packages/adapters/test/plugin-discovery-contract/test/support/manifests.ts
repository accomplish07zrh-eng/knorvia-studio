// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PluginManifest } from "@knorvia/contracts";

export const simpleManifest = (name: string, version = "1.0.0"): PluginManifest => ({
  description: `${name} description`,
  name,
  version,
});

export const richManifest = (name: string): PluginManifest => ({
  agents: ["./agents"],
  commands: ["./commands", "./extra-commands"],
  description: `${name} rich description`,
  hooks: "./hooks/hooks.json",
  mcpServers: {
    local: {
      command: "runner",
      type: "stdio",
    },
  },
  name,
  skills: ["./skills", "./extra-skills"],
  version: "2.3.4",
});

export const VALID_HOOKS = {
  hooks: {
    PreToolUse: [
      {
        hooks: [
          {
            command: "check-tool",
            statusMessage: "Checking",
            timeoutMs: 2500,
            type: "command",
          },
        ],
        matcher: "Write|Edit",
      },
    ],
  },
} as const;
