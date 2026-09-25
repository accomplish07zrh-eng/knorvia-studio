import assert from "node:assert/strict";
import test from "node:test";
import {
  assessKernelCapabilities,
  type ProbeStage,
  type ProbeStageResult,
  type StudioKernelProbe,
  type StudioKernelStatus,
} from "@knorvia/services";
import * as probeView from "../src/studio/agents/kernelProbeView.js";
import {
  studioAuthHint,
  studioCapabilityRows,
  studioProbeBadgeKey,
  studioProbeCached,
  studioProbeCodeGlossKey,
  studioProbeDiagnosticFields,
  studioProbeStageViews,
  studioProbeState,
} from "../src/studio/agents/kernelProbeView.js";

const ok = (code: string, ms: number): ProbeStageResult => ({
  status: "ok",
  code: code as never,
  ms,
});
const probe = (stages: Partial<Record<ProbeStage, ProbeStageResult>>): StudioKernelProbe => ({
  stages: {
    locate: { status: "skipped", code: "stage.not-reached", ms: 0 },
    version: { status: "skipped", code: "stage.not-reached", ms: 0 },
    protocol: { status: "skipped", code: "stage.not-reached", ms: 0 },
    auth: { status: "skipped", code: "stage.not-reached", ms: 0 },
    ...stages,
  },
  durationMs: 42,
  probedAt: 1_700_000_000_000,
});

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
    ...overrides,
  } as StudioKernelStatus;
}

test("program present but protocol failed is rendered differently from not installed", () => {
  const protocolFailed = status({
    installed: false,
    origin: "external",
    version: "0.151.0",
    probe: probe({
      locate: ok("locate.ok", 4),
      version: ok("version.ok", 12),
      protocol: {
        status: "failed",
        code: "protocol.mismatch",
        reason: "CLI 未通过 ACP v1 握手",
        ms: 900,
      },
      auth: {
        status: "skipped",
        code: "auth.not-requested",
        reason: "未请求账号核验",
        ms: 0,
      },
    }),
  });
  const missing = status({
    installed: false,
    origin: "missing",
    version: undefined,
    executablePath: undefined,
    probe: probe({
      locate: { status: "failed", code: "locate.missing", reason: "未安装", ms: 3 },
      version: {
        status: "skipped",
        code: "stage.not-reached",
        reason: "前序阶段未通过，未执行",
        ms: 0,
      },
      protocol: {
        status: "skipped",
        code: "stage.not-reached",
        reason: "前序阶段未通过，未执行",
        ms: 0,
      },
      auth: {
        status: "skipped",
        code: "stage.not-reached",
        reason: "前序阶段未通过，未执行",
        ms: 0,
      },
    }),
  });

  assert.equal(studioProbeState(protocolFailed), "unusable");
  assert.equal(studioProbeState(missing), "not-installed");
  assert.notEqual(
    studioProbeBadgeKey({ status: protocolFailed, inspected: true, builtin: false }),
    studioProbeBadgeKey({ status: missing, inspected: true, builtin: false }),
  );
  assert.equal(
    studioProbeBadgeKey({ status: protocolFailed, inspected: true, builtin: false }),
    "studio.agents.probe.badgeUnusable",
  );
  assert.equal(
    studioProbeBadgeKey({ status: missing, inspected: true, builtin: false }),
    "studio.agents.notInstalled",
  );
});

test("each stage keeps its own state, code, reason and duration", () => {
  const views = studioProbeStageViews(
    probe({
      locate: ok("locate.ok", 5),
      version: { status: "timeout", code: "version.timeout", reason: "CLI 版本探测超时", ms: 8000 },
      protocol: {
        status: "skipped",
        code: "stage.not-reached",
        reason: "前序阶段未通过，未执行",
        ms: 0,
      },
      auth: {
        status: "skipped",
        code: "stage.not-reached",
        reason: "前序阶段未通过，未执行",
        ms: 0,
      },
    }),
  );
  assert.deepEqual(
    views.map((view) => [view.stage, view.state, view.code, view.ms]),
    [
      ["locate", "ok", "locate.ok", 5],
      ["version", "timeout", "version.timeout", 8000],
      ["protocol", "skipped", "stage.not-reached", 0],
      ["auth", "skipped", "stage.not-reached", 0],
    ],
  );
  assert.equal(views[1]?.reason, "CLI 版本探测超时");
  assert.equal(views[1]?.statusKey, "studio.agents.probe.status.timeout");
  assert.equal(views[1]?.labelKey, "studio.agents.probe.stage.version");
  assert.equal(views[1]?.glossKey, "studio.agents.probe.code.version.timeout");
});

