import assert from "node:assert/strict";
import test from "node:test";
import {
  PLUGIN_MANAGEMENT_KERNEL_ID,
  parsePluginCompatibilitySidecar,
  pickKernelCompatibilityEntry,
  pluginCompatibilitySidecarPath,
  reportHostCapabilitiesForPlugin,
  resolvePluginCompatibilityView,
  type ParsedPluginCompatibility,
  type PluginCompatibilityView,
} from "../src/settings/pluginCompatibilityProjection.js";

// 纯投影测试：不加载 DOM、不启动服务、不读真实文件。
// 覆盖四值状态、缺文件、非法文件与能力缺口；渲染由 settings 面板负责，不在本测试范围内。
const baseSidecar = {
  compatibilityVersion: 1,
  plugin: "project-handoff",
  components: {
    skills: "required",
    agents: "absent",
    commands: "absent",
    hooks: "absent",
    mcpServers: "absent",
    scripts: "absent",
  },
  kernels: [
    { kernel: "knorvia", status: "declared", reason: "No runtime evidence was collected." },
    { kernel: "*", status: "unknown", reason: "No other kernel was exercised." },
  ],
  requires: [{ capability: "skills.enabled-catalog", whenMissing: "report" }],
};

function viewFor(kernels: unknown[], requires: unknown[], extra: Record<string, unknown> = {}) {
  return resolvePluginCompatibilityView({
    pluginId: "project-handoff@knorvia-plugins-bundled",
    pluginName: "project-handoff",
    rootPath: "/home/dev/.knorvia-studio/plugins/project-handoff",
    sidecar: {
      kind: "text",
      text: JSON.stringify({ ...baseSidecar, kernels, requires, ...extra }),
    },
  });
}

function kernelEntry(view: PluginCompatibilityView) {
  return view.statusReasonCode;
}

test("compatibility sidecar path joins POSIX and Windows roots without a second carrier", () => {
  assert.equal(
    pluginCompatibilitySidecarPath("/home/dev/plugins/pack"),
    "/home/dev/plugins/pack/.knorvia-plugin/compatibility.json",
  );
  assert.equal(
    pluginCompatibilitySidecarPath("C:\\Users\\dev\\plugins\\pack\\"),
    "C:\\Users\\dev\\plugins\\pack\\.knorvia-plugin\\compatibility.json",
  );
  assert.equal(pluginCompatibilitySidecarPath(""), ".knorvia-plugin/compatibility.json");
});

test("each of the four declared statuses renders with its own meaning", () => {
  const verified = viewFor(
    [
      {
        kernel: "knorvia",
        status: "verified",
        reason: "Ran the pack on this kernel.",
        evidence: ["artifacts/project-handoff-run.json"],
      },
      { kernel: "*", status: "unknown", reason: "Not exercised." },
    ],
    baseSidecar.requires,
  );
  assert.equal(verified.status, "verified");
  assert.equal(verified.unverified, false, "verified is the only status shown as verified");
  assert.deepEqual(verified.evidence, ["artifacts/project-handoff-run.json"]);

  const declared = viewFor(baseSidecar.kernels, baseSidecar.requires);
  assert.equal(declared.status, "declared");
  assert.equal(declared.unverified, true, "declared must still read as unverified");
  assert.deepEqual(declared.evidence, []);

  const unsupported = viewFor(
    [
      { kernel: "knorvia", status: "unsupported", reason: "Host rejects this component kind." },
      { kernel: "*", status: "unknown", reason: "Not exercised." },
    ],
    baseSidecar.requires,
  );
  assert.equal(kernelEntry(unsupported), "compatibility.unsupported");
  assert.equal(unsupported.unverified, true);
  assert.equal(unsupported.otherKernels.length, 1);

  const unknown = viewFor(
    [
      { kernel: "knorvia", status: "unknown", reason: "Never verified." },
      { kernel: "*", status: "unknown", reason: "Never verified." },
    ],
    baseSidecar.requires,
  );
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.unverified, true);
});

