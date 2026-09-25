import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDiagnosticRequestSchema } from "@knorvia/shared";

const secret = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
const homePath = "C:\\Users\\alice\\.codex\\auth.json";

function staged(overrides: Record<string, unknown> = {}) {
  return {
    stages: {
      locate: { status: "ok", code: "locate.ok", ms: 4 },
      version: { status: "timeout", code: "version.timeout", reason: "CLI 版本探测超时", ms: 8000 },
      protocol: { status: "skipped", code: "stage.not-reached", ms: 0 },
      auth: { status: "skipped", code: "auth.not-requested", ms: 0 },
    },
    durationMs: 8040,
    probedAt: 1_700_000_000_000,
    ...overrides,
  };
}

test("staged probe fields are opt-in, redacted, and never leak paths or credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-diagnostics-probe-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  const source = join(root, "source");
  try {
    const { previewLocalDiagnostics, discardLocalDiagnosticPreview } =
      await import("../src/main/localDiagnostics.js");
    await mkdir(join(source, "logs"), { recursive: true });
    await writeFile(join(source, "logs", "app.log"), "ready: true\n");
    const preview = await previewLocalDiagnostics(
      {
        inspection: "complete",
        kernels: [
          {
            id: "codex",
            name: "Codex",
            installed: false,
            version: "0.151.0",
            origin: "external",
            probe: staged({
              stages: {
                locate: {
                  status: "failed",
                  code: "locate.failed",
                  reason: `无法使用 ${homePath} 的凭据 apiKey=${secret}`,
                  ms: 12,
                },
                version: { status: "skipped", code: "stage.not-reached", ms: 0 },
                protocol: {
                  status: "failed",
                  code: "protocol.mismatch",
                  reason: "CLI 未通过 ACP v1 握手",
                  ms: 400,
                },
                auth: { status: "skipped", code: "auth.not-requested", ms: 0 },
              },
            }),
          },
          // 未勾选阶段信息的内核保持旧形状，载荷里不出现 probe。
          { id: "claude-code", name: "Claude Code", installed: true, origin: "external" },
        ],
      },
      { sourceDir: source, stageRootDir: join(root, "stage") },
    );
    const kernels = preview.files.find((file) => file.path === "kernels.json");
    assert(kernels);
    const text = kernels.snippet;
    assert.match(text, /"probe"/);
    assert.match(text, /"status": "failed"/);
    assert.match(text, /"code": "protocol\.mismatch"/);
    assert.match(text, /"ms": 400/);
    assert.match(text, /"probedAt": 1700000000000/);
    assert.match(text, /\[path\]/);
    assert.equal(text.includes("alice"), false);
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes("auth.json"), false);
    // 旧字段继续导出，未勾选的内核不含阶段信息。
    assert.match(text, /"installed": true/);
    assert.equal((text.match(/"probe"/g) ?? []).length, 1);
    await discardLocalDiagnosticPreview(preview.id);
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("the widened request schema stays strict about stage shape", () => {
  const base = {
    id: "codex",
    name: "Codex",
    installed: true,
    origin: "external" as const,
  };
  assert.equal(
    localDiagnosticRequestSchema.safeParse({
      inspection: "complete",
      kernels: [{ ...base, probe: staged() }],
    }).success,
    true,
  );
  assert.equal(
    localDiagnosticRequestSchema.safeParse({
      inspection: "complete",
      kernels: [{ ...base, probe: staged({ extra: true }) }],
    }).success,
    false,
  );
  assert.equal(
    localDiagnosticRequestSchema.safeParse({
      inspection: "complete",
      kernels: [
        {
          ...base,
          probe: staged({
            stages: {
              locate: { status: "running", code: "locate.ok", ms: 1 },
              version: { status: "skipped", code: "stage.not-reached", ms: 0 },
              protocol: { status: "skipped", code: "stage.not-reached", ms: 0 },
              auth: { status: "skipped", code: "stage.not-reached", ms: 0 },
            },
          }),
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    localDiagnosticRequestSchema.safeParse({
      inspection: "complete",
      kernels: [
        {
          ...base,
          probe: staged({
            stages: {
              locate: { status: "ok", code: "locate.ok", ms: 1 },
              version: { status: "skipped", code: "stage.not-reached", ms: 0 },
              protocol: { status: "skipped", code: "stage.not-reached", ms: 0 },
            },
          }),
        },
      ],
    }).success,
    false,
  );
});
