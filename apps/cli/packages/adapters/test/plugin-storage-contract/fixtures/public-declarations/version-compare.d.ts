// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

export type PluginUpdateStatus = "none" | "update-available" | "version-changed";
/**
 * Compare an installed plugin version against the latest manifest version.
 * - semver.gt(latest, installed) -> "update-available"
 * - parseable + not greater (equal or older) -> "none"
 * - unparseable but differing -> "version-changed" (we can't prove it's newer)
 * - unparseable + equal, or either missing -> "none"
 */
export declare function comparePluginVersions(input: {
  installed: string | undefined;
  latest: string | undefined;
}): PluginUpdateStatus;
/**
 * 按最新目录条目实际提供的比较轴判断更新状态：优先比较可解析的 version，缺失时比较
 * source identity pin；两者都缺失时保持 none，避免把无法证明的新旧关系误报为更新。
 */
export declare function comparePluginUpdate(input: {
  installedVersion: string | undefined;
  installedSha: string | undefined;
  latestVersion: string | undefined;
  latestSha: string | undefined;
}): PluginUpdateStatus;
//# sourceMappingURL=version-compare.d.ts.map
