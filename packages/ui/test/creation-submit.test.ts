import assert from "node:assert/strict";
import test from "node:test";
import {
  creationSubmissionSignature,
  resolveCreationSubmission,
} from "../src/studio/creation/creationSubmit.js";
import type { CreationFiles } from "../src/studio/creation/creationInput.js";

const NO_FILES: CreationFiles = { reference: null, firstFrame: null, lastFrame: null };

test("a repeat of the same submission reuses the same request id", () => {
  const signature = creationSubmissionSignature({
    kind: "image",
    modelId: "model-1",
    prompt: " 一只猫 ",
  });
  const first = resolveCreationSubmission(null, { signature, files: NO_FILES, requestId: "req-1" });
  assert.equal(first.reused, false);
  assert.equal(first.submission.requestId, "req-1");

  const repeat = resolveCreationSubmission(first.submission, {
    signature,
    files: NO_FILES,
    requestId: "req-2",
  });
  assert.equal(repeat.reused, true);
  assert.equal(repeat.submission.requestId, "req-1");
  // 复用时不替换原对象，调用方据此避免多余的状态写入。
  assert.equal(repeat.submission, first.submission);
});

test("a new generation intent gets a new request id", () => {
  const base = { kind: "image" as const, modelId: "model-1", prompt: "一只猫" };
  const first = resolveCreationSubmission(null, {
    signature: creationSubmissionSignature(base),
    files: NO_FILES,
    requestId: "req-1",
  });
  const changedPrompt = resolveCreationSubmission(first.submission, {
    signature: creationSubmissionSignature({ ...base, prompt: "一只狗" }),
    files: NO_FILES,
    requestId: "req-2",
  });
  assert.equal(changedPrompt.reused, false);
  assert.equal(changedPrompt.submission.requestId, "req-2");

  // 换了参考图文件同样是新的生成意图，即使文字没变。
  const withFile: CreationFiles = { ...NO_FILES, reference: {} as File };
  const changedFiles = resolveCreationSubmission(first.submission, {
    signature: creationSubmissionSignature(base),
    files: withFile,
    requestId: "req-3",
  });
  assert.equal(changedFiles.reused, false);
  assert.equal(changedFiles.submission.requestId, "req-3");
});

test("the signature covers provenance and trims the prompt like the server does", () => {
  const bare = creationSubmissionSignature({ kind: "image", modelId: "m", prompt: " 猫 " });
  assert.equal(bare, creationSubmissionSignature({ kind: "image", modelId: "m", prompt: "猫" }));
  assert.notEqual(
    bare,
    creationSubmissionSignature({
      kind: "image",
      modelId: "m",
      prompt: "猫",
      provenance: { parentJobId: "job-1" },
    }),
  );
  assert.notEqual(
    creationSubmissionSignature({ kind: "image", modelId: "m", prompt: "猫" }),
    creationSubmissionSignature({ kind: "video", modelId: "m", prompt: "猫" }),
  );
});
