# Changelog

## 0.11.1 - 2026-10-08

- 工作台：顶栏「新建任务」可直接新增格子，不必先收起已有格；满格时收起当前格后
  原位放入，也可在格内「⋯」菜单里「在此格新建任务」。容量改为最多两行、每行
  四格（共八格）。说明行与工具行合并为单行顶栏，任务列表、已收起与待办改为浮层，
  不再压缩格子高度；新增画布缩放（50%–150%），窄窗口下顶栏与格子标题栏自适应。
- 待办并入工作台顶栏「待办 (n)」，左侧窄工具栏不再单独放置入口。
- 聊天输入：思考强度改为强度滑杆；项目选择与插件／分支移到输入框下方；空会话
  问候改为更柔和的字重与字体。Knorvia 与所有外部内核同步生效。
- 用量统计：修复对话底部 tok/s 恒为「—」、OpenAI 兼容服务商 token 不增长、
  缓存命中偶尔变回「—」，以及 Claude Code 轮次中用量不更新的问题。
- The workbench adds New task without shelving, up to two rows of four tiles,
  a single-row toolbar with overlay panels, canvas zoom and narrow-window layouts;
  the attention inbox moves into the workbench toolbar.
- Chat input uses a reasoning-effort slider, places project and plugin controls
  below the input and softens the empty-chat greeting for every kernel.
- Footer usage now updates for streamed requests, OpenAI-compatible providers,
  compaction and mid-turn Claude Code requests.

## 0.11.0 - 2026-10-08

- 外部代理保真：保留问题选项说明、完整且有界/脱敏的审批上下文，以及
  独立工具输入、输出、原生内容和状态说明。未知状态如实显示；普通 Codex
  轮次以启动响应确认归属，旧轮消息或审批不再污染或结束当前运行。
- 聊天贴图：本地 Codex 可粘贴或拖入静态 PNG/JPEG，支持只发图片或图文
  一起发送。发送仍要求明确的图片模型能力，沿用原会话、模型、思考档位、
  审批和去重；失败保留草稿，Host 变更或未知回执不会自动重发。
- 图片差异：在原隔离工作区审阅中并排查看精确 baseline/working 的
  PNG/JPEG。损坏、超预算或过期内容明确拒绝；应用前重验显示过的文件版本，
  不把源项目实时图片当作历史快照。
- GUI 工作台：先布局再创建任务，同内核会话保持独立输入、审批和停止。
  最多四格同屏，可拖边、放大、收起和恢复；汇总全部已知进行中任务并显示
  超容量入口。群聊与工作流继续进入原页面；离线或未完整加载明确提示。
  重载后保留布局和草稿，并要求核对连接后显式重新加入会话或打开保存的输入。
- 工作台并行预览：每格可切换「聊天＋预览」「仅聊天」「仅预览」，桌面版
  在格内用会话侧栏同款网页视图并排观看各 Agent 的 HTML 产物。Knorvia 格
  自动打开本轮网页卡片，外部内核格在运行结束后读取本次隔离修改中的网页；
  预览只属于本格会话，不登记为 Agent 可控浏览器标签。Web、远程项目与远端
  内核会明确说明暂不支持格内预览。
- External adapters retain question descriptions, bounded redacted approval
  context and separate tool input/output/content/status. Unknown results remain
  unknown; stale Codex turns cannot consume the current approval or finish its run.
- Local Codex accepts static PNG/JPEG clipboard and dropped images through the
  existing capability, session, permission and idempotency gates. Image-only input
  works; uncertain acknowledgement or a changed Host never triggers an automatic resend.
- Snapshot image review shows the exact baseline and working pair, rejects
  damaged or stale content and checks reviewed versions before applying changes.
- The GUI workbench preserves independent conversation controls and drafts,
  supports four visible panes and lists every known active task with overflow
  navigation. Groups and workflows retain their existing pages.
  After reload, saved tiles retain their layout and drafts and require explicit
  connection verification before rejoining a chat or reopening saved input.
- Each workbench tile can switch between chat and preview, chat only and preview
  only. On desktop, tiles show their own agent's HTML output side by side with the
  same web view as the session side panel: Knorvia tiles open the turn's web card,
  external-kernel tiles read pages changed in the finished isolated run. Previews
  stay bound to their tile and are never registered as agent-controlled browser
  tabs. Web, remote projects and remote kernels state that in-tile preview is
  unavailable.

