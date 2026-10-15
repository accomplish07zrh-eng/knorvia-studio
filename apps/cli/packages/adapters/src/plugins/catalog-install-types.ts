// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 安装卸载入口形状：由 catalog-install.ts 引入（仅供实现文件导入，不新增公开面）。
// 字段说明（字段名是契约）：marketplace 所属市场标识；name 插件名；signal 中止信号；
// storageRoot 插件数据根目录；scope 安装范围（user 用户级 / workspace 工作区级）；
// allowCrossMarketplaces 允许跨市场安装的来源集合；pluginId 待卸载插件标识；
// removeCache 是否同时删除缓存目录；keepData 是否保留数据目录。

export interface InstallMarketplacePluginInput {
  marketplace: string;
  name: string;
  signal?: AbortSignal;
  storageRoot: string;
  scope?: "user" | "workspace";
  allowCrossMarketplaces?: ReadonlySet<string>;
}

export interface UninstallMarketplacePluginInput {
  pluginId: string;
  storageRoot: string;
  removeCache?: boolean;
  keepData?: boolean;
}
