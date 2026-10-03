# Web 启动与浏览器平台完整替换候选

2026-10-03，基线 `f969c9a7869ba33257968bcf0d15c1ffb63094bb`。父任务将 `packages/web/**` 新增独占分配给整合者；原 UI PR15 没有 Web 提交，旧任务 /tmp 草稿不取用。其他四路仍在推进，不据历史 head 接收。当前 Web 属 architecture-policy 的既有 unmanaged web module，不新增跨层业务/存储权威。

已读当前 main.tsx、shared 的 IPlatformService/ServerRemoteInfo/theme preference、UI 的公共入口和 useTheme、Web HTML/Vite 与性能规格。main 当前摘要 `d65357f61fe612b312a9dc5dbc7b5362c04c522c614a37f99f7b3d4f324b709c`，saved inventory 为 upstream-modified/review:null。作者源码暴露，候选不是 clean room、已接受表达独立性或 MIT 权利结论；标准 API/固定数据/视觉文字继续保留原来源。

## 真正范围与保留项

main 的完整 theme/platform/bootstrap runtime 接入新的包内启动 owner、首屏主题 owner、声明式平台能力 compiler 和展示边界。只通过 @knorvia/client、@knorvia/shared、@knorvia/ui 的既有公共入口消费，不修改 UI/client/server/desktop/shared。

`webThemeSeed.ts` 511-byte 薄入口保留其 API/bytes（SHA-256 b80b467134c7af134b33f1647f0459fdcab204cb5ce71311257f4a0bd6eb3b26）；规范化继续委托 shared 的唯一 normalizeStoredThemePreference，不写第二套 aliases。它仍有原 upstream-modified/review:null 记录，薄适配/默认值不是新的原创模块。`perfStudioTimeline.tsx` 与独立 perf-studio-timeline.html 是 Knorvia 性能规格的 5edcf479c3f54e3d191812818804df399cbd739a 原功能，源码摘要 52ae56ea81995c705e98f075aa81e615e1b90636e450bd21f39446241fb5ff73 保留；不把 unreviewed/upstream:null 自动当成权利接受，也不重复改写本地合成夹具。它继续有独立 entry、10,000 消息/100 旧消息、revision/listener/append 与 \_\_studioPerfFixture，不走生产 Web bootstrap、模型或真实账户。

## 唯一所有者与顺序

```text
stored preference → existing seed normalizer → first-paint classes → UI useTheme 接管
document root → React root → stable stream client id → one startup execution
URL/search → bootstrap plan → websocket service accessor → browser platform → same Root tree
          └→ local server-info optional lookup         └→ failure → same retry screen
```

startup execution 只持一个 discriminated current frame；plan/services/platform 在推进时传递，没有第二份远程 session/workspace 状态、持久成功缓存、轮询或自动重连。初始化只启动一次；重试按钮仍 reload，由下一页面重新启动。RPC service 和 UI hooks 仍拥有实际连接/业务/主题变化，不由 bootstrap 再订阅镜像。

## 必须保留的行为

- 顺序是首屏主题 → createRoot(root) → generateMobileDeviceFingerprint/setStreamClientId → plan/连接/挂载。首帧前稳定 clientId；不改变 fingerprint 或存储 key。root 缺失、主题 storage/matchMedia 同步失败的原前置边界保持，不借替换默默改成成功。
- seed 默认 knorvia-light；旧 light/dark/zai-light/zai-dark、canonical 和 system 继续规范化；仅 system 查询 matchMedia。三组 class 的最终 dark/theme-knorvia-light/theme-knorvia-dark 状态保持，不写用户偏好。HTML 预载主题、meta/browser surface 和后续 UI useTheme 的视觉与接管规则不改；去掉 main 中过时的默认 Zai dark 注释，不恢复旧颜色。
- URL 用 URLSearchParams.get 的第一个 remote 值，truthy 才走 /ws/remote/<原 decoded id>；https→wss，其他协议→ws，host/port 不变。remote 路线不 fetch server-info；不额外 encode id、不解析新 query、不打开新 Web remote authority。
- 普通路线只 fetch /api/server-info，cache:no-store；非 ok、throw、JSON失败/读取失败退回同一 /ws 计划后仍尝试连接。只取 workspaces 数组第一项，truthy path/workspaceIdentity 分别传 Root；不改 schema、不写配置、不扫描其他项。其他已有可选 Root seed 字段原样传递。
- connectViaWebSocket 的 onClose 空回调、服务身份、连接等待保持；只有成功连接后创建 platform 和挂载。plan/连接/platform/render 错误进原 error screen，Error.message 或 String(error)，title Knorvia Studio、navigator.language 的原中英文选择、原文案/classes/DOM/重试 reload；不补第二错误边界、自动重试或吞未知错误。
- 成功 JSX 保持 AppErrorBoundary → KnorviaIntlProvider(setting/broadcast) → Root，同一 services/platform 与 initial workspace identity/path/task/restore/open 字段。preferDirectoryBrowser:true、supportsEmbeddedBrowser:false、allowRemoteWorkspace:false，全部布局/业务 UI 由原组件呈现。
- 平台所有现有 method names/optional method 的存在性、同步或 Promise 返回、固定结果/错误/空数组/null、新对象身份和空 disposer 行为保持；typed capability compiler 只生成本来存在的无宿主结果，不接入 Electron、主目录、凭据、OS 文件/通知授权或 updater。临时附件仍 reject，connectRemote 仍 unsupported with kind，MCP/chrome import/文件管理/编辑器/截图/窗口/更新/telemetry 的固定边界不变。不得用 any、stub business service、改公共签名、增加 capability 或放松权限来通过检查。
- openExternal 仍 window.open(\_blank,noopener,noreferrer)。通知仍 focus 时不做、API缺失/未 granted 不做、不请求授权；在 try 内构造 silent notification 再调用原声音 helper，同步错误仍忽略。getDeviceId 在调用时读取同一平台/screen物理属性，undefined→空、filter(Boolean).join('|')，不持久化或引入用户信息。

## 后续统一验收

本阶段不执行测试、lint、类型检查、格式/架构检查、构建、浏览器、性能测量或完整来源审计。最终需验收 theme aliases/default/system/classes/已有保存偏好、同步前置失败、host/protocol/remote/query/server-info失败与首 workspace、connect/platform/render 错误与 retry、首渲染 stream identity、所有平台方法存在/结果对象身份/失败、通知/fingerprint及真实 Web UI 和独立合成性能入口。原 LICENSE/NOTICE、reviews/current-files、source exposure 和失败不机械刷新；候选提交不是验证通过。
