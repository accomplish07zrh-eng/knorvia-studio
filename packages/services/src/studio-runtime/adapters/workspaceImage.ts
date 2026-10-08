// SPDX-License-Identifier: Apache-2.0
import type {
  StudioWorkspaceImageRequest,
  StudioWorkspaceImageSide,
} from "../workspaceImageTypes.js";
import type { StudioWorkspaceChange } from "../types.js";
import {
  STUDIO_IMAGE_PREVIEW_BYTES,
  studioImagePath,
  sameImageVersion,
  validateImageRequest,
  workspaceImageFormat,
} from "../domain/workspaceImage.js";
import { digest, readSafeFile, relativeFile } from "./workspaceFiles.js";
import type { WorkspaceLocation, WorkspaceMetadata } from "./workspaceSnapshot.js";
import { validWorkspacePngRaster } from "./workspacePngRaster.js";

const hash = (bytes: Buffer | null) => (bytes === null ? null : digest(bytes));
async function side(path: string, bytes: Buffer | null): Promise<StudioWorkspaceImageSide | null> {
  if (bytes === null) return null;
  const format = workspaceImageFormat(path, bytes);
  if (
    format.kind === "image" &&
    format.mediaType === "image/png" &&
    !(await validWorkspacePngRaster(bytes))
  )
    return { kind: "unsupported", reason: "invalid-format" };
  return format.kind === "unsupported"
    ? format
    : { ...format, dataBase64: bytes.toString("base64"), totalBytes: bytes.length };
}
/** Caller supplies only a versioned relative path; metadata remains the physical-location owner. */
export async function readWorkspaceImageChange(
  location: WorkspaceLocation,
  metadata: WorkspaceMetadata,
  request: StudioWorkspaceImageRequest,
): Promise<StudioWorkspaceChange> {
  validateImageRequest(request);
  relativeFile(request.path);
  if (!studioImagePath(request.path))
    throw new Error("Unsupported image preview format; only static PNG/JPEG are supported");
  if (metadata.mode !== "isolated")
    throw new Error("Image comparison requires an isolated workspace");
  const before = await readSafeFile(location.baseline, request.path, STUDIO_IMAGE_PREVIEW_BYTES);
  const after = await readSafeFile(location.working, request.path, STUDIO_IMAGE_PREVIEW_BYTES);
  const current = await readSafeFile(metadata.sourcePath, request.path, STUDIO_IMAGE_PREVIEW_BYTES);
  const version = { beforeHash: hash(before), afterHash: hash(after), sourceHash: hash(current) };
  if (version.beforeHash !== (metadata.baseline[request.path]?.hash ?? null))
    throw new Error("Isolation image baseline was modified or is missing");
  if (version.sourceHash !== request.version.sourceHash)
    throw new Error("Image source changed since review; reload the file versions");
  if (!sameImageVersion(version, request.version))
    throw new Error("Reviewed image version changed or is missing; reload the file versions");
  return {
    path: request.path,
    version,
    kind:
      version.beforeHash === null ? "added" : version.afterHash === null ? "deleted" : "modified",
    before: null,
    after: null,
    binary: true,
    conflict: version.sourceHash !== version.beforeHash && version.sourceHash !== version.afterHash,
    imagePreview: {
      version,
      before: await side(request.path, before),
      after: await side(request.path, after),
    },
  };
}
