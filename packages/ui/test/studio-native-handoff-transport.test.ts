import assert from "node:assert/strict";
import test from "node:test";
import { V4_WIRE_PROTOCOL_VERSION } from "@knorvia/shared/protocol-v4";
import {
  createNativeHandoffAttempt,
  performNativeHandoff,
} from "../src/studio/agents/sessionHandoff.js";
import { createAgentConversationTransport } from "../src/v4/agentConversationTransport.js";

test("external to native handoff passes through the existing V4 handshake and workspace route", async () => {
  const events: string[] = [];
  const service = {
    async helloConversationV4() {
      events.push("hello");
      return {
        kind: "hello" as const,
        protocolVersion: V4_WIRE_PROTOCOL_VERSION,
        connectionId: "local-host",
        clientMode: "desktop-continuous" as const,
        deliveryProfile: "continuous" as const,
        serverTime: Date.now(),
        capabilities: {
          nativeDialogs: true,
          localTerminal: true,
          binaryFrames: false,
          compression: "none" as const,
          workspaceHookReview: true,
          independentPlanState: true,
        },
        auth: {},
      };
    },
    async initializeConversationV4(input: { clientId: string }) {
      events.push("clientHello");
      assert.ok(input.clientId);
    },
    async sendConversationCommandV4(input: {
      workspacePath: string;
      workspaceIdentity?: string;
      envelope: { type: string; sessionId: string | null; payload: unknown; commandId: string };
    }) {
      events.push("send");
      assert.equal(input.workspacePath, "C:/handoff-project");
      assert.equal(input.workspaceIdentity, undefined);
      assert.equal(input.envelope.type, "createSession");
      assert.equal(input.envelope.sessionId, null);
      assert.deepEqual(input.envelope.payload, {
        workspaceId: "C:/handoff-project",
        firstInput: { text: "User-approved summary" },
      });
      return {
        commandId: input.envelope.commandId,
        status: "accepted" as const,
        revisionAtDecision: 1,
        result: { type: "createSession" as const, sessionId: "native-v4-session" },
      };
    },
  } as unknown as Parameters<typeof createAgentConversationTransport>[0];
  const attempt = createNativeHandoffAttempt({
    sourceKernel: "codex",
    workspacePath: "C:/handoff-project",
    text: "User-approved summary",
  });
  assert.deepEqual(events, []);
  const transport = createAgentConversationTransport(service, {
    workspacePath: attempt.workspacePath,
  });
  assert.equal(await performNativeHandoff(transport.sendCommand, attempt), "native-v4-session");
  assert.deepEqual(events, ["hello", "clientHello", "send"]);
});
