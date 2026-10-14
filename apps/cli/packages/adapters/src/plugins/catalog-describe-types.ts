// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 插件描述入口形状：由 catalog-describe.ts 引入（仅供实现文件导入，不新增公开面）。
// 字段说明（字段名是契约）：marketplace 所属市场标识；name 插件名；storageRoot 插件数据根目录。

export interface DescribeMarketplacePluginInput {
  marketplace: string;
  name: string;
  storageRoot: string;
}
