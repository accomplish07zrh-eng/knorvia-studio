# UI 截图基线工具（`scripts/ui-baseline/`）

M0-11 的产出：替换 UI 实现前先建立「替换前基线」，之后每个 UI 包用自己的页面与基线对比。
判定口径来自《Knorvia 独立替换任务计划书》「工具要求 / UI 截图基线工具」与验收清单：

- 每页截 **明暗两套主题 × 1360 / 820 / 390 三种宽度**；
- **像素差异**与**关键元素几何**都要看：只看像素会被字体抗锯齿误报，只看几何会漏掉颜色；
- 关键元素按 `data-testid` 取包围盒，**偏差不超过 2 像素**；
- 基线放在主仓孤立分支 `ui-baseline`，不进 main，每张图记录生成时的提交；
- 同一提交连续截两次必须**零差异**；不稳定先修夹具，不加容差。

## 组成

| 文件             | 作用                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `pages.json`     | 页面清单：每项写路由或打开步骤、夹具、要比较几何的 `data-testid` |
| `capture.mjs`    | 启动 Web 开发服务器与固定夹具，逐页 × 主题 × 宽度出图            |
| `compare.mjs`    | 与基线比较像素与几何，输出报告与差异图                           |
| `publish.mjs`    | 把产物提交到孤立分支 `ui-baseline`（不碰当前工作树、不碰 main）  |
| `lib/`           | Chromium 定位、夹具、环境、浏览器固定、几何、PNG、像素比较、产物 |
| `test/`          | `node:test` 用例（纯逻辑用例 + 需要浏览器的确定性用例）          |
| `test/fixtures/` | 供解码测试使用的真实 Chromium PNG 与合成 RGBA PNG                |

## 环境

- **浏览器**：只使用本机已安装的 Chromium，不下载浏览器。
  顺序：`KNORVIA_UI_BASELINE_CHROME` → `ms-playwright` 缓存里版本号最高的 `chromium-<n>`
  （Windows `%LOCALAPPDATA%\ms-playwright`、Linux `~/.cache/ms-playwright`、macOS `~/Library/Caches/ms-playwright`）。
  找不到时直接报错并列出已尝试路径。
- **后端**：真实的 `@knorvia/server` HTTP 入口（`packages/server/dist/entry-http.js`）+ `packages/web` 的 Vite 开发服务器，
  代理指向本次分配的空闲端口。每次采集前都会重新构建 `@knorvia/server`：dist 是构建产物，
  残留一份旧构建会让截图连到与当前分支不一致的服务端（例如缺少构建期嵌入的 built-in provider config），
  这种失败很难看懂；`--no-build-server` 可显式跳过。
- **不占用固定端口**：服务端端口与 Vite 端口都动态分配，和本机已开的开发服务器互不影响。

## 固定夹具

| 项目          | 取值                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| 数据目录      | `KNORVIA_HOME=<夹具根>/home`（默认 `<系统临时目录>/knorvia-ui-baseline`）  |
| 初始工作区    | `<夹具根>/workspace`，同时作为服务进程 cwd，避免把仓库目录注册成额外工作区 |
| 设置种子      | 引导已完成、语言 `zh-CN`、无模型供应商、无任务（`lib/fixture.mjs`）        |
| 时间          | 固定 `2026-11-01T00:00:00.000Z`，时区固定 `UTC`                            |
| 语言          | 浏览器 `Accept-Language`/locale 固定 `zh-CN`，产品语言由种子设置决定       |
| 动效          | `prefers-reduced-motion: reduce` + 注入 `animation/transition` 时长 0      |
| 光标与滚动条  | 隐藏文本光标与滚动条，避免闪烁与边缘像素抖动                               |
| 逐次重置      | 每次采集前删除并重建 `home` 与 `workspace`，两次运行看到同一份状态         |
| 外部 CLI 内核 | 服务端进程的 `PATH` 与 home 都指向夹具，固定为「没有安装任何外部内核」     |

夹具只用产品自己的存储格式（`.knorvia-studio` 目录、`setting.json` 字段），不新增私有字段、不改数据目录。

外部内核探测为什么必须掐掉：`inspectKernels` 会按 `PATH` 与 `~/.local/bin`、`~/.grok/bin`、`~/.cargo/bin`、
`~/.qoder/bin`、`~/.dsh/...` 等固定目录找 CLI，并为每个候选起子进程做版本/协议探测（带超时）。
同一提交两次运行里「探到」与「超时」会让活动栏内核图标、工作台内核下拉、设置页 Agent 列表都不同
（实测出现过 1160px 的高度差与 678 像素的图标差异）。把 `PATH` 与 home 指向夹具后，同样的对比
逐像素为零差异，基线也不再依赖这台机器装了哪些 CLI。

