// SPDX-License-Identifier: Apache-2.0
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from "react";
import type {
  IStudioRuntimeService,
  StudioReviewFileVersion,
  StudioWorkspaceImageSide,
} from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { WorkspaceImageController, studioImageNaturalSize } from "./workspaceImageController.js";

function ImageSide({
  image,
  side,
  path,
  fit,
  zh,
}: {
  image: StudioWorkspaceImageSide | null;
  side: "before" | "after";
  path: string;
  fit: boolean;
  zh: boolean;
}) {
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [error, setError] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const label = side === "before" ? (zh ? "修改前" : "Before") : zh ? "修改后" : "After";
  const source =
    image?.kind === "image" ? `data:${image.mediaType};base64,${image.dataBase64}` : undefined;
  const loaded = async (event: SyntheticEvent<HTMLImageElement>) => {
    const element = event.currentTarget;
    try {
      await element.decode();
      if (!alive.current || !element.isConnected || element.src !== source) return;
      const decoded = studioImageNaturalSize(element);
      if (!decoded) throw new Error("Image decoded without positive display dimensions");
      setSize(decoded);
    } catch {
      if (alive.current && element.isConnected && element.src === source) setError(true);
    }
  };
  const unsupported =
    image?.kind === "unsupported"
      ? {
          animated: zh ? "不支持动画图片" : "Animated image is not supported",
          "multiple-images": zh ? "不支持多图片 JPEG" : "Multiple-image JPEG is not supported",
          "invalid-format": zh
            ? "此版本不是有效的静态 PNG/JPEG"
            : "This version is not a valid static PNG/JPEG",
        }[image.reason]
      : undefined;
  return (
    <figure className="min-w-0 space-y-2" data-image-side={side}>
      <figcaption className="text-ui-sm">
        {label} · {path}
      </figcaption>
      <div
        // 原始尺寸溢出时靠起点对齐，避免居中产生无法滚到的负方向裁切。
        className={`flex h-64 min-h-0 overflow-auto rounded-md bg-surface p-2 ${fit ? "items-center justify-center" : "items-start justify-start"}`}
        data-image-container={side}
      >
        {image === null ? (
          <p role="status">{zh ? "此版本不存在" : "This version does not exist"}</p>
        ) : unsupported ? (
          <p role="alert">{unsupported}</p>
        ) : error ? (
          <p role="alert">{zh ? "无法解码此图片版本" : "Unable to decode this image version"}</p>
        ) : source ? (
          <img
            src={source}
            alt={`${label}: ${path}`}
            data-image-display={size ? "ready" : "loading"}
            className={`shrink-0 border border-border object-contain ${fit ? "h-auto max-h-full w-auto max-w-full" : "h-auto w-auto max-w-none"} ${size ? "" : "opacity-0"}`}
            onLoad={(event) => void loaded(event)}
            onError={() => setError(true)}
          />
        ) : null}
      </div>
      {image?.kind === "image" && (
        <p role="status" className="text-ui-xs text-foreground-subtle">
          {error
            ? zh
              ? "解码失败"
              : "Decode failed"
            : size
              ? `${zh ? "解码显示尺寸" : "Decoded display size"}: ${size.width} × ${size.height} px`
              : zh
                ? "正在解码…"
                : "Decoding…"}{" "}
          · {image.totalBytes.toLocaleString()} {zh ? "字节" : "bytes"}
        </p>
      )}
    </figure>
  );
}
export function StudioWorkspaceImageCompare({
  service,
  runId,
  stepId,
  path,
  version,
  zh,
}: {
  service: IStudioRuntimeService;
  runId: string;
  stepId: string;
  path: string;
  version: StudioReviewFileVersion;
  zh: boolean;
}) {
  const [fit, setFit] = useState(true);
  const controller = useMemo(
    () =>
      new WorkspaceImageController(service, {
        runId,
        stepId,
        imagePreview: {
          path,
          version: {
            beforeHash: version.beforeHash,
            afterHash: version.afterHash,
            sourceHash: version.sourceHash,
          },
        },
      }),
    [service, runId, stepId, path, version.beforeHash, version.afterHash, version.sourceHash],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.activate();
    return () => controller.deactivate();
  }, [controller]);
  return (
    <div
      className="mt-3 space-y-3 rounded-md border border-border p-3 text-ui-sm"
      data-image-compare=""
    >
      {state.phase === "error" ? (
        <>
          <p role="alert">{state.error}</p>
          <Button size="sm" variant="outline" onClick={controller.load}>
            {zh ? "重新读取图片" : "Retry image"}
          </Button>
        </>
      ) : state.pair ? (
        <>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={!fit}
            onClick={() => setFit((value) => !value)}
          >
            {fit ? (zh ? "原始显示尺寸" : "Actual display size") : zh ? "适配视窗" : "Fit to view"}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <ImageSide
              key={`before:${version.beforeHash}`}
              side="before"
              image={state.pair.before}
              path={path}
              fit={fit}
              zh={zh}
            />
            <ImageSide
              key={`after:${version.afterHash}`}
              side="after"
              image={state.pair.after}
              path={path}
              fit={fit}
              zh={zh}
            />
          </div>
        </>
      ) : (
        <p role="status">{zh ? "正在读取精确图片版本…" : "Reading exact image versions…"}</p>
      )}
    </div>
  );
}
