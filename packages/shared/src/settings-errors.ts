// SPDX-License-Identifier: Apache-2.0
// 数据目录被放进 Windows 安装目录时的错误判别（B14）。
import { normalizeUnknownError, type NormalizedUnknownError } from "./errors.js";

/** 与旧实现字面一致的错误码标记（known-differences §4 逐字清单）。 */
const FORBIDDEN_INSTALL_DIR_CODE = "DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR";

export const DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE = FORBIDDEN_INSTALL_DIR_CODE;

/** 命中判据表：错误码文本相等，或消息文本里出现同一标记。 */
const MARKER_MATCHERS: ReadonlyArray<(normalized: NormalizedUnknownError) => boolean> = [
  (normalized) => normalized.code === FORBIDDEN_INSTALL_DIR_CODE,
  (normalized) => normalized.message.includes(FORBIDDEN_INSTALL_DIR_CODE),
];

export function isDataBaseDirForbiddenWindowsInstallDirError(thrown: unknown): boolean {
  const normalized = normalizeUnknownError(thrown);
  return MARKER_MATCHERS.some((matchesMarker) => matchesMarker(normalized));
}
