import assert from "node:assert/strict";
import test from "node:test";
import type { CreationJob, CreationModel, CreationOutput } from "@knorvia/services";
import {
  creationDisabledEntries,
  creationEntryStates,
  creationHistoryDetail,
  creationReferenceOutput,
  creationVerificationView,
} from "../src/studio/creation/creationEntries.js";

function job(overrides: Partial<CreationJob> = {}): CreationJob {
  return {
    id: "job-1",
    requestId: "req-1",
    kind: "image",
    modelId: "model-1",
    prompt: "一只猫",
    status: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    outputs: [],
    ...overrides,
  };
}

function imageOutput(overrides: Partial<CreationOutput> = {}): CreationOutput {
  return {
    id: "output-1",
    name: "creation-job-1.png",
    mimeType: "image/png",
    path: "/tmp/creation-job-1.png",
    size: 1024,
    hash: "a".repeat(64),
    ...overrides,
  };
}

function imageModel(overrides: Partial<CreationModel> = {}): CreationModel {
  return {
    id: "model-1",
    name: "图片模型",
    kind: "image",
    protocol: "openai-images",
    baseUrl: "http://127.0.0.1:9",
    model: "gpt-image-1",
    enabled: true,
    configured: true,
    ...overrides,
  };
}

test("entry gating follows model availability and the shared reference-slot predicate", () => {
  const succeeded = job({ status: "succeeded", outputs: [imageOutput()] });
  const openai = creationEntryStates(succeeded, imageModel());
  assert.equal(openai.reuse.enabled, true);
  assert.equal(openai.variant.enabled, true);
  assert.equal(openai.reference.enabled, true);
  assert.equal(openai.reference.bills, true);
  assert.equal(openai.variant.bills, true);
  assert.equal(openai.reuse.bills, false);
  // 已有确定结果的任务不需要核验，入口保持禁用并给出理由。
  assert.equal(openai.verify.enabled, false);
  assert.equal(openai.verify.reason, "verifyReasonStatus");
  assert.equal(openai.verify.bills, false);

  // ComfyUI 工作流没有 {{image}} 占位符：同一个谓词判定参考图槽位不可用。
  const comfyWithoutSlot = creationEntryStates(
    job({ status: "succeeded", referenceName: "ref.png", outputs: [imageOutput()] }),
    imageModel({ protocol: "comfyui", workflowJson: '{"1":{"inputs":{}}}' }),
  );
  assert.equal(comfyWithoutSlot.reuse.enabled, false);
  assert.equal(comfyWithoutSlot.reuse.reason, "entryReasonSlotReference");
  assert.equal(comfyWithoutSlot.variant.enabled, false);
  assert.equal(comfyWithoutSlot.reference.enabled, false);
  assert.equal(comfyWithoutSlot.reference.reason, "entryReasonSlotReference");

  // JSON API 声明了 {{imageBase64}}：与 createJob 的服务端门控一致地放行。
  const jsonApi = creationEntryStates(
    job({ status: "succeeded", outputs: [imageOutput()] }),
    imageModel({
      protocol: "json-api",
      apiMapping: {
        requestPath: "/v1/images",
        requestTemplate: '{"image":"{{imageBase64}}"}',
        outputPath: "data.0.b64_json",
      },
    }),
  );
  assert.equal(jsonApi.reuse.enabled, true);
  assert.equal(jsonApi.reference.enabled, true);
});

test("entry gating reports each real blocker instead of a generic message", () => {
  const succeeded = job({ status: "succeeded", outputs: [imageOutput()] });
  assert.equal(
    creationEntryStates(job({ status: "running" }), imageModel()).reuse.reason,
    "entryReasonRunning",
  );
  assert.equal(creationEntryStates(succeeded, undefined).reuse.reason, "entryReasonModelMissing");
  assert.equal(
    creationEntryStates(succeeded, imageModel({ enabled: false })).variant.reason,
    "entryReasonModelDisabled",
  );
  assert.equal(
    creationEntryStates(succeeded, imageModel({ kind: "video" })).reuse.reason,
    "entryReasonModelKind",
  );
  assert.equal(
    creationEntryStates(succeeded, imageModel({ configured: false })).reuse.reason,
    "entryReasonModelUnconfigured",
  );
  // 旧记录没有成果哈希：与工作流交接规则一致地拒绝作为参考。
  const olderOutput: CreationOutput = imageOutput();
  delete (olderOutput as { hash?: string }).hash;
  assert.equal(
    creationEntryStates(job({ status: "succeeded", outputs: [olderOutput] }), imageModel())
      .reference.reason,
    "referenceReasonHash",
  );
  assert.equal(
    creationEntryStates(job({ status: "succeeded" }), imageModel()).reference.reason,
    "referenceReasonOutput",
  );
  assert.equal(
    creationEntryStates(
      job({ status: "succeeded", outputs: [imageOutput({ mimeType: "video/mp4" })] }),
      imageModel(),
    ).reference.reason,
    "referenceReasonKind",
  );
  assert.equal(
    creationEntryStates(job({ status: "failed" }), imageModel()).reference.reason,
    "referenceReasonStatus",
  );
});

