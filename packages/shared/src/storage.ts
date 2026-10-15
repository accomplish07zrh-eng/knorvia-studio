// SPDX-License-Identifier: Apache-2.0
// 存储管理（资源管理器「存储」tab）的共享类型与卷分组纯函数（B17）。
// 数据由 main 进程的 StorageService 产生，经 preload `window.resourceManager.storage`
// 送到资源管理器 renderer；services 层的 storage 模块与 UI 都只引用这里的类型。

const STORAGE_ROOT_TABLE = { home: "home", dataBaseDir: "dataBaseDir" } as const;
/** 数据根只有两个：家目录下的 .knorvia 与「数据存储路径」下的 .knorvia。 */
export type StorageRootId = (typeof STORAGE_ROOT_TABLE)[keyof typeof STORAGE_ROOT_TABLE];

// 分类键装载表：取值与顺序逐字冻结（B17 存储分类 11 项）。
const STORAGE_CATEGORY_TABLE = {
  sessionStore: true,
  subagentTranscripts: true,
  toolOutputs: true,
  modelTrajectory: true,
  devTraces: true,
  logs: true,
  backups: true,
  exports: true,
  runtimes: true,
  config: true,
  other: true,
} as const;

export type StorageCategoryId = keyof typeof STORAGE_CATEGORY_TABLE;

export const STORAGE_CATEGORY_IDS: readonly [StorageCategoryId, ...StorageCategoryId[]] =
  Object.keys(STORAGE_CATEGORY_TABLE) as [StorageCategoryId, ...StorageCategoryId[]];

/** 明细超上限后折叠项的占位路径，UI 文案显示「其余 N 项」。 */
export const STORAGE_MORE_ENTRIES_PATH = "…"; // 单字符省略号，UI 依赖该字面值

const CLEANABILITY_TABLE = { none: "none", safe: "safe", confirm: "confirm" } as const;
/** 清理档位语义：none 不提供清理、safe 直接清理、confirm 需二次确认。 */
export type StorageCleanability = (typeof CLEANABILITY_TABLE)[keyof typeof CLEANABILITY_TABLE];

export type StorageRootSpec = {
  id: /* 数据根标识 */ StorageRootId;
  path: /* 根目录绝对路径 */ string;
  hasCustomDataBaseDir: /* 是否启用自定义数据存储路径；启用后 home 根下 v2 归入「其他」 */ boolean;
};

export type StorageVolume = {
  deviceId: /* 同卷稳定 key（stat().dev）；同 key 的根合并进同一张磁盘卡片 */ string;
  mountPoint: /* mac/Linux 是挂载点路径，Windows 是盘符根 */ string;
  totalBytes: /* 卷总容量 */ number;
  freeBytes: /* 卷剩余容量 */ number;
};

export type StorageEntryUsage = {
  relativePath: /* 相对根目录的路径 */ string;
  bytes: /* 该项占用字节数 */ number;
  fileCount: /* 该项文件数 */ number;
};

export type StorageCategoryUsage = {
  id: /* 分类键 */ StorageCategoryId;
  bytes: /* 分类占用字节数 */ number;
  fileCount: /* 分类文件数 */ number;
  cleanability: /* 清理档位 */ StorageCleanability;
  entries: /* 下钻明细：聚合到规则命中路径下一级，bytes 降序、有上限 */ StorageEntryUsage[];
};

export type StorageRootUsage = {
  id: /* 数据根标识 */ StorageRootId;
  path: /* 根目录绝对路径 */ string;
  volume: /* statfs 失败时为 null：只展示占用，不展示磁盘容量 */ StorageVolume | null;
  bytes: /* 根占用字节数 */ number;
  fileCount: /* 根文件数 */ number;
  categories: /* 各分类用量 */ StorageCategoryUsage[];
};

const SCAN_STATUS_TABLE = {
  scanning: "scanning",
  complete: "complete",
  cancelled: "cancelled",
  failed: "failed",
} as const;
export type StorageScanStatus = (typeof SCAN_STATUS_TABLE)[keyof typeof SCAN_STATUS_TABLE];

