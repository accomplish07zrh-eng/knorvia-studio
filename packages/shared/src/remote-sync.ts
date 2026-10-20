// SPDX-License-Identifier: Apache-2.0

/**
 * 远端同步写权限探测的结果。
 *
 * 只有纯类型：探测本身在调用方（services），这里只固定返回形状，
 * 让「是否可写 × 目标路径 × 原因」三件事在跨进程边界上保持一致。
 * 字段先在一处登记成字段袋，接口再从字段袋投影，避免同名形状被抄成第二份。
 */
type RemoteSyncWriteAccessFields = {
  ok: boolean;
  path: string;
  error?: string;
};

export interface RemoteSyncWriteAccessResult extends RemoteSyncWriteAccessFields {}
