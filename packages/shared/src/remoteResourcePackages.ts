// SPDX-License-Identifier: Apache-2.0
// 远程资源包集合与选择归一（B38）。
const PACKAGE_ID_TABLE = {
  serverBundle: "server-bundle",
  nodeRuntime: "node-runtime",
  nodePty: "node-pty",
  knorvia: "knorvia",
  bfs: "bfs",
  ripgrep: "ripgrep",
  ugrep: "ugrep",
} as const;

// 资源包 ID 的取值与顺序逐字冻结。
const KNOWN_PACKAGE_IDS = [
  PACKAGE_ID_TABLE.serverBundle,
  PACKAGE_ID_TABLE.nodeRuntime,
  PACKAGE_ID_TABLE.nodePty,
  PACKAGE_ID_TABLE.knorvia,
  PACKAGE_ID_TABLE.bfs,
  PACKAGE_ID_TABLE.ripgrep,
  PACKAGE_ID_TABLE.ugrep,
] as const; // 字面量元组

export const REMOTE_RESOURCE_PACKAGE_IDS = KNOWN_PACKAGE_IDS; // 全部已知包

export type RemoteResourcePackageId = (typeof KNOWN_PACKAGE_IDS)[number]; // 由元组派生

const ACTIVE_VALUES = [...KNOWN_PACKAGE_IDS] as const; // 当前部署即全集

export const ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS = ACTIVE_VALUES;

const REQUIRED_VALUES = [PACKAGE_ID_TABLE.serverBundle, PACKAGE_ID_TABLE.nodeRuntime] as const; // 必装前两项

export const REQUIRED_REMOTE_RESOURCE_PACKAGE_IDS = REQUIRED_VALUES;

type DependencyTable = Partial<Record<RemoteResourcePackageId, readonly RemoteResourcePackageId[]>>;

export const REMOTE_RESOURCE_PACKAGE_DEPENDENCIES: DependencyTable = {}; // 依赖表为空是旧行为

const REQUIRED_ID_SET = new Set<string>(REQUIRED_VALUES);

export const OPTIONAL_REMOTE_RESOURCE_PACKAGE_IDS = ACTIVE_VALUES.filter(
  (packageId) => !REQUIRED_ID_SET.has(packageId),
); // active 去掉必装项

export type RemoteResourcePackageSelection = {
  selectedPackageIds?: /* 历史选择字段（现被忽略） */ string[];
};

const knownIdSet = new Set<RemoteResourcePackageId>(KNOWN_PACKAGE_IDS);
const activeIdSet = new Set<RemoteResourcePackageId>(ACTIVE_VALUES);
const requiredIdSet = new Set<RemoteResourcePackageId>(REQUIRED_VALUES);

export function normalizeRemoteResourcePackageSelection(
  _ignored?: RemoteResourcePackageSelection | null,
  // 恒返回 active 全集副本：当前分支只保留一个 Knorvia Agent，历史 SSH 资源包选择
  // 已经没有业务意义，无论旧配置存过什么，都统一部署完整 active 资源集。
): RemoteResourcePackageId[] {
  const fullSet: RemoteResourcePackageId[] = [...ACTIVE_VALUES];
  return fullSet;
}

export function isActiveRemoteResourcePackage(packageKey: RemoteResourcePackageId): boolean {
  return activeIdSet.has(packageKey);
}

export function isKnownRemoteResourcePackageId(packageKey: string): boolean {
  return knownIdSet.has(packageKey as RemoteResourcePackageId);
}

export function isRequiredRemoteResourcePackage(packageKey: RemoteResourcePackageId): boolean {
  return requiredIdSet.has(packageKey);
}

export function getRemoteResourcePackageDependencies(
  packageKey: RemoteResourcePackageId,
  // 依赖表恒空：任何包都查不到依赖项（B38 旧行为）。
): readonly RemoteResourcePackageId[] {
  return REMOTE_RESOURCE_PACKAGE_DEPENDENCIES[packageKey] ?? [];
}

export function isRemoteResourcePackageSelectedAsDependency(
  packageKey: RemoteResourcePackageId,
  selection: readonly RemoteResourcePackageId[],
  // 依赖补选判定：遍历已选包的依赖项，命中目标包才算被依赖选中。
): boolean {
  for (const chosenId of selection) {
    for (const dependencyId of getRemoteResourcePackageDependencies(chosenId)) {
      if (dependencyId === packageKey && selection.includes(dependencyId)) {
        return true;
      }
    }
  }
  return false;
}
