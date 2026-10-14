// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { coerce, gt, valid } from "semver";

export type /* 更新结果三分类 */ PluginUpdateStatus =
  | "none"
  | "update-available"
  | "version-changed";

export function /* 同名版本的更新判定 */ comparePluginVersions(input: {
  installed: /* 已安装版本（可缺省） */ string | undefined;
  latest: /* 最新版本（可缺省） */ string | undefined;
}): /* 更新状态 */ PluginUpdateStatus {
  const { installed, latest } = /* 直接解包入参 */ input;
  if (!installed || !latest) return /* 缺任一侧：无从比较 */ "none";

  const installedVersion = valid(coerce(installed) ?? installed);
  const latestVersion = valid(coerce(latest) ?? latest);
  if (installedVersion && latestVersion) {
    return gt(latestVersion, installedVersion) ? "update-available" : "none";
  }
  return /* 版本串逐字一致才算无变化 */ installed === latest ? "none" : "version-changed";
}

export function /* 按版本号或提交指纹判定更新 */ comparePluginUpdate(input: {
  installedVersion: /* 已安装版本号 */ string | undefined;
  installedSha: /* 已安装提交指纹 */ string | undefined;
  latestVersion: /* 最新版本号 */ string | undefined;
  latestSha: /* 最新提交指纹 */ string | undefined;
}): /* 更新状态 */ PluginUpdateStatus {
  if (input.latestVersion) {
    return comparePluginVersions({
      installed: input.installedVersion,
      latest: input.latestVersion,
    });
  }
  if (!input.latestSha) return "none";
  if (!input.installedSha) return "version-changed";
  return input.installedSha === input.latestSha ? "none" : "update-available";
}
