import assert from "node:assert/strict";
import { test } from "node:test";
import type { IStudioRuntimeService, StudioKernelTurn } from "../src/studio-runtime/contract.js";
import { createRemoteKernelAdapter } from "../src/studio-runtime/adapters/kernels/remoteKernelBridge.js";
import { remoteStudioKernelId } from "../src/studio-runtime/adapters/kernels/remoteAgentIdentity.js";
import {
  routeStudioGroupMembers,
  parseStudioGroupPlan,
} from "../src/studio-runtime/domain/groupPolicy.js";
import { group } from "./studio-orchestration-support.js";

const identity = "ssh://alice@server-a/work";
const remoteId = remoteStudioKernelId(identity, "codex");
const turn: StudioKernelTurn = {
  runId: "local-run",
  turnId: "local-turn",
  dispatchId: "local-run:member:0",
  conversationId: "group:work:codex",
  kernel: remoteId,
  workspacePath: "C:\\local-project",
  permission: "ask",
  text: "Check the remote project",
};

test("remote member runs through its bound SSH service and project, never local path", async () => {
  const calls: Array<{ type: string; [key: string]: unknown }> = [];
  let conversationId = "";
  let sendId = "";
  const service = {
    async inspectKernels() {
      return [{ id: "codex", installed: true }];
    },
    async command(command: Record<string, unknown>) {
      calls.push(command as { type: string });
      if (command.type === "create-conversation") {
        conversationId = command.id as string;
        return { id: conversationId, revision: 1 };
      }
      if (command.type === "send") {
        sendId = "remote-run";
        return { id: sendId, revision: 2 };
      }
      return { id: "answer", revision: 3 };
    },
    async timeline() {
      return {
        revision: 3,
        messages: [
          {
            id: "m",
            targetId: conversationId,
            runId: sendId,
            sender: "codex",
            kind: "text",
            text: "Done",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        interactions: [],
        runs: [{ id: sendId, state: "succeeded", resultKnown: true }],
      };
    },
  } as unknown as IStudioRuntimeService;
  const events: string[] = [];
  const result = await createRemoteKernelAdapter(remoteId, () => [
    {
      workspaceIdentity: identity,
      workspacePath: "/srv/work",
      label: "alice@server-a",
      service,
    },
  ]).run(
    turn,
    {
      emit: async (event) => {
        if (event.type === "text") events.push(event.text);
      },
      ask: async () => ({ decision: "deny" }),
    },
    new AbortController().signal,
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.workspacePath, "/srv/work");
  assert.deepEqual(events, ["Done"]);
  assert.equal(calls[0]?.type, "create-conversation");
  assert.equal(calls[0]?.workspacePath, "/srv/work");
  assert.equal(calls[1]?.type, "send");
  assert.equal(calls[1]?.targetId, conversationId);
  assert.equal((calls[1]?.kernelConfig as { permission: string } | undefined)?.permission, "ask");
});

test("missing SSH connection fails before dispatch, without a local fallback", async () => {
  const result = await createRemoteKernelAdapter(remoteId, () => []).run(
    turn,
    {
      emit: async () => {},
      ask: async () => ({ decision: "deny" }),
    },
    new AbortController().signal,
  );
  assert.equal(result.status, "failed");
  assert.equal(result.resultKnown, true);
  assert.match(result.error ?? "", /远程.*连接/);
});

test("one group routes local and two SSH Codex members independently", () => {
  const second = remoteStudioKernelId("ssh://alice@server-b/work", "codex");
  const mixed = { ...group, members: ["codex", remoteId, second], host: "codex" };
  assert.notEqual(remoteId, second);
  assert.deepEqual(routeStudioGroupMembers(mixed, `@${remoteId} @${second} check both`), [
    remoteId,
    second,
  ]);
  assert.deepEqual(routeStudioGroupMembers(mixed, "@codex check local"), ["codex"]);
  assert.deepEqual(
    parseStudioGroupPlan(
      JSON.stringify({
        tasks: [
          { id: "local", member: "codex", instruction: "Check local", dependsOn: [] },
          { id: "a", member: remoteId, instruction: "Check A", dependsOn: [] },
          { id: "b", member: second, instruction: "Check B", dependsOn: [] },
        ],
      }),
      mixed,
    ).tasks.map((item) => item.member),
    mixed.members,
  );
});

test("an aborted remote interaction sends cancellation before marking result uncertain", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const service = {
    async command(command: { type: string; id?: string }) {
      calls.push(command.type);
      return { id: command.type === "send" ? "remote-run" : (command.id ?? "ok"), revision: 1 };
    },
    async timeline() {
      return {
        revision: 1,
        messages: [],
        runs: [{ id: "remote-run", state: "waiting" }],
        interactions: [
          { id: "remote-question", runId: "remote-run", status: "pending", kind: "question" },
        ],
      };
    },
  } as unknown as IStudioRuntimeService;
  const result = await createRemoteKernelAdapter(remoteId, () => [
    {
      workspaceIdentity: identity,
      workspacePath: "/srv/work",
      label: "alice@server-a",
      service,
    },
  ]).run(
    turn,
    {
      emit: async () => {},
      ask: async () => {
        controller.abort();
        throw new Error("local interaction cancelled");
      },
    },
    controller.signal,
  );
  assert.deepEqual(calls, ["create-conversation", "send", "cancel"]);
  assert.equal(result.status, "interrupted");
  assert.equal(result.resultKnown, false);
});
