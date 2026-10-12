# Knorvia 替换前基线（M0-12）

日期：2026-10-11　主仓提交：`6ea4cbe7`　认领 issue：#99

依据《Knorvia 独立替换任务计划书》M0-12：「记录替换前基线：继承文件数、`pnpm perf:baseline`、Electron 侧栏与布局冒烟、工作台冒烟」，完成标准「写明主仓提交号，数字可复现」。**本文所有数字都在 `6ea4cbe7` 上实测，命令逐条给出。**

## 1. 继承文件数

命令：`node scripts/provenance/cli.mjs`（`pnpm provenance:report`）读取 `licensing/current-files.json`。

| 分类                      | 文件数    |
| ------------------------- | --------- |
| `unreviewed`              | 5729      |
| `original`                | 4206      |
| `upstream-modified`       | 2414      |
| `third-party`             | 2408      |
| `upstream-unchanged`      | 1369      |
| `independent-replacement` | 439       |
| `reviewed-retained`       | 8         |
| `generated-report`        | 1         |
| **合计**                  | **16574** |

- **继承口径**（`upstream-unchanged` + `upstream-modified` + `unreviewed`）：**9512** 个文件。
- 性质复核（`reviewedNatures`）：标准许可正文 2、功能配置 9。
- 复核问题 `reviewProblems`：0；缺失复核 `missingReviews`：0。
- 上游基线：`872ad960de7ec172591f7e1952f7849229f94521`（`https://github.com/zai-org/ZCode`）；清单范围：Existing tracked and non-ignored untracked files; deleted files absent; symlinks not followed; no source contents. Not an authorship certification or a runtime dependency closure.

## 2. 性能基线

命令：`pnpm perf:baseline`（Node v24.14.0，平台 win32；本机无 mise，用固定 Node 24.14.0 + 仓库 pnpm 10.33.2）。原始 JSON 见 `docs/knorvia-replacement-baseline-2026-10-11-perf.json`。

滚动基准（`packages/web` 的 `perf-studio-timeline.html`，1440×900）：

| 指标                            | 实测值        |
| ------------------------------- | ------------- |
| `syntheticMessages`             | 10000         |
| `frames`                        | 180           |
| `headlessRafCallbacksPerSecond` | 69.6          |
| `frameIntervalP50Ms`            | 13.3          |
| `frameIntervalP95Ms`            | 26.7          |
| `slowFramesOver33Ms`            | 2             |
| `maxMountedRows`                | 20            |
| `offscreenAppendShiftPx`        | 0             |
| `prependAnchorShiftPx`          | 0             |
| `viewport`                      | 1440x900      |
| `browserVersion`                | 154.0.8037.98 |

## 3. Electron 侧栏与布局冒烟

命令：`node scripts/studio-activity-rail-smoke.mjs`（Electron 41 + `packages/desktop/out/main`，源码 renderer 隔离构建；夹具内置，不登录、不调用外部 CLI、不发送消息）。

结果：**通过**（PASS 28 / FAIL 0）。结尾输出：

```text
PASS workflow canvas inherits the sheet while the details panel retains a readable material
PASS local image, glass off, background-only and reduced-transparency modes preserve the appropriate reading surface
PASS short-window full-sheet tools and settings access without horizontal overflow
Artifacts: C:\Users\17018\AppData\Local\Temp\knorvia-activity-rail-nPW8Mh
```

## 4. 工作台冒烟

命令：`node --import tsx scripts/task-workbench-smoke.mjs <chromium>`（真实 GUI、命令 admission 与 SQLite，离线内核）。

结果：**未通过（exit 1）**。结尾输出：

```text
  name: 'TimeoutError'
}

Node.js v24.14.0
```

根因与证据见第 5 节。

## 5. 未执行与受限项

- **工作台冒烟在本机无法通过（与本次改动无关）**：`node --import tsx scripts/task-workbench-smoke.mjs <chromium>` 在 `page.goto` 的 25s 预算内超时。根因已用探针脚本在**干净 main**（本工作树就是 `6ea4cbe7`，未改任何文件）上定位：该脚本的 Vite 服务端跑依赖预扫描时失败（`Failed to run dependency scan. Skipping dependency pre-bundling`，`Build failed with 103 errors`，条目包含全仓大量无关 HTML：`product-site/index.html`、`packages/formal-proof/index.html`、`apps/cli/packages/debug/index.html`、`docs/evidence/**/preview.html`、`packages/desktop/out/renderer/*.html` 等），于是跳过预打包，首次请求要现场转换整张模块图；探针实测 `/packages/ui/test/fixtures/task-workbench-browser.tsx` 在 30s 内不返回、放宽到 180s 才 200。该脚本不在 CI 与 `package.json` 的任何入口里，是人工验收脚本，`page.goto` 写死 25s。
- 工作台冒烟的后续：M0-5 会删掉 `apps/cli/packages/debug/` 与 `packages/formal-proof/`（两个被扫到的入口），合并后重跑该冒烟；仍失败则在 Linux 或依赖预扫描能成功的机器上补一次，并把结果追加到本文。
- 本机是 Windows；按计划书「平台差异」条，macOS 未实机验证。
- 本机环境修复（不进仓库）：Electron 二进制由 `%LOCALAPPDATA%\electron\Cache` 的缓存包解到 `node_modules/electron/dist` 并写 `path.txt`；跑 Electron 前移除环境变量 `ELECTRON_RUN_AS_NODE`。
- 桌面打包实测（安装版 + 便携版实机启动）不在 M0-12 范围，按计划书 M0 退出条件单独执行，结果另记。

## 6. 声明

- 本文只记录数字与命令，不改代码、不改资产、不改来源清单。
- 继承文件数在 `6ea4cbe7` 上由来源工具生成，可复现；性能与冒烟结论绑定该提交。
- M6 的「性能不劣于替换前基线 10% 以上」以本文件的滚动基准为准，对比时用同一命令与同一台机器。
