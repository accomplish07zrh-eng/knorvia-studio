// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工件读取的对外类型。字段名是契约（调用方按名取值），逐字保留；
// 这里单独放声明，实现文件只负责查询与转换。

/** 分页查询：limit 为必填；afterSequence 表示「从该序号之后继续」。 */
export interface DwfArtifactItemsQuery {
  afterSequence?: number;
  limit: number;
}

/** 单条工件：item 是原始载荷，ordinal/sequence/siteId 供排序与去重。 */
export interface DwfArtifactItem {
  item: unknown;
  ordinal: number;
  sequence: number;
  siteId: string;
}
