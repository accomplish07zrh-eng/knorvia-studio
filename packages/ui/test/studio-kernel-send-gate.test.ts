import assert from "node:assert/strict";
import test from "node:test";
import {
  assessKernelCapabilities,
  type StudioCommand,
  type StudioKernelProbe,
  type StudioKernelStatus,
} from "@knorvia/services";
import { submitStudioChat } from "../src/studio/agents/chatSubmission.js";
import {
  STUDIO_REFUSAL_I18N_PREFIX,
  StudioSendRefusalError,
  studioSendRefusal,
  studioSendRefusalValues,
} from "../src/studio/agents/kernelSendGate.js";

const ready: StudioKernelProbe = {
  stages: {
    locate: { status: "ok", code: "locate.ok", ms: 4 },
    version: { status: "ok", code: "version.ok", ms: 9 },
    protocol: { status: "ok", code: "protocol.ok", ms: 300 },
    auth: { status: "skipped", code: "auth.not-requested", reason: "未请求账号核验", ms: 0 },
  },
  durationMs: 320,
  probedAt: 1_700_000_000_000,
};

function status(overrides: Partial<StudioKernelStatus> = {}): StudioKernelStatus {
  const version = overrides.version ?? "0.151.0";
  return {
    id: "codex",
    displayName: "Codex",
    management: "studio",
    installed: true,
    version,
    origin: "managed",
    capabilities: assessKernelCapabilities({ kernel: "codex", version }).capabilities,
    probe: ready,
    ...overrides,
  } as StudioKernelStatus;
}

function recorder() {
  const commands: Array<Omit<StudioCommand, "commandId">> = [];
  const command = async (input: Omit<StudioCommand, "commandId">) => {
    commands.push(input);
    return { id: "ok", revision: 1 };
  };
  return { commands, command };
}

const input = {
  sessionId: "session-1",
  kernel: "codex" as const,
  workspacePath: "D:/project",
  text: "hello",
  selection: { model: "gpt-5", reasoningEffort: "high" },
  permission: "ask" as const,
  kernelName: "Codex",
};

test("an unsupported capability is refused before anything is sent, with an explainable reason", async () => {
  const { commands, command } = recorder();
  const readOnly = status({
    capabilities: {
      ...assessKernelCapabilities({ kernel: "claude-code", version: "2.1.220" }).capabilities,
    },
  });
  await assert.rejects(
    () => submitStudioChat({ ...input, permission: "read-only", status: readOnly }, command),
    (error: unknown) => {
      assert(error instanceof StudioSendRefusalError);
      assert.equal(error.refusal.code, "permission-unsupported");
      assert.equal(error.refusal.messageId, "studio.agents.sendRefusal.permissionUnsupported");
      assert.equal(error.message, "studio.agents.sendRefusal.permissionUnsupported");
      assert.equal(error.refusal.retryable, false);
      return true;
    },
  );
  // 发送前校验：没有任何命令被发出，也没有换成别的模型或权限。
  assert.deepEqual(commands, []);
});

test("a version outside the verified range fails closed with the unverified reason", () => {
  const downgraded = "0.100.0";
  const refusal = studioSendRefusal({
    status: status({
      version: downgraded,
      capabilities: assessKernelCapabilities({ kernel: "codex", version: downgraded }).capabilities,
    }),
    permission: "read-only",
    kernelName: "Codex",
  });
  assert(refusal);
  assert.equal(refusal.code, "version-unverified");
  assert.equal(refusal.messageId, "studio.agents.sendRefusal.versionUnverified");
  assert.equal(refusal.params.version, downgraded);
  assert.equal(
    refusal.params.capability,
    `${STUDIO_REFUSAL_I18N_PREFIX}studio.agents.capability.readOnly`,
  );
  assert.equal(
    studioSendRefusalValues(refusal, (id) => `<<${id}>>`).permission,
    "<<studio.agents.permission.read-only>>",
  );
});

test("not installed, protocol failed and unknown states each get their own refusal", () => {
  const missing = studioSendRefusal({
    status: status({
      installed: false,
      origin: "missing",
      version: undefined,
      probe: {
        ...ready,
        stages: {
          ...ready.stages,
          locate: { status: "failed", code: "locate.missing", reason: "未安装", ms: 2 },
          version: { status: "skipped", code: "stage.not-reached", ms: 0 },
          protocol: { status: "skipped", code: "stage.not-reached", ms: 0 },
          auth: { status: "skipped", code: "stage.not-reached", ms: 0 },
        },
      },
    }),
    permission: "ask",
    kernelName: "Codex",
  });
  assert.equal(missing?.code, "not-installed");
  assert.equal(missing?.messageId, "studio.agents.sendRefusal.notInstalled");
  assert.equal(missing?.retryable, true);

  const protocolFailed = studioSendRefusal({
    status: status({
      installed: false,
      origin: "external",
      probe: {
        ...ready,
        stages: {
          ...ready.stages,
          protocol: { status: "failed", code: "protocol.mismatch", reason: "握手失败", ms: 800 },
        },
      },
    }),
    permission: "ask",
    kernelName: "Codex",
  });
  assert.equal(protocolFailed?.code, "probe-failed");
  assert.equal(protocolFailed?.stage, "protocol");
  assert.equal(protocolFailed?.probeCode, "protocol.mismatch");
  assert.equal(
    protocolFailed?.params.stage,
    `${STUDIO_REFUSAL_I18N_PREFIX}studio.agents.probe.stage.protocol`,
  );

  // 未检测：不得当作可用。
  assert.equal(
    studioSendRefusal({ status: undefined, permission: "ask", kernelName: "Codex" })?.code,
    "status-unknown",
  );
  // 传统字段（无 probe）且未安装：同样拒绝。
  assert.equal(
    studioSendRefusal({
      status: status({ installed: false, origin: "missing", version: undefined, probe: undefined }),
      permission: "ask",
      kernelName: "Codex",
    })?.code,
    "not-installed",
  );
});

test("a verified kernel sends the same model and permission, and never widens them", async () => {
  const { commands, command } = recorder();
  await submitStudioChat({ ...input, status: status() }, command);
  assert.equal(commands.length, 2);
  const send = commands[1] as Extract<StudioCommand, { type: "send" }>;
  assert.equal(send.type, "send");
  assert.deepEqual(send.selection, { model: "gpt-5", reasoningEffort: "high" });
  // 发送命令不携带权限：Studio 不会在任务中途提升权限。
  assert.equal("permission" in send, false);
  assert.equal("kernelConfig" in send, false);
  // 校验不会改写调用方传入的选择对象。
  assert.deepEqual(input.selection, { model: "gpt-5", reasoningEffort: "high" });
  assert.equal(input.permission, "ask");
});

test("a legacy (probe-less) but usable installation keeps working unchanged", async () => {
  const { commands, command } = recorder();
  await submitStudioChat({ ...input, status: status({ probe: undefined }) }, command);
  assert.equal(commands.length, 2);
});