test("unknown results expose the read-only verify entry and warn before resubmitting", () => {
  const interrupted = job({ status: "interrupted" });
  const states = creationEntryStates(interrupted, imageModel());
  assert.equal(states.verify.enabled, true);
  assert.equal(states.verify.bills, false);
  assert.equal(states.variant.enabled, true);
  assert.equal(states.variant.note, "variantUnknownResult");
  assert.equal(states.reference.enabled, false);
  assert.equal(
    creationEntryStates(interrupted, undefined).verify.reason,
    "verifyReasonModelMissing",
  );

  const cancelled = creationEntryStates(job({ status: "cancelled" }), imageModel());
  assert.equal(cancelled.verify.enabled, true);

  const disabled = creationDisabledEntries(states);
  assert.deepEqual(disabled, [
    { reason: "referenceReasonStatus", labels: ["continueAsReference"] },
  ]);

  // 同一原因覆盖多个入口时合并成一组，避免重复同一句说明。
  assert.deepEqual(
    creationDisabledEntries(creationEntryStates(job({ status: "running" }), imageModel())),
    [
      { reason: "entryReasonRunning", labels: ["reuseParameters", "variant"] },
      { reason: "referenceReasonStatus", labels: ["continueAsReference"] },
      { reason: "verifyReasonStatus", labels: ["verifyRemote"] },
    ],
  );
});

test("reference output selection only exposes exactly one recorded output", () => {
  assert.equal(creationReferenceOutput(job({ outputs: [] })), undefined);
  const output = imageOutput();
  assert.equal(creationReferenceOutput(job({ outputs: [output] }))?.id, "output-1");
});

test("snapshot rendering shows captured whitelist fields and provenance", () => {
  const detail = creationHistoryDetail(
    job({
      reconstructible: true,
      missing: [],
      parameterSnapshot: {
        kind: "image",
        modelId: "model-1",
        modelName: "图片模型",
        protocol: "comfyui",
        prompt: "一只猫",
        referenceName: "ref.png",
        referenceHash: "b".repeat(64),
        params: { prompt: "一只猫", model: "flux-dev" },
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
      provenance: {
        parentJobId: "job-parent",
        referencedOutputId: "output-parent",
        repeatOfRequestId: "req-parent",
      },
    }),
  );
  assert.equal(detail.reconstructible, true);
  assert.deepEqual(detail.missing, []);
  assert.deepEqual(
    detail.snapshot.map((row) => row.label),
    [
      "snapshotKind",
      "snapshotModel",
      "snapshotProtocol",
      "snapshotProviderModel",
      "snapshotPrompt",
      "snapshotCapturedAt",
      "snapshotReference",
    ],
  );
  assert.equal(detail.snapshot[0].messageId, "image");
  assert.equal(detail.snapshot[2].messageId, "protocol.comfyui");
  assert.equal(detail.snapshot[3].value, "flux-dev");
  // 参考图只给出名称与哈希前缀，不展示字节。
  assert.equal(detail.snapshot[6].value, `ref.png · ${"b".repeat(12)}`);
  assert.deepEqual(
    detail.provenance.map((row) => row.value),
    ["job-parent", "output-parent", "req-parent"],
  );
});

test("an old record without a snapshot stays explicitly non-reconstructible", () => {
  const detail = creationHistoryDetail(
    job({ status: "succeeded", reconstructible: false, missing: ["parameterSnapshot"] }),
  );
  assert.equal(detail.reconstructible, false);
  // 没有快照就不渲染任何参数行；绝不拿当前设置或任务字段顶替历史参数。
  assert.deepEqual(detail.snapshot, []);
  assert.deepEqual(detail.missing, ["parameterSnapshot"]);
  assert.deepEqual(detail.provenance, []);

  // 快照存在但与记录不一致时，显示记录里真实存在的值，并保留缺失项。
  const inconsistent = creationHistoryDetail(
    job({
      reconstructible: false,
      missing: ["parameterSnapshot.prompt"],
      parameterSnapshot: {
        kind: "image",
        modelId: "model-1",
        modelName: "旧模型名",
        protocol: "json-api",
        prompt: "当时的提示词",
        params: { prompt: "当时的提示词", model: "flux-dev" },
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
  );
  assert.equal(inconsistent.reconstructible, false);
  assert.deepEqual(inconsistent.missing, ["parameterSnapshot.prompt"]);
  assert.equal(
    inconsistent.snapshot.find((row) => row.label === "snapshotPrompt")?.value,
    "当时的提示词",
  );
});

test("verification outcomes map to honest display states", () => {
  const base = job({ status: "interrupted", checkedAt: "2026-01-02T00:00:00.000Z" });
  assert.deepEqual(
    ["succeeded", "failed", "unknown", "unsupported"].map((outcome) => {
      const view = creationVerificationView({
        job: base,
        outcome: outcome as "succeeded" | "failed" | "unknown" | "unsupported",
        message: `服务端原文 ${outcome}`,
        checkedAt: "2026-01-02T00:00:00.000Z",
      });
      return [view.tone, view.label, view.message];
    }),
    [
      ["success", "verifyOutcomeSucceeded", "服务端原文 succeeded"],
      ["failure", "verifyOutcomeFailed", "服务端原文 failed"],
      ["unknown", "verifyOutcomeUnknown", "服务端原文 unknown"],
      ["unsupported", "verifyOutcomeUnsupported", "服务端原文 unsupported"],
    ],
  );
});