test("a verified kernel without evidence is not parsed as verified", () => {
  const parsed = parsePluginCompatibilitySidecar(
    JSON.stringify({
      ...baseSidecar,
      kernels: [{ kernel: "knorvia", status: "verified", reason: "trust me" }],
    }),
  );
  // 解析本身允许缺 evidence（规格由 plugin-skill-packs.test.ts 机械校验），
  // 但投影不得把无证据的 verified 当成证据展示。
  assert.equal(parsed.kind, "parsed");
  const view = viewFor([{ kernel: "knorvia", status: "verified", reason: "trust me" }], []);
  assert.deepEqual(view.evidence, [], "evidence must stay empty when the declaration has none");
});

test("a plugin without a compatibility file degrades to unverified instead of crashing", () => {
  for (const sidecar of [
    { kind: "missing" } as const,
    { kind: "unreadable", message: "EACCES" } as const,
  ]) {
    const view = resolvePluginCompatibilityView({
      pluginId: "material-organizer@local",
      pluginName: "material-organizer",
      rootPath: "/home/dev/plugins/material-organizer",
      sidecar,
    });
    assert.equal(view.status, "unknown");
    assert.equal(view.unverified, true);
    assert.equal(view.gapCount, 0);
    assert.deepEqual(view.capabilities, []);
    assert.equal(
      view.sidecarState,
      sidecar.kind,
      "the panel must be able to tell missing from unreadable",
    );
  }
  const missing = resolvePluginCompatibilityView({
    pluginId: "material-organizer@local",
    pluginName: "material-organizer",
    rootPath: "/home/dev/plugins/material-organizer",
    sidecar: { kind: "missing" },
  });
  assert.equal(missing.statusReasonCode, "compatibility.sidecarMissing");
  assert.equal(missing.kernelId, PLUGIN_MANAGEMENT_KERNEL_ID);
});

test("a malformed compatibility file degrades to unverified with a machine-readable reason", () => {
  const malformed = [
    "{ not json",
    JSON.stringify({ ...baseSidecar, compatibilityVersion: 2 }),
    JSON.stringify({ ...baseSidecar, plugin: "" }),
    JSON.stringify({ ...baseSidecar, kernels: "knorvia" }),
    JSON.stringify({
      ...baseSidecar,
      kernels: [{ kernel: "knorvia", status: "probably", reason: "x" }],
    }),
    JSON.stringify({
      ...baseSidecar,
      kernels: [{ kernel: "knorvia", status: "declared", reason: "" }],
    }),
    JSON.stringify({ ...baseSidecar, requires: [{ capability: "x", whenMissing: "ignore" }] }),
  ];
  for (const text of malformed) {
    const view = resolvePluginCompatibilityView({
      pluginId: "document-quality-check@local",
      pluginName: "document-quality-check",
      rootPath: "/home/dev/plugins/document-quality-check",
      sidecar: { kind: "text", text },
    });
    assert.equal(view.status, "unknown", `should reject: ${text}`);
    assert.equal(view.sidecarState, "malformed");
    assert.equal(view.unverified, true);
    assert.equal(view.gapCount, 0);
  }
});

test("a sidecar whose plugin name disagrees with the manifest is not trusted", () => {
  const view = resolvePluginCompatibilityView({
    pluginId: "project-handoff@local",
    pluginName: "another-plugin",
    rootPath: "/home/dev/plugins/project-handoff",
    sidecar: { kind: "text", text: JSON.stringify(baseSidecar) },
  });
  assert.equal(view.status, "unknown");
  assert.equal(view.statusReasonCode, "compatibility.sidecarMalformed");
  assert.equal(view.unverified, true);
});

test("a capability gap is reported per capability with a machine-readable reason", () => {
  const view = viewFor(
    [
      { kernel: "knorvia", status: "unsupported", reason: "The host does not run this component." },
      { kernel: "*", status: "unknown", reason: "Not exercised." },
    ],
    [
      { capability: "skills.enabled-catalog", whenMissing: "report" },
      { capability: "document.text-extraction", whenMissing: "refuse" },
    ],
  );
  assert.equal(view.gapCount, 2);
  assert.deepEqual(
    view.capabilities.map((entry) => entry.disposition),
    ["unavailable", "unavailable"],
  );
  assert.equal(view.capabilities[0]?.reasonCode, "capability.kernelUnsupported");
  assert.equal(view.capabilities[0]?.blocksRun, false, "report does not refuse the request");
  assert.equal(view.capabilities[1]?.blocksRun, true, "refuse with a gap must block the request");
  // 理由原文来自声明，必须原样带出，不能被改写成「暂时不可用」。
  assert.equal(view.authorReason, "The host does not run this component.");
});

