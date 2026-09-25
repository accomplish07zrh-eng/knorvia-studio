import assert from "node:assert/strict";
import test from "node:test";
import type {
  CreateCreationJobInput,
  CreationJob,
  CreationOutput,
  CreationReuseDraft,
  CreationVerification,
} from "@knorvia/services";
import {
  creationJobInputFromDraft,
  creationReferenceInput,
  executeCreationAction,
  type CreationActionPorts,
} from "../src/studio/creation/creationActions.js";

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

const output: CreationOutput = {
  id: "output-1",
  name: "creation-job-1.png",
  mimeType: "image/png",
  path: "/tmp/creation-job-1.png",
  size: 2048,
  hash: "a".repeat(64),
};

const reference = { name: "creation-job-1.png", mimeType: "image/png", dataBase64: "AAAA" };

function draft(): CreationReuseDraft {
  return {
    requestId: "reuse-job-1-abcd1234",
    kind: "image",
    modelId: "model-1",
    prompt: "一只猫",
    provenance: { parentJobId: "job-1", repeatOfRequestId: "req-1" },
    missing: [],
    previousResultUnknown: false,
    reference,
  };
}

/** 假服务只记录调用序列，用来断言核验路径永远不会提交新任务。 */
function ports(overrides: Partial<CreationActionPorts> = {}) {
  const calls: string[] = [];
  const created: CreateCreationJobInput[] = [];
  const base: CreationActionPorts = {
    creation: {
      reuseJob: async (id: string) => {
        calls.push(`reuseJob:${id}`);
        return draft();
      },
      createJob: async (input: CreateCreationJobInput) => {
        calls.push("createJob");
        created.push(input);
        return job({ id: "job-2", requestId: input.requestId, provenance: input.provenance });
      },
      verifyJob: async (id: string): Promise<CreationVerification> => {
        calls.push(`verifyJob:${id}`);
        return {
          job: job({ id, requestId: "req-1", status: "interrupted" }),
          outcome: "unknown",
          message: "远端任务尚未结束，结果仍未知。",
          checkedAt: "2026-01-02T00:00:00.000Z",
        };
      },
    },
    newRequestId: () => "req-new",
    readReference: async () => reference,
    ...overrides,
  };
  return { ...base, calls, created };
}

test("verify runs read-only and never creates a job", async () => {
  const fake = ports();
  const result = await executeCreationAction(
    { action: "verify", job: job({ status: "interrupted" }) },
    fake,
  );
  assert.equal(result.kind, "verified");
  assert.deepEqual(fake.calls, ["verifyJob:job-1"]);
  assert.deepEqual(fake.created, []);
});

test("reuse only returns a draft and does not submit", async () => {
  const fake = ports();
  const result = await executeCreationAction({ action: "reuse", job: job() }, fake);
  assert.equal(result.kind, "draft");
  assert.deepEqual(fake.calls, ["reuseJob:job-1"]);
  assert.deepEqual(fake.created, []);
});

test("variant resubmits the reuse draft under its own new request id and provenance", async () => {
  const fake = ports();
  const result = await executeCreationAction({ action: "variant", job: job() }, fake);
  assert.equal(result.kind, "submitted");
  assert.deepEqual(fake.calls, ["reuseJob:job-1", "createJob"]);
  assert.deepEqual(fake.created, [
    {
      requestId: "reuse-job-1-abcd1234",
      kind: "image",
      modelId: "model-1",
      prompt: "一只猫",
      provenance: { parentJobId: "job-1", repeatOfRequestId: "req-1" },
      reference,
    },
  ]);
});

test("continue-as-reference records the referenced output and reads its bytes", async () => {
  const read: string[] = [];
  const fake = ports({
    readReference: async (item) => {
      read.push(item.path);
      return reference;
    },
  });
  const result = await executeCreationAction(
    { action: "reference", job: job({ outputs: [output] }), output },
    fake,
  );
  assert.equal(result.kind, "submitted");
  assert.deepEqual(read, ["/tmp/creation-job-1.png"]);
  assert.deepEqual(fake.created[0].provenance, {
    parentJobId: "job-1",
    referencedOutputId: "output-1",
  });
  assert.equal(fake.created[0].requestId, "req-new");
  assert.deepEqual(fake.created[0].reference, reference);
  assert.equal(fake.created[0].prompt, "一只猫");
});

test("submit input builders keep the draft id and drop absent slots", () => {
  assert.deepEqual(creationJobInputFromDraft(draft()), {
    requestId: "reuse-job-1-abcd1234",
    kind: "image",
    modelId: "model-1",
    prompt: "一只猫",
    provenance: { parentJobId: "job-1", repeatOfRequestId: "req-1" },
    reference,
  });
  const withFrame = { ...draft(), reference: undefined, firstFrame: reference };
  assert.deepEqual(Object.keys(creationJobInputFromDraft(withFrame)).sort(), [
    "firstFrame",
    "kind",
    "modelId",
    "prompt",
    "provenance",
    "requestId",
  ]);
  assert.deepEqual(
    creationReferenceInput({ job: job(), output, requestId: "req-new", reference }),
    {
      requestId: "req-new",
      kind: "image",
      modelId: "model-1",
      prompt: "一只猫",
      provenance: { parentJobId: "job-1", referencedOutputId: "output-1" },
      reference,
    },
  );
});
