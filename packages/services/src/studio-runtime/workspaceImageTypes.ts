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
  /**
   * 工作台格子预览（specs/knorvia-workbench-artifact-preview-20261008.md）：只读列出隔离副本中
   * 改动的网页，返回项带 `previewPath`，不含内容；不加项目锁、不执行应用恢复，不要求同项目其他任务结束。
   */
  artifactsOnly?: boolean;
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
  | {
      kind: "unsupported";
      reason: "animated" | "invalid-format" | "multiple-images" | "display-budget";
    };
export interface StudioWorkspaceImagePair {
  version: StudioReviewFileVersion;
  before: StudioWorkspaceImageSide | null;
  after: StudioWorkspaceImageSide | null;
}
