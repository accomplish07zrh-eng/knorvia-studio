# Changelog

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