已知限制：插件/MCP/技能页在夹具里没有配置 Agent 服务端，界面会走「尚未安装」空状态并打印一条
`KNORVIA_AGENT_SERVER_COMMAND` 未配置的控制台错误；这是夹具的固定状态，不影响确定性。
每张图的 sidecar 记录 `kernelOptions` 与平台信息，`compare.mjs` 在渲染环境不一致时默认拒绝比较。

## 用法

```bash
# 采基线（默认写入 .tmp/ui-baseline/capture，git 忽略）
node scripts/ui-baseline/capture.mjs

# 只采某几页 / 某主题 / 某宽度
node scripts/ui-baseline/capture.mjs --pages chat-single,workbench --themes dark --widths 390

# 与基线比较（退出码非零表示有超标项）
node scripts/ui-baseline/compare.mjs --baseline <基线目录> --current <新截图目录>

# 只验证同一提交的确定性（要求像素完全一致）
node scripts/ui-baseline/compare.mjs --baseline <目录 A> --current <目录 B> --strict

# 发布到孤立分支 ui-baseline（默认推送；--no-push 演练）
node scripts/ui-baseline/publish.mjs --from .tmp/ui-baseline/capture

# 测试
pnpm ui-baseline:test        # 全部用例（含需要 Chromium 的确定性用例）
node --test scripts/ui-baseline/test/pages.test.mjs   # 纯逻辑用例，可单独跑
```

## 判定规则

`compare.mjs` 对每张图做两件事，任何一项超标即退出码 1：

1. **几何**：页面清单里每个 `data-testid` 的包围盒（x/y/宽/高）与基线偏差必须 ≤ `--box-tolerance-px`（默认 **2**）。
   多命中数量变化、消失、出现、可见性变化都算失败。
2. **像素**：
   - `changedPixels` / `diffRatio`：与基线不完全相同的像素；
   - `structuralPixels` / `structuralRatio`：单通道差值超过 `--structural-channel-delta`（默认 8）的像素，
     即不是抗锯齿噪声的真实变化；
   - 默认判定用 `structuralRatio ≤ --max-structural-diff-ratio`（默认 0.02）；
   - `--strict` 要求 `changedPixels === 0`，用于「同一提交两次截图」这类确定性验证。

差异图（未变=白、仅抗锯齿级=橙、结构性=红）与报告 JSON 写在 `<current>/diff`、`<current>/compare.json`。
基线与本机的平台、Chromium 版本或固定时钟不一致时默认直接报错，不给出会产生误报的结论。

## 页面清单格式

```jsonc
{
  "schema": 1,
  "themes": ["light", "dark"],
  "viewports": [{ "width": 1360, "height": 900 }],
  "pages": [
    {
      "id": "settings-general", // 小写字母/数字/连字符，用作目录名
      "group": "settings", // 分组，便于筛选用例与报告
      "title": "设置 · 常规",
      "description": "……",
      "route": "/", // 可选，默认 "/"
      "fixture": "default", // 可选，默认 default
      "openWidth": "target", // 可选：target（默认）或 wide，见下
      "open": [
        // 打开步骤，每步恰好一种动作
        { "click": "task-settings-button" },
        { "waitFor": "settings-page" },
        {
          "waitForAttribute": {
            "testId": "settings-page",
            "attribute": "data-active-section",
            "value": "general",
          },
        },
      ],
      "testIds": ["settings-page", "settings-nav-locale"],
    },
  ],
}
```

支持的动作：`click`（testid）、`clickRole`（`role`/`name`/`exact`）、`waitFor`（testid 可见）、
`waitForAttribute`（testid 的某个属性等于给定值）、`press`（键盘按键）。

`openWidth: "wide"` 用于「窄 Web 没有入口」的页面：窄 Web（<768px）按 `useActivityRailLayout` 不渲染活动栏，
工作台 / 群聊 / 工作流 / 创作 / 插件页在 390 宽下没有可达入口。这类页面先在 1360×900 执行打开步骤，
再切回目标宽度截图，截到的仍是同一路由在目标宽度下的渲染；夹具为此显式声明，不靠隐式兜底。

新增 UI 包时把自己的页面按同样格式补进 `pages.json`，然后在旧实现上先截基线；
`normalizePages()` 会拒绝未知字段、未知动作与重复 id，避免清单写错却静默少截。

## 与计划书默认裁决表的关系

- 「视觉与布局：以当前截图为准，包括 Knorvia 的黑白视觉语言」→ 基线图就是这一条的物证，`compare.mjs` 只报告差异，不改渲染。
- 「某项检查在 main 上本来就失败：不算本包的问题，在 PR 中写明」→ 本工具的控制台错误记录进 sidecar 的 `signals.consoleErrors`，不掩盖。
- 「界面文案：意思不变，用自己的话重写」→ 文案变化会体现为像素差异；`signals.bodyTextSha256` 单独记录，便于区分「文案变了」与「布局变了」。
