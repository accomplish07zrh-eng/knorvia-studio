// SPDX-License-Identifier: Apache-2.0
import type { StudioReviewFileVersion } from "./workspaceReviewTypes.js";

export interface StudioWorkspaceImageRequest {
  path: string;
  version: StudioReviewFileVersion;
}
export interface StudioWorkspaceChangesRequest {
  runId: string;
  stepId: string;
  imagePreview?: StudioWorkspaceImageRequest;
}
export interface StudioWorkspaceApplyRequest {
  runId: string;
  stepId: string;
  paths: string[];
  reviewedVersions?: StudioWorkspaceImageRequest[];
}
/** Verified raw bytes; browser load/decode still owns displayability and natural size. */
export type StudioWorkspaceImageSide =
  | { kind: "image"; mediaType: "image/png" | "image/jpeg"; dataBase64: string; totalBytes: number }
  | { kind: "unsupported"; reason: "animated" | "invalid-format" | "multiple-images" };
export interface StudioWorkspaceImagePair {
  version: StudioReviewFileVersion;
  before: StudioWorkspaceImageSide | null;
  after: StudioWorkspaceImageSide | null;
}
