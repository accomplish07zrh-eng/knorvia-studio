import assert from "node:assert/strict";
import test from "node:test";
import type { CreationJob } from "@knorvia/services";
import { filterCreationJobs } from "../src/studio/creation/creationHistory.js";

function job(id: string, kind: CreationJob["kind"], modelId: string, status: CreationJob["status"]): CreationJob {
  return { id, requestId: id, kind, modelId, prompt: id, status, createdAt: id,
    updatedAt: id, outputs: [] };
}

test("creation history filters by kind, model and status without mutating saved jobs", () => {
  const jobs = [job("c", "video", "old-deleted-model", "failed"),
    job("b", "image", "image-model", "succeeded"), job("a", "video", "video-model", "running")];
  const original = JSON.stringify(jobs);
  assert.deepEqual(filterCreationJobs(jobs, { kind: "all", modelId: "all", status: "all" }).map((item) => item.id),
    ["c", "b", "a"]);
  assert.deepEqual(filterCreationJobs(jobs, { kind: "video", modelId: "old-deleted-model", status: "failed" }).map((item) => item.id),
    ["c"]);
  assert.deepEqual(filterCreationJobs(jobs, { kind: "image", modelId: "video-model", status: "all" }), []);
  assert.equal(JSON.stringify(jobs), original);
});
