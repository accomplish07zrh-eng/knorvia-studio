// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Windows shell 执行器的插件入口，与 bash 支对称：只负责让 Loader 拿到
// 该平台的默认导出类。

import { SnapshotPwshExecutor } from "./shell-environment.js";

export default SnapshotPwshExecutor;
