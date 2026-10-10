import { useEffect, useState } from "react";
import type { MediaPreviewPreparation } from "@knorvia/services";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

/** 本机图片读取上限；更大的图片显示文件入口而不内联。 */
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 本机媒体文件的可播放地址：图片经 `readMediaPreview` 内联，视频与音频经 `mediaPreviewService`
 * 准备范围地址（大文件不整读）。http(s) 位置直接使用。卸载或换路径时释放 Host 预览。
 * 创作页与外部内核媒体消息共用（specs/knorvia-kernel-native-media-20261010.md）。
 */
export function useMediaPreviewUrl(
  location: string | undefined,
  kind: "image" | "video" | "audio" | "file",
): { url: string; error: string } {
  const services = useBaseWorkspaceServices();
  const files = services.fileService;
  const media = services.mediaPreviewService;
  const [state, setState] = useState<{ key: string; url: string; error: string }>({
    key: "",
    url: "",
    error: "",
  });
  const remote = location && /^https?:\/\//i.test(location) ? location : undefined;
  const path = location && !remote ? location.replace(/^file:\/\//i, "") : undefined;
  const key = `${kind}:${path ?? ""}`;
  useEffect(() => {
    if (!path || kind === "file") return;
    let disposed = false;
    let prepared: MediaPreviewPreparation | null = null;
    const fail = (cause: unknown) => {
      if (!disposed)
        setState({ key, url: "", error: cause instanceof Error ? cause.message : String(cause) });
    };
    if (kind === "image") {
      void files
        .readMediaPreview({ path, maxBytes: IMAGE_MAX_BYTES })
        .then((value) => {
          if (!disposed)
            setState({ key, url: `data:${value.mediaType};base64,${value.dataBase64}`, error: "" });
        })
        .catch(fail);
      return () => {
        disposed = true;
      };
    }
    if (!media) return;
    void media
      .prepare({ path, expectedKind: kind })
      .then((value) => {
        if (disposed) {
          if (value.kind === "host-range-url" && media.release)
            void media.release({ previewId: value.previewId });
          return;
        }
        prepared = value;
        setState({
          key,
          url:
            value.kind === "inline"
              ? `data:${value.mediaType};base64,${value.dataBase64}`
              : (value.url ?? ""),
          error: "",
        });
      })
      .catch(fail);
    return () => {
      disposed = true;
      if (prepared?.kind === "host-range-url" && media.release)
        void media.release({ previewId: prepared.previewId });
    };
  }, [files, key, kind, media, path]);
  if (remote) return { url: remote, error: "" };
  return state.key === key ? { url: state.url, error: state.error } : { url: "", error: "" };
}