export type StoragePathError = {
  path: /* 出错路径 */ string;
  code: /* errno 风格错误码 */ string;
};

export type StorageUsageSnapshot = {
  jobId: /* 扫描任务标识 */ string;
  status: /* 扫描状态 */ StorageScanStatus;
  startedAt: /* 开始毫秒时间戳 */ number;
  finishedAt?: /* 结束毫秒时间戳；进行中缺席 */ number;
  roots: /* 各数据根用量 */ StorageRootUsage[];
  errors: /* EACCES / ENOENT 等局部错误，不中断扫描 */ StoragePathError[];
};

export type StorageCleanRequest = {
  rootId: /* 目标数据根 */ StorageRootId;
  categoryId: /* 目标分类 */ StorageCategoryId;
};

export type StorageCleanResult = {
  freedBytes: /* 实际释放字节数 */ number;
  deletedCount: /* 删除文件数 */ number;
  skippedCount: /* 被保护规则跳过的文件数（当天日志、24h 内会话目录等） */ number;
  failures: /* 删除失败明细 */ StoragePathError[];
};

export type StorageVolumeGroup = {
  key: /* volume.deviceId；探测失败的根各自成组，key 为根路径 */ string;
  volume: /* 卷信息；探测失败为 null */ StorageVolume | null;
  roots: /* 同卷的根（输入序） */ StorageRootUsage[];
  bytes: /* 组内合计字节数 */ number;
};

/**
 * 纯函数分组：同 deviceId 的根并进一组、探测失败的根各自成组；
 * 组内根序跟随输入，组间按 bytes 降序。
 */
export function groupStorageRootsByVolume(rootUsages: StorageRootUsage[]): StorageVolumeGroup[] {
  const grouped = new Map<string, StorageVolumeGroup>();
  for (const rootUsage of rootUsages) {
    const groupKey = rootUsage.volume
      ? `dev:${rootUsage.volume.deviceId}`
      : `path:${rootUsage.path}`;
    const existing = grouped.get(groupKey);
    if (existing !== undefined) {
      existing.roots.push(rootUsage);
      existing.bytes += rootUsage.bytes;
      continue; // 同卷已建组，追加进组
    }
    grouped.set(groupKey, {
      key: groupKey,
      volume: rootUsage.volume,
      roots: [rootUsage],
      bytes: rootUsage.bytes,
    });
  }
  return [...grouped.values()].sort((left, right) => right.bytes - left.bytes);
}

/** 主进程存储服务与 renderer 桥共用的命令面。 */
export type StorageManagementApi = {
  /** 开始扫描；已有进行中的 job 会先被取消。 */
  startScan(): Promise<{ jobId: /* 新扫描任务标识 */ string }>;
  /** 取消指定 job；不是当前 job 时无副作用。 */
  cancelScan(jobId: /* 目标 job */ string): Promise<void>;
  /** 返回最近一次快照（含进行中），从未扫描过时是 null。 */
  getSnapshot(): Promise<StorageUsageSnapshot | null>;
  /** 按类别清理；二次确认由调用方负责，扫描中调用会先取消当前扫描。 */
  clean(request: /* 清理请求 */ StorageCleanRequest): Promise<StorageCleanResult>;
};

/** preload 暴露给资源管理器 renderer 的桥：`window.resourceManager.storage`。 */
export type StorageManagementBridge = StorageManagementApi & {
  /** 进度事件：≥300ms 节流一次、payload 是完整快照、终态也走这里；返回取消订阅函数。 */
  subscribeScanProgress(
    listener: /* 快照监听器 */ (snapshot: StorageUsageSnapshot) => void,
  ): () => void;
  /** 在系统文件管理器里定位路径；必须落在某个数据根内（main 侧校验）。 */
  revealPath(absolutePath: /* 被定位的绝对路径 */ string): Promise<void>;
};
