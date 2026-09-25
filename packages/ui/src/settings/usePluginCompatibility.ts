// 读取单个插件的 `.knorvia-plugin/compatibility.json` 并投影成面板视图模型。
//
// 读取走宿主已有的 fileService（与设置页其它文件读取同一条链路），因此本地与远端
// 工作区都落到各自 host 上；UI 侧不假定插件根目录是本机路径。
// 失败一律降级：读不到 → missing，读失败 → unreadable，内容非法 → malformed；
// 三种情况都投影成 unknown，绝不抛错、绝不阻塞插件管理页。
import { useCallback, useEffect, useRef, useState } from "react";
import type { KnorviaPluginInfo } from "@knorvia/shared";
import type { IFileService } from "@knorvia/services";
import {
  pluginCompatibilitySidecarPath,
  reportHostCapabilitiesForPlugin,
  resolvePluginCompatibilityView,
  type PluginCompatibilitySidecarInput,
  type PluginCompatibilityView,
} from "@/settings/pluginCompatibilityProjection.js";

/** sidecar 是声明式小文件；超过上限说明读到的东西不可信，按读失败处理。 */
const COMPATIBILITY_SIDECAR_MAX_BYTES = 64 * 1024;

type CompatibilityPluginSlice = Pick<
  KnorviaPluginInfo,
  "id" | "name" | "rootPath" | "enabled" | "skillRootCount" | "components"
>;

export type PluginCompatibilityLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; view: PluginCompatibilityView };

export interface UsePluginCompatibilityResult {
  state: PluginCompatibilityLoadState;
  reload: () => void;
}

async function readSidecar(
  fileService: Pick<IFileService, "readTextFile" | "checkFilesExist">,
  path: string,
): Promise<PluginCompatibilitySidecarInput> {
  try {
    const slice = await fileService.readTextFile({
      path,
      offset: 0,
      length: COMPATIBILITY_SIDECAR_MAX_BYTES,
    });
    if (slice.truncated) {
      return {
        kind: "unreadable",
        message: `sidecar exceeds ${COMPATIBILITY_SIDECAR_MAX_BYTES} bytes`,
      };
    }
    // isBinary 说明拿到的是二进制噪声，JSON.parse 必然失败；直接按 malformed 报告更准确。
    if (slice.isBinary) return { kind: "text", text: "" };
    return { kind: "text", text: slice.content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 读取失败不等于文件不存在；先确认存在性再决定降级语义，避免把 host 故障说成「没有声明」。
    try {
      const [existence] = await fileService.checkFilesExist({ paths: [path] });
      if (existence && !existence.exists) return { kind: "missing" };
    } catch {
      /* 存在性检查也失败：保留原始读取错误作为 unreadable 的原因 */
    }
    return { kind: "unreadable", message };
  }
}

export function usePluginCompatibilityView(params: {
  plugin: CompatibilityPluginSlice | null;
  fileService: Pick<IFileService, "readTextFile" | "checkFilesExist"> | null | undefined;
  /** 详情未展开时不读取文件，避免为每一行发一次 RPC。 */
  enabled?: boolean;
}): UsePluginCompatibilityResult {
  const { plugin, fileService, enabled = true } = params;
  const pluginId = plugin?.id ?? "";
  const rootPath = plugin?.rootPath ?? "";
  const pluginEnabled = plugin?.enabled ?? false;
  // 插件对象每次 render 可能是新引用（store 更新后 find 结果变化）；
  // 用 ref 读取最新对象，effect 只依赖稳定键，避免重复读取 sidecar。
  const pluginRef = useRef(plugin);
  pluginRef.current = plugin;
  const [state, setState] = useState<PluginCompatibilityLoadState>({ kind: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  const reload = useCallback(() => setReloadToken((current) => current + 1), []);

  useEffect(() => {
    const current = pluginRef.current;
    if (!current || !fileService || !enabled) {
      setState({ kind: "idle" });
      return;
    }
    const request = ++requestRef.current;
    setState({ kind: "loading" });
    const path = pluginCompatibilitySidecarPath(rootPath);
    void readSidecar(fileService, path).then((sidecar) => {
      if (requestRef.current !== request) return;
      setState({
        kind: "ready",
        view: resolvePluginCompatibilityView({
          pluginId: current.id,
          pluginName: current.name,
          rootPath,
          sidecar,
          hostReport: reportHostCapabilitiesForPlugin(current),
        }),
      });
    });
    return () => {
      // 组件卸载或上下文切换后，迟到的读取结果不得写回。
      if (requestRef.current === request) requestRef.current += 1;
    };
  }, [enabled, fileService, pluginEnabled, pluginId, reloadToken, rootPath]);

  return { state, reload };
}
