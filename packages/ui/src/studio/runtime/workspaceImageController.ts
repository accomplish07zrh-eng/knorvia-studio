// SPDX-License-Identifier: Apache-2.0
import {
  sameImageVersion,
  STUDIO_IMAGE_PREVIEW_BYTES,
  type IStudioRuntimeService,
  type StudioWorkspaceChangesRequest,
  type StudioWorkspaceImagePair,
  type StudioWorkspaceImageRequest,
} from "@knorvia/services";
import { UiAsyncActionGate } from "../agents/uiAsyncActionGate.js";

interface Snapshot {
  phase: "idle" | "loading" | "ready" | "error";
  pair?: StudioWorkspaceImagePair;
  error?: string;
}
export class WorkspaceImageController {
  private gate = new UiAsyncActionGate();
  private value: Snapshot = { phase: "idle" };
  private listeners = new Set<() => void>();
  constructor(
    private service: IStudioRuntimeService,
    private request: StudioWorkspaceChangesRequest & { imagePreview: StudioWorkspaceImageRequest },
  ) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(value: Snapshot) {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
  activate() {
    this.gate.activate();
    this.load();
  }
  deactivate() {
    this.gate.deactivate();
    this.value = { phase: "idle" };
  }
  load = () =>
    this.gate.run(
      async () => {
        const changes = await this.service.workspaceChanges(this.request);
        const pair = changes.find(
          (change) => change.path === this.request.imagePreview.path,
        )?.imagePreview;
        if (!pair?.version)
          throw new Error(
            "This Host does not provide versioned image previews / 此 Host 未提供精确图片预览",
          );
        if (!sameImageVersion(pair.version, this.request.imagePreview.version))
          throw new Error("Image version changed / 图片版本已变化，请重新读取文件版本");
        for (const side of ["before", "after"] as const) {
          const image = pair[side];
          const hash =
            this.request.imagePreview.version[side === "before" ? "beforeHash" : "afterHash"];
          if ((image === null) !== (hash === null))
            throw new Error("Host returned an unproven absent image side");
          if (
            image?.kind === "unsupported" &&
            ["animated", "invalid-format", "multiple-images", "display-budget"].includes(
              image.reason,
            )
          )
            continue;
          if (
            image !== null &&
            (!image ||
              image.kind !== "image" ||
              !["image/png", "image/jpeg"].includes(image.mediaType) ||
              !Number.isSafeInteger(image.totalBytes) ||
              image.totalBytes <= 0 ||
              image.totalBytes > STUDIO_IMAGE_PREVIEW_BYTES ||
              typeof image.dataBase64 !== "string" ||
              image.dataBase64.length !== 4 * Math.ceil(image.totalBytes / 3))
          )
            throw new Error("Host returned invalid or oversized image bytes");
        }
        return pair;
      },
      {
        onStart: () => this.set({ phase: "loading" }),
        onSuccess: (pair) => this.set({ phase: "ready", pair }),
        onError: (error) =>
          this.set({
            phase: "error",
            error: error instanceof Error ? error.message : String(error),
          }),
        onSettled: () => {},
      },
    );
}
export function studioImageNaturalSize(
  image: Pick<HTMLImageElement, "naturalWidth" | "naturalHeight">,
) {
  const { naturalWidth: width, naturalHeight: height } = image;
  // complete 在 broken image 上也会为 true；只有 load/decode 后的正显示尺寸才算可用。
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
}
