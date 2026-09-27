# Knorvia 图标语言「丝带线」

2026-09-27。用户要求为 Knorvia Studio 设计一套新的图标语言，**只换各种小图标**，插件、创作等页面不能漏。本规格延续 `specs/knorvia-visual-language.md` 的黑白、丝带、纸片、三道笔画与细线规则；布局、组件、交互和品牌 Logo、内核/模型供应商等第三方品牌标记不变。

## 语言规则

1. **网格与线**：24 网格，四周约 2.5 安全边；统一 1.6 细线（沿用 `svg.lucide` 规则）、圆端圆角。字形不写死线宽和颜色，只用 `currentColor`。
2. **软板**：承载内容的外形（气泡、文件、文件夹、窗口、面板、锁体等）用大圆角软板，不用直角框。
3. **纸片底**：主体外形下垫一层同色低透明填充（`knorvia-icon-tint`），浅色 0.10 / 深色 0.14；按钮悬停、`aria-pressed`、`aria-selected`、`data-state=active`、`.bg-selected` 时加深到 0.20 / 0.26，对应「纸片式选中」。调用方给图标加实心填充时，描边层会覆盖纸片底，不影响原有实心用法。
4. **呼吸间隙**：部件之间留缝而不是粘连——放大镜柄、垃圾桶盖、魔杖尖端、日历与时钟、工作流节点连线。
5. **实心点**：省略号、握把、键盘键、状态点使用实心圆，不依赖零长度线段。
6. **加载**：`LoaderCircle` 是淡轨道 + 四分之一弧；`Loader` 是八道透明度递减的光线；两者绕中心旋转对称，保证 `animate-spin` 平稳。
7. **插件与引导卡片**：内置插件（documents、pdf、spreadsheets、presentations、image-search、plugin-creator、browser-use、skill-creator）与建议卡片的文件、终端图标，改为石墨色圆角方块 + 白色丝带线字形的 SVG（`packages/ui/src/assets/plugin-icons/`），只含黑白灰，深浅主题都可读。原蓝绿色 PNG 删除。飞书为第三方品牌标记，保留。

## 实现与所有权

- **唯一接入点**：`packages/ui/vite/knorviaIconsPlugin.ts`。桌面与 Web 的 Vite 配置启用后，所有 `import … from "lucide-react"` 解析到 `packages/ui/src/icons/knorviaLucide.generated.ts`；业务组件导入不改。图标目录内部导入真实 `lucide-react`，避免循环，也保证只有一份 lucide 运行时（替代桌面端原来的 `lucide-react` 路径别名）。
- **字形唯一来源**：`packages/ui/src/icons/glyphs/`（navigation / actions / content 三个主题文件，共享构件在 `glyphPrimitives.ts`），由 `knorviaGlyphs.ts` 合并；键名为 lucide 导出名，跨文件重名时生成脚本直接报错。
- **生成模块**：`node scripts/generate-knorvia-icons.mjs` 读取 lucide 类型声明中的别名表，把同一图标的全部别名（如 `AlertCircle`/`CircleAlert`/`CircleAlertIcon`/`LucideCircleAlert`）一起覆盖导出；未覆盖的名称继续透传 lucide。`--check` 检查是否过期。
- **渲染基座**：`createKnorviaIcon` 复用 lucide 的 `createLucideIcon`，size、color、strokeWidth、absoluteStrokeWidth、aria、ref 与类名 `lucide lucide-<name>` 保持原行为，额外附加 `knorvia-icon`。
- Node 测试环境不经过 Vite，仍拿到原 lucide 组件；这只影响外观，不影响行为测试。

## 验收

1. 界面源码（ui、desktop renderer、web）导入的每个 lucide 图标名都有 Knorvia 字形（测试逐个核对，目前 330 个导入名全覆盖）。
2. 生成模块与字形表一致；字形不含写死的颜色和线宽，路径数据合法。
3. 插件管理、插件详情、建议卡片不再引用彩色 PNG；插件 SVG 只含黑白灰。
4. 工具栏、设置导航、创作、工作流、群聊、插件页在深浅主题下图标一致；悬停与选中时纸片底加深；减少动态效果时无过渡。
5. `pnpm typecheck`、`pnpm lint` 与相关测试按实际结果报告；便携包覆盖保留 `data`。
