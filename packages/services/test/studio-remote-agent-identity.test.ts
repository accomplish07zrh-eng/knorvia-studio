import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRemoteStudioKernelId } from "../src/studio-runtime/domain/remoteAgentIdentity.js";
import { remoteStudioKernelId } from "../src/studio-runtime/adapters/kernels/remoteAgentIdentity.js";

test("SSH Agent identity distinguishes equal CLI names across workspaces", () => {
  const first = remoteStudioKernelId("ssh://alice@host-a/project", "codex");
  const second = remoteStudioKernelId("ssh://alice@host-b/project", "codex");
  const otherCli = remoteStudioKernelId("ssh://alice@host-a/project", "claude-code");
  assert.notEqual(first, second);
  assert.notEqual(first, otherCli);
  assert.equal(first, remoteStudioKernelId("ssh://alice@host-a/project", "codex"));
  assert.deepEqual(parseRemoteStudioKernelId(first), {
    workspaceKey: first.split(":")[1],
    kernel: "codex",
  });
});

test("SSH Agent identity rejects malformed or nested remote ids", () => {
  assert.equal(parseRemoteStudioKernelId("ssh:short:codex"), null);
  assert.equal(parseRemoteStudioKernelId("ssh:aaaaaaaaaaaaaaaaaaaaaaaa:unknown"), null);
  assert.equal(parseRemoteStudioKernelId("ssh:aaaaaaaaaaaaaaaaaaaaaaaa:ssh:bbb:codex"), null);
});
