// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件更新判定。先比版本号：两侧都能归一成 semver 时按「谁更大」定论，否则退回字符串相等；
// 版本号缺失时才看提交指纹。状态字面量是对外契约，集中在一张取值表里。

import { coerce, gt, valid } from "semver";

export type /* 更新结果三分类 */ PluginUpdateStatus =
  | "none"
  | "update-available"
  | "version-changed";

/** 一对版本号：安装侧与最新侧，任一侧缺失都表示无从比较。 */
type VersionPair = {
  installed: string | undefined;
  latest: string | undefined;
};

/** 一次更新探针：版本号优先，版本号缺失时用提交指纹兜底。 */
type UpdateProbe = {
  installedVersion: string | undefined;
  installedSha: string | undefined;
  latestVersion: string | undefined;
  latestSha: string | undefined;
};

const STATUS = {
  none: "none",
  updateAvailable: "update-available",
  versionChanged: "version-changed",
} as const satisfies Record<string, PluginUpdateStatus>;

/** semver 归一：解析不出来就返回 null，由调用方决定回退方式。 */
function semverOf(raw: string | undefined): string | null {
  if (!raw) return null;
  return valid(coerce(raw) ?? raw);
}

/** 版本对判定：能归一的两侧走大小比较，不能归一的退化为原串相等。 */
function judgePair(pair: VersionPair): PluginUpdateStatus {
  const before = semverOf(pair.installed);
  const after = semverOf(pair.latest);
  if (before === null || after === null) {
    return pair.installed === pair.latest ? STATUS.none : STATUS.versionChanged;
  }
  return gt(after, before) ? STATUS.updateAvailable : STATUS.none;
}

export function /* 同名版本的更新判定 */ comparePluginVersions(
  pair: VersionPair,
): PluginUpdateStatus {
  if (!pair.installed || !pair.latest) return STATUS.none;
  return judgePair(pair);
}

export function /* 按版本号或提交指纹判定更新 */ comparePluginUpdate(
  probe: UpdateProbe,
): PluginUpdateStatus {
  if (probe.latestVersion) {
    return comparePluginVersions({
      installed: probe.installedVersion,
      latest: probe.latestVersion,
    });
  }
  if (!probe.latestSha) return STATUS.none;
  if (!probe.installedSha) return STATUS.versionChanged;
  return probe.installedSha === probe.latestSha ? STATUS.none : STATUS.updateAvailable;
}
