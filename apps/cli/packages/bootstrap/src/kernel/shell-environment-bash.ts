// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// POSIX shell 执行器的插件入口。DSH 组合行按模块地址加载插件，导出的是
// 默认类（带 `static Config`/`static inject` 的 Service 子类），因此单独一个文件
// 只为把「这一支是 bash」这件事交给 Loader 判定。

import { SnapshotBashExecutor } from "./shell-environment.js";

export default SnapshotBashExecutor;
