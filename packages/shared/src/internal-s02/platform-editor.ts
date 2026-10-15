// SPDX-License-Identifier: Apache-2.0
// 媒体预览 URL 与 open-in-editor 目标构造（B39 域件）。
import type { RemoteTarget } from "../remoteTarget.js";
import type {
  DockerConnectOptions,
  SSHConnectOptions,
  WSLConnectOptions,
} from "../remoteTarget.js";

const MEDIA_PREVIEW_PARTS = {
  scheme: "knorvia-media",
  authority: "local",
  pathname: "/preview",
  queryKey: "path",
} as const; // 预览 URL 词表冻结

export const LOCAL_MEDIA_PREVIEW_SCHEME = MEDIA_PREVIEW_PARTS.scheme;

export function buildLocalMediaPreviewUrl(mediaPath: string): string {
  const previewUrl = new URL(`${LOCAL_MEDIA_PREVIEW_SCHEME}://local/preview`);
  previewUrl.searchParams.set("path", mediaPath);
  return previewUrl.toString();
}

/** 已安装的编辑器/终端信息。 */
export type EditorInfo = {
  id: /* 编辑器标识（如 vscode/zed/terminal） */ string;
  name: /* 展示名 */ string;
  iconDataUrl: /* 图标 base64 data URL */ string;
};

export type ApplicationIconInfo = {
  iconDataUrl: /* 图标 base64 data URL */ string;
};

export type ApplicationIconLocator = // 图标定位器三选一
  | { kind: /* macOS bundle 定位 */ "darwin-bundle-id"; value: string }
  | { kind: /* Windows 可执行文件路径定位 */ "windows-executable-path"; value: string }
  | { kind: /* Windows AUMID 定位 */ "windows-aumid"; value: string };

export type ApplicationIconRequest = {
  locators: /* 按序尝试的定位器 */ ApplicationIconLocator[];
};

export type OpenInEditorRemoteTarget = // 三种远程目标各自剥到连接标识子集
  | Pick<SSHConnectOptions, "kind" | "host" | "port" | "username" | "sshConfigAlias"> // ssh 子集
  | Pick<WSLConnectOptions, "kind" | "distro" | "user"> // wsl 子集
  | Pick<DockerConnectOptions, "kind" | "container">; // docker 子集

export type OpenInEditorOptions = {
  remoteTarget?: /* 远程目标（已剥离凭据） */ OpenInEditorRemoteTarget;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  pathKind?: /* 打开对象是文件还是目录 */ "file" | "directory";
};

export type CreateTempTextAttachmentRequest = {
  text: /* 附件正文 */ string;
  filename?: /* 期望文件名 */ string;
};

export type CreateTempTextAttachmentResult = {
  filename: /* 落盘文件名 */ string;
  localPath: /* 宿主临时目录里的绝对路径 */ string;
  mimeType: /* 固定 text/plain */ "text/plain";
  sizeBytes: /* 字节数 */ number;
};

export type SaveFileRequest = // 内存字节与来源 URL 两种形态互斥
  | {
      data: /* 内存字节 */ ArrayBuffer;
      sourceUrl?: /* 互斥位：给了 data 就不能给 */ never;
      suggestedName: /* 建议文件名 */ string;
    }
  | {
      data?: /* 互斥位：给了 sourceUrl 就不能给 */ never;
      sourceUrl: /* 由宿主拉取的来源 URL */ string;
      suggestedName: /* 建议文件名 */ string;
    };

export type SaveFileResult = {
  canceled?: /* 用户取消 */ boolean;
  error?: /* 可读错误文本 */ string;
  path?: /* 落盘路径 */ string;
  success: /* 是否成功 */ boolean;
};

export type PrintPageToPdfResult = {
  success: /* 是否成功 */ boolean;
  /** PDF 字节；success 时存在。 */
  data?: /* PDF 字节 */ ArrayBuffer;
  /** "print_in_progress" | "print_failed" 之一。 */
  error?: /* 失败分类文本 */ string;
};

// openInEditor 只为构造 VS Code Remote-SSH URI 需要的连接标识：
// 凭据字段（password/privateKeyPassphrase 等）不许穿过 renderer/preload/main IPC。
export function createOpenInEditorRemoteTarget(target: RemoteTarget): OpenInEditorRemoteTarget {
  if (target.kind === "ssh") {
    const aliasText = target.sshConfigAlias?.trim();
    const sshTarget: OpenInEditorRemoteTarget = {
      kind: /* 判别标签 */ "ssh",
      host: /* 主机原样带出 */ target.host,
      port: /* 端口原样带出 */ target.port,
      // username 保持原样（不 trim）是旧行为；其余文本字段才 trim。
      username: target.username,
      ...(aliasText ? { sshConfigAlias: aliasText } : {}),
    };
    return sshTarget;
  }
  if (target.kind === "wsl") {
    const userText = target.user?.trim();
    const wslTarget: OpenInEditorRemoteTarget = {
      kind: /* 判别标签 */ "wsl",
      distro: /* 发行版原样 */ target.distro,
      ...(userText ? { user: userText } : {}),
    };
    return wslTarget;
  }
  const dockerTarget: OpenInEditorRemoteTarget = {
    kind: /* 判别标签 */ "docker",
    container: /* 容器名原样 */ target.container,
  };
  return dockerTarget;
}