Existing profiles, sessions, text-only drafts, fast model/effort choices, workspace
runtime, durable handoff, agent tools, inline review and attention remain available.
New presentation fields are additive; legacy tool text remains readable. Accepted
images belong to the existing Host records. Unsent image bytes and connection proof
are transient; reload retains pending metadata as unknown and requires explicit
review rather than resending. Back up the normal profile or portable `data/` before
upgrading and retain that data beside the replacement program. Synthetic legacy
SQLite and draft checks do not establish migration of every historical profile.

Windows x64 and Linux x64 retain their existing package formats and unsigned status.
There are no mobile changes, PTY/history additions or website deployment. Ordinary
Codex turns use authoritative startup binding; `/compact` retains its separate
legacy lifecycle. Validation uses offline native protocol fixtures and real browser
components plus the release workflow's bounded package acceptance. Human installed
GUI, real paid models, physical SSH and signing acceptance are not claimed.

## 0.10.0 - 2026-10-07

- 行内批注回改：在 Studio Diff 的旧/新侧选行，编辑并保存带文件版本的
  批注草稿，确认完整摘要后交给原 Agent、原会话和原隔离工作区定向修改。
  文件或原会话身份改变时保留草稿并要求重新核对；重复发送沿用同一回执。
  批注与所选上下文经过脱敏，不附带隐藏推理，也不自动应用到源项目。
- 跨内核待办：在原工具栏查看待审批/输入、失败/中断及完成未读，并定位
  原项目、内核、会话和历史运行。标记已读不会批准、回答或启动任务；
  新版本再次未读，旧回包不能清除后来的原生未读。Studio 覆盖持久历史，
  原生 Knorvia 来源限于当前窗口已打开的项目；离线/未完整加载明确显示。
- Inline review feedback: save version-bound annotations and confirm their full
  summary before one delivery to the original Agent/session/workspace. Stale
  files and identities retain the draft; a lost acknowledgement reuses the receipt.
- Attention inbox: navigate pending requests and terminal events across kernels,
  including older Studio history, while retaining existing native search/unread.
  Version-bound read receipts survive restart and never grant execution approval.

Existing sessions, composer comments/drafts, profile locations, workspace apply
rules and third-party notices remain intact. New review/read records are additive;
unknown newer draft formats are retained and rejected for editing. Back up the
normal profile or portable `data/` before upgrading and retain that data beside
the replacement program. Complete migration of every historical profile is not claimed.

Windows x64 and Linux x64 keep the existing installer/portable formats. Packages
remain unsigned. Remote inline feedback requires verifiable original session and
file-version evidence; unsupported sources report that limitation. This release
contains no mobile changes or website deployment. Acceptance uses controlled
native protocol fixtures and real browser components, plus the release workflow's
bounded package checks; human installed-GUI and real paid-provider acceptance are
not claimed.

## 0.9.0 - 2026-10-07

- Workspace environments: review and approve setup and service commands for an
  existing Studio workspace, view its loopback preview address and assigned port,
  then stop or recover processes owned by that workspace. Setup and services use
  a selected OS environment without ambient provider credentials. Source files
  and unrelated listeners remain protected by the existing workspace rules.
- Durable handoff: save and edit the original goal, constraints, decisions,
  progress, failed attempts, remaining steps, acceptance criteria, uncertainties
  and project file references. Notes survive reload and partial history. The
  reviewed preview redacts credentials and omits hidden reasoning and raw tool
  payloads. Missing facts stay explicit; native and external handoffs retain
  their existing confirmation and retry paths.
- Studio agent tools: supported local Studio turns can discover configured
  kernels, dispatch and message owned child tasks, inspect status and complete
  results, request human permission, cancel tasks, and receive/acknowledge
  durable completion events. Caller ownership, provider capabilities, permission
  ceilings and bounded task/retry limits remain enforced. Duplicate commands
  and lost notification acknowledgements reuse persistent identities.

Existing composer preferences/drafts, session storage, profile locations and
workspace apply protections are preserved. Back up the normal profile or the
portable `data/` directory before upgrading; keep portable data beside the
replacement program. These checks do not establish migration of every historical
user profile.

Windows x64 and Linux x64 retain the existing installer and portable formats.
Artifacts remain unsigned. SSH agent-tool dispatch and Antigravity per-turn
agent-tool injection are unavailable and report their capability limitations.
Native Knorvia explicit model overrides require a verifiable model catalog.
Completion events are received through `get_events` and `ack_event`, with
deduplicated visibility in the Studio timeline. No mobile changes are included.

Release metadata records the exact checked source and bounded package acceptance.
No human installed-GUI, real paid-model, signing or complete legacy-profile
migration acceptance is claimed.