test("unknown or malformed stage states are never rendered as passed", () => {
  const views = studioProbeStageViews({
    stages: {
      locate: { status: "ok", code: "locate.ok", ms: 1 },
      version: { status: "finished" as never, ms: 2 },
      protocol: undefined as never,
      auth: { status: "ok", code: "auth.ok", ms: 3 },
    },
    durationMs: 1,
    probedAt: 1,
  });
  assert.deepEqual(
    views.map((view) => view.state),
    ["ok", "unknown", "unknown", "ok"],
  );
  assert.equal(studioProbeState({ ...status(), probe: undefined }), "unknown");
  assert.equal(
    studioProbeBadgeKey({ status: status({ probe: undefined }), inspected: true, builtin: false }),
    "studio.agents.detected",
  );
  assert.equal(
    studioProbeBadgeKey({ status: undefined, inspected: false, builtin: false }),
    "studio.agents.unchecked",
  );
  assert.equal(
    studioProbeBadgeKey({ status: undefined, inspected: true, builtin: false }),
    "studio.agents.notInstalled",
  );
});

test("machine codes map to glosses only when the code is registered", () => {
  assert.equal(
    studioProbeCodeGlossKey("protocol.mismatch"),
    "studio.agents.probe.code.protocol.mismatch",
  );
  assert.equal(studioProbeCodeGlossKey("protocol.brand-new"), undefined);
  assert.equal(studioProbeCodeGlossKey(undefined), undefined);
});

test("the cached protocol stage is visible and not presented as a fresh handshake", () => {
  const cached = status({
    probe: {
      ...probe({
        locate: ok("locate.ok", 2),
        version: ok("version.ok", 6),
        protocol: ok("protocol.ok", 310),
        auth: { status: "skipped", code: "auth.not-requested", reason: "未请求账号核验", ms: 0 },
      }),
      cached: true,
    },
  });
  assert.equal(studioProbeCached(cached), true);
  assert.equal(studioProbeCached(status({ probe: undefined })), false);
  assert.equal(studioProbeState(cached), "verified");
});

test("capability rows keep reported booleans and separate unverified from unsupported", () => {
  const verified = status({ version: "0.151.0" });
  const bytewise = status({ version: "0.151.0" });
  const verifiedRows = studioCapabilityRows(verified);
  assert.deepEqual(
    verifiedRows.map((row) => [row.capability, row.supported, row.evidenceState]),
    [
      ["resume", true, "verified"],
      ["approval", true, "verified"],
      ["questions", true, "verified"],
      ["readOnly", true, "verified"],
      ["fullAccess", true, "verified"],
    ],
  );
  // 版本低于已核验下限：布尔值失败关闭，证据等级必须与「明确不支持」区分。
  const unverifiedVersion = "0.100.0";
  const downgraded = status({
    version: unverifiedVersion,
    capabilities: assessKernelCapabilities({ kernel: "codex", version: unverifiedVersion })
      .capabilities,
  });
  const downgradedRows = studioCapabilityRows(downgraded);
  assert.equal(downgradedRows.find((row) => row.capability === "readOnly")?.supported, false);
  assert.equal(
    downgradedRows.find((row) => row.capability === "readOnly")?.evidenceState,
    "unverified",
  );
  assert.equal(
    downgradedRows.find((row) => row.capability === "readOnly")?.evidenceKey,
    "studio.agents.capabilityEvidence.unverified",
  );
  // 明确不支持的内核保持 unsupported，绝不混同为 unverified。
  const claude = status({
    id: "claude-code",
    version: "2.1.220",
    capabilities: assessKernelCapabilities({ kernel: "claude-code", version: "2.1.220" })
      .capabilities,
  });
  assert.equal(
    studioCapabilityRows(claude).find((row) => row.capability === "readOnly")?.evidenceState,
    "unsupported",
  );
  assert.equal(bytewise.version, verified.version);
});

