# core-tool-handlers-workflow-01 合同验收（acceptance.md）

版本 v1。记录本包合同阶段的范围、旧门结果、预登记差异与覆盖情况。替换阶段的两道相似度实测（行/结构）在 `replace/core-tool-handlers-workflow-01` 阶段补入。

## 范围

- 22 个继承文件 / 3,294 行（`licensing/current-files.json` 实测：upstream-modified 19、upstream-unchanged 2、unreviewed 1）。
- 边界与「不在范围」见 `README.md`；无用代码 0（`dep:refs` 同源分析确认全部有引用）。
- 接口面 22 模块 / 57 导出（`interface.md`）；调用方覆盖 `dep:refs` 全部结果（`callers.md`：47 处包外引用点）。

## 旧门（`scripts/contract-gate.mjs`，2026-10-15，基线 origin/main `829fe57e`）

| 入口                                                             | 用例 | 通过 | 失败 | 结果                       |
| ---------------------------------------------------------------- | ---- | ---- | ---- | -------------------------- |
| 源码（tsx 加载 `src/tool/handlers/**`）                          | 94   | 94   | 0    | pass                       |
| dist（`dist-entry-loader.mjs` 重定向到 `dist/tool/handlers/**`） | 94   | 94   | 0    | pass                       |
| 桩替换（22 桩覆盖后重跑源码）                                    | 8    | 0    | 8    | `allFail=true`（应全失败） |

Node 24.14.0；`KNORVIA_ENV=test`；`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`。报告 `gate-old.json`。桩替换后 8 个测试文件全部在加载被替换模块时失败（0/94 通过），证明用例确实钉在被替换的模块面上。

## 预登记差异

`known-differences.md` K-fl-1..2、K-au-1、K-an-1 四条（元数据块未知字段整块判错、`answers:{}` 过门、交接自环照画、块判定按首个非空行），均为旧实现既存事实，合同保留；各有对应用例（B-fl-4/5、B-au-1/4、B-an-5）。**无其它预登记差异**（源码/dist 两入口 0 失败）。

## 覆盖

- **工作流文件读写与金样往返**（B-fl-1..8、B-df-1..6、B-sw-7）：`fixtures/workflow-file-goldens.json` 由旧实现真实写入面录制（2 份保存定义金样 + 5 个铸名 + `.gitignore` + 碰撞顺延）；往返断言「旧写 → 新读 → 新写 → 旧读」逐字节闭合；草稿铸名、撞名顺延、尽力而为降级全覆盖。
- **修订语义边界**（B-aw-1..17、K-fl-1、K-au-1）：三态字段（设定/解除/沿用）、前驱握手读序、`script_unchanged` 预检、认家规则、端口拒绝三分、成功文案两态，全部事件序列断言。
- **语义常量/默认值/文案**（M1 教训）：错误码表、超时/预算常量、`multiSelect` 默认值、全部定型文案逐条入断言（B-aw-2、B-tp-1..5、B-cw-11/12/16、B-aw-3/9/13/15/16、B-sw-6/7、B-ev-3/4、B-nt-1..3、B-in-1/2、B-au-2/3）。
- **AskUserQuestion 交互时序**（B-au-1..4）：门握手「拒绝 → 拒绝 → 执行」事件序列断言，无 sleep、无固定超时；投影字段序与缺省补/省语义钉住。
- **未覆盖（IO 重，见 `behavior.md`「未覆盖」节）**：沙箱真执行（`evalSnippet` 真跑、engine submit 之后的 run 生命周期）、存储层原子性、`ask-user-question-narration.ts`（original 不替换）。这些模块的路径与导出仍在 `interface.md`，接口默认不可变；替换阶段以端口替身 + 包内单元测试补齐。

## 平台

路径断言全部经 `path.join`/`path.relative` 在宿主上复原（Windows 反斜杠与 POSIX 斜杠均成立）；金样、铸名、文案与平台无关；全局档用例经产品环境变量 `KNORVIA_DATA_BASE_DIR` 重定向到临时目录，未触碰真实用户数据目录。源码与 dist 双入口在 Windows 实测 94/94；Linux 由远端 CI 复核。
