import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeAvailableCommands } from "../src/studio-runtime/adapters/kernels/claudeCommands.js";

test("Claude's initialization catalog maps project commands but omits terminal controls", () => {
  const commands = claudeAvailableCommands({
    commands: [
      { name: "review", description: "Review code", argumentHint: "[target]" },
      { name: "custom:plan", description: "Project command" },
      { name: "model", description: "Change model" },
      { name: "clear", description: "Clear CLI context" },
      { name: "terminal-tool", description: "Terminal only" },
    ],
    terminal_slash_commands: ["terminal-tool"],
  });
  assert.deepEqual(commands, [
    { name: "review", description: "Review code", inputHint: "[target]" },
    { name: "custom:plan", description: "Project command" },
  ]);
});