test("diagnostics stages are opt-in, bounded and refused when the shape is untrusted", () => {
  const fields = studioProbeDiagnosticFields(
    probe({
      locate: ok("locate.ok", 4),
      version: ok("version.ok", 10),
      protocol: {
        status: "failed",
        code: "protocol.mismatch",
        reason: "x".repeat(400),
        ms: 700,
      },
      auth: { status: "skipped", code: "auth.not-requested", reason: "未请求账号核验", ms: 0 },
    }),
  );
  assert(fields);
  assert.equal(fields.stages.protocol.status, "failed");
  assert.equal(fields.stages.protocol.code, "protocol.mismatch");
  assert.equal(fields.stages.protocol.reason?.length, 240);
  assert.equal(fields.probedAt, 1_700_000_000_000);
  assert.equal(fields.cached, undefined);
  assert.equal(studioProbeDiagnosticFields(undefined), undefined);
  assert.equal(
    studioProbeDiagnosticFields({
      stages: { locate: { status: "ok", ms: 1 } } as never,
      durationMs: 1,
      probedAt: 1,
    }),
    undefined,
  );
});

test("the auth hint is read-only, offered only for authentication reasons, and never calls out", () => {
  const authFailed = status({
    installed: false,
    probe: probe({
      locate: ok("locate.ok", 3),
      version: ok("version.ok", 9),
      protocol: ok("protocol.ok", 400),
      auth: { status: "failed", code: "auth.failed", reason: "凭据已过期", ms: 20 },
    }),
  });
  const protocolFailed = status({
    installed: false,
    probe: probe({
      locate: ok("locate.ok", 3),
      version: ok("version.ok", 9),
      protocol: {
        status: "failed",
        code: "protocol.mismatch",
        reason: "CLI 未通过 ACP v1 握手",
        ms: 400,
      },
      auth: {
        status: "skipped",
        code: "stage.not-reached",
        reason: "前序阶段未通过，未执行",
        ms: 0,
      },
    }),
  });
  const autoSkipped = status({
    probe: probe({
      locate: ok("locate.ok", 3),
      version: ok("version.ok", 9),
      protocol: ok("protocol.ok", 400),
      auth: {
        status: "skipped",
        code: "auth.not-requested",
        reason: "未请求账号核验；握手成功不代表账号可用，Studio 从不代登录",
        ms: 0,
      },
    }),
  });

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    throw new Error("network access is not allowed here");
  }) as typeof fetch;
  try {
    const hint = studioAuthHint(authFailed, "Codex");
    assert(hint);
    assert.equal(hint.cliName, "Codex");
    assert.equal(hint.stage, "auth");
    assert.equal(hint.code, "auth.failed");
    assert.equal(studioAuthHint(protocolFailed, "Codex"), undefined);
    // `auth.not-requested` 的跳过不是认证失败：默认文案里的「登录」不得触发提示。
    assert.equal(studioAuthHint(autoSkipped, "Codex"), undefined);
    assert.equal(studioAuthHint(undefined, "Codex"), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
  // 只读保证：模块不导出任何执行登录/写入凭据的入口。
  assert.deepEqual(Object.keys(probeView).sort(), [
    "studioAuthHint",
    "studioCapabilityRows",
    "studioProbeBadgeKey",
    "studioProbeCached",
    "studioProbeCodeGlossKey",
    "studioProbeDiagnosticFields",
    "studioProbeFirstFailure",
    "studioProbeStageViews",
    "studioProbeState",
  ]);
});
