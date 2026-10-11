# UI 截图基线工具（M0-11）

按《Knorvia 独立替换任务计划书》M0-11：替换 UI 之前先建立“替换前基线”，之后每个 UI 包在旧实现上截基线、在新实现上对比。工具只做抓取与比较，不碰产品代码。

## 用法

```bash
# 1. 起 Web 开发服务器（另开一个终端；端口以 vite 实际输出为准）
pnpm dev:web

# 2. 抓基线：明暗两套主题 × 1360/820/390 三种宽度
node scripts/ui-baseline/capture.mjs --out D:/ui-baseline-captures --base-url http://127.0.0.1:5173

# 3. 抓完立刻验证确定性：同一提交连续抓两次必须零差异
node scripts/ui-baseline/capture.mjs --out D:/ui-baseline-captures \
  --base-url http://127.0.0.1:5173 --verify

# 4. 替换后对比（像素差异 + data-testid 包围盒几何）
node scripts/ui-baseline/compare.mjs \
  --baseline D:/ui-baseline-captures \
  --current D:/ui-baseline-captures-after \
  --out D:/ui-baseline-report
```

- `capture.mjs` 退出码非 0 表示清单里有 `data-testid` 没找到（不静默跳过）。
- `compare.mjs` 退出码非 0 表示有页面超出两道门槛，`report.json` 里逐页给出包含率、包围盒偏差与差异图路径。
- 也可以用 `--serve "pnpm dev:web"` 让工具自己拉起服务器（需要同时给 `--base-url` 做就绪探测）。

## 门槛

| 检查                     | 门槛                            | 常量                 |
| ------------------------ | ------------------------------- | -------------------- |
| 差异像素占比             | ≤ 0.2%（确定性检查用 0）        | `PIXEL_RATIO_LIMIT`  |
| 单通道噪声容差           | 12/255 以内不计入差异（抗锯齿） | `CHANNEL_TOLERANCE`  |
| `data-testid` 包围盒偏差 | ≤ 2 像素                        | `GEOMETRY_TOLERANCE` |

两条都要看：只看像素会被字体抗锯齿误报，只看几何会漏掉颜色。

## 确定性怎么保证

- 固定时钟：`capture.mjs` 在每个页面注入固定 `Date`（`FIXED_CLOCK`），渲染出的时间文案在每次抓取中一致。
- 关闭动画：注入 `animation:none`、`transition:none`、`caret-color:transparent`，并用 `reducedMotion: "reduce"`。
- 固定渲染：`--force-color-profile=srgb`、`--font-render-hinting=none`、`--disable-lcd-text`、`--hide-scrollbars`，`deviceScaleFactor: 1`，固定 `locale` 与 `timezoneId`。
- 固定夹具：`pages.json` 的 `fixtures[].storage` 与页面 `storage` 会在页面脚本执行前写入 `localStorage`（键名与产品现有存储键完全一致，不改数据格式）。
- 主题：默认按 `colorScheme` 模拟并在 `<html>` 上切换 `knorvia-dark`；如果某页需要读产品自己的持久化主题，在该页 `storage` 里补上对应键。

同一提交连续抓两次必须零差异（像素与几何都为 0，PNG 逐字节相同）。截不稳的页面先修夹具，**不加容差**。

## 页面清单 `pages.json`

```json
{
  "schemaVersion": 1,
  "fixtures": { "empty-workspace": { "storage": {}, "steps": [] } },
  "pages": [
    {
      "id": "chat-single",
      "title": "单聊",
      "route": "/",
      "readyTestId": "chat-input",
      "testids": ["studio-activity-rail", "chat-input"],
      "fixtures": ["empty-workspace"],
      "steps": [{ "click": "studio-chats-open" }]
    }
  ]
}
```

- `readyTestId` 必须出现在 `testids` 里；页面就绪以它可见为准。
- `steps` 支持 `click` / `waitFor`（`data-testid`）、`fill` / `select`（`{ testid, value }`）、`press`（键名）。
- 每个 UI 包写合同时把自己的页面补进这里，并在旧实现上先截基线。
- M0 首版覆盖：主界面、单聊、群聊、工作台、设置（插件管理）。工作台与设置页的就绪 testid 需要在第一次真实基线抓取时按页面收紧——工具找不到就会报错，不会静默通过。

## 基线存放

截图体积大，基线放主仓孤立分支 `ui-baseline`，不进 `main`；每张图与 `manifest.json` 记录生成时的 main 提交。`manifest.json` 还记了 Node 版本、平台、Chromium 路径与固定的抓取时间，便于复现。

## 测试

```bash
# 纯函数测试（PNG 编解码、像素/几何比较、页面清单校验），已接入 pnpm test:studio
node --test scripts/ui-baseline/png.test.mjs scripts/ui-baseline/compare.test.mjs scripts/ui-baseline/capture.test.mjs

# 浏览器确定性测试：需要本机已预装 Chromium，不下载浏览器
node --test scripts/ui-baseline/capture.browser.test.mjs
```

Chromium 解析顺序：`KNORVIA_UI_BASELINE_CHROMIUM` / `CHROMIUM_PATH` → 系统 `/usr/bin/chromium` → Playwright 期望路径 → Playwright 缓存里最新一版 → 本机 Chrome。