test("unreported capabilities stay unverified and reported ones stay evidence-backed", () => {
  const view = viewFor(
    baseSidecar.kernels,
    [
      { capability: "skills.enabled-catalog", whenMissing: "report" },
      { capability: "filesystem.read", whenMissing: "report" },
    ],
    {},
  );
  // 没有宿主上报时，两个能力都只能是未验证。
  assert.deepEqual(
    view.capabilities.map((entry) => entry.disposition),
    ["unverified", "unverified"],
  );
  assert.equal(view.capabilities[0]?.reasonCode, "capability.kernelDeclared");

  const withHostReport = resolvePluginCompatibilityView({
    pluginId: "project-handoff@local",
    pluginName: "project-handoff",
    rootPath: "/home/dev/plugins/project-handoff",
    sidecar: {
      kind: "text",
      text: JSON.stringify({
        ...baseSidecar,
        requires: [
          { capability: "skills.enabled-catalog", whenMissing: "report" },
          { capability: "filesystem.read", whenMissing: "report" },
        ],
      }),
    },
    hostReport: {
      capabilities: ["skills.enabled-catalog"],
      evidence: { "skills.enabled-catalog": "2 skills enumerated" },
    },
  });
  assert.equal(withHostReport.capabilities[0]?.disposition, "available");
  assert.equal(withHostReport.capabilities[0]?.evidence, "2 skills enumerated");
  assert.equal(
    withHostReport.capabilities[1]?.disposition,
    "unverified",
    "unreported stays unverified",
  );
});

test("host capability reporting only claims what the plugin projection shows", () => {
  const disabled = reportHostCapabilitiesForPlugin({
    enabled: false,
    skillRootCount: 3,
    components: [{ kind: "skill", items: [{ name: "a" }, { name: "b" }] }],
  });
  assert.deepEqual(disabled.capabilities, [], "a disabled plugin reports nothing");

  const enabled = reportHostCapabilitiesForPlugin({
    enabled: true,
    skillRootCount: 0,
    components: [{ kind: "skill", items: [{ name: "a" }] }],
  });
  assert.deepEqual(enabled.capabilities, ["skills.enabled-catalog"]);

  const empty = reportHostCapabilitiesForPlugin({ enabled: true, skillRootCount: 0 });
  assert.deepEqual(empty.capabilities, [], "no enumerated skill means no claim");
});

test("kernel lookup prefers the exact entry and falls back to the wildcard", () => {
  const parsed = parsePluginCompatibilitySidecar(JSON.stringify(baseSidecar));
  assert.equal(parsed.kind, "parsed");
  const data = (parsed as { kind: "parsed"; data: ParsedPluginCompatibility }).data;
  assert.equal(pickKernelCompatibilityEntry(data.kernels, "knorvia")?.status, "declared");
  assert.equal(pickKernelCompatibilityEntry(data.kernels, "codex")?.kernel, "*");

  const withoutWildcard = viewFor(
    [{ kernel: "knorvia", status: "declared", reason: "No runtime evidence." }],
    baseSidecar.requires,
  );
  const absent = resolvePluginCompatibilityView({
    pluginId: "project-handoff@local",
    pluginName: "project-handoff",
    rootPath: "/home/dev/plugins/project-handoff",
    sidecar: {
      kind: "text",
      text: JSON.stringify({
        ...baseSidecar,
        kernels: [{ kernel: "codex", status: "declared", reason: "No runtime evidence." }],
      }),
    },
  });
  assert.equal(withoutWildcard.status, "declared");
  assert.equal(absent.status, "unknown");
  assert.equal(absent.statusReasonCode, "compatibility.kernelAbsent");
});
