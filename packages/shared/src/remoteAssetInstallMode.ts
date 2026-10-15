// SPDX-License-Identifier: Apache-2.0
// 远程资源安装模式（B37）。
const INSTALL_MODE_TABLE = {
  localDownloadUpload: "local-download-upload",
  remoteDownload: "remote-download",
} as const;

export const REMOTE_ASSET_INSTALL_MODES = [
  INSTALL_MODE_TABLE.localDownloadUpload,
  INSTALL_MODE_TABLE.remoteDownload,
] as const;

export type RemoteAssetInstallMode = (typeof REMOTE_ASSET_INSTALL_MODES)[number];

export const DEFAULT_REMOTE_ASSET_INSTALL_MODE: RemoteAssetInstallMode =
  INSTALL_MODE_TABLE.localDownloadUpload;

export function normalizeRemoteAssetInstallMode(
  requested?: RemoteAssetInstallMode | null,
): RemoteAssetInstallMode {
  const remotePick = requested === INSTALL_MODE_TABLE.remoteDownload;
  return remotePick ? INSTALL_MODE_TABLE.remoteDownload : DEFAULT_REMOTE_ASSET_INSTALL_MODE;
}
