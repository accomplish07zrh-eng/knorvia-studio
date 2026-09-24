import assert from "node:assert/strict";
import { test } from "node:test";
import { acpAvailableCommands } from "../src/studio-runtime/adapters/kernels/acpCommands.js";

test("ACP command catalog accepts only the native available_commands_update", () => {
  assert.deepEqual(
    acpAvailableCommands(
      {
        method: "session/update",
        params: {
          sessionId: "session-a",
          update: {
            sessionUpdate: "available_commands_update",
            availableCommands: [
              { name: "review", description: "Review code", input: { hint: "[target]" } },
              { name: "/compact", description: "Compact context" },
            ],
          },
        },
      },
      "session-a",
    ),
    [
      { name: "review", description: "Review code", inputHint: "[target]" },
      { name: "compact", description: "Compact context" },
    ],
  );
  assert.equal(
    acpAvailableCommands(
      {
        method: "session/update",
        params: {
          sessionId: "other",
          update: { sessionUpdate: "available_commands_update", availableCommands: [] },
        },
      },
      "session-a",
    ),
    null,
  );
  assert.equal(
    acpAvailableCommands(
      {
        method: "session/update",
        params: {
          sessionId: "session-a",
          update: { sessionUpdate: "agent_message_chunk", availableCommands: [] },
        },
      },
      "session-a",
    ),
    null,
  );
});
