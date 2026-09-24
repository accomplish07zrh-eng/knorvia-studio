export const agentsZhCN = {
  "studio.agents.title": "Agent 管理",
  "studio.agents.description": "自动发现本机已有的 CLI Agent，也可连接自定义 ACP 内核。",
  "studio.agents.sharedResources":
    "Studio 技能与 MCP 可供接入内核使用；插件中的技能和 MCP 可共享。兼容能力以当前内核为准，插件原生命令与钩子不跨内核共享。",
  "studio.agents.builtin": "内置",
  "studio.agents.pending": "待接入",
  "studio.agents.notConnected": "尚未连接",
  "studio.agents.builtinDescription":
    "使用 Knorvia 的原生对话与工具能力。模型和 API Key 在模型设置中管理。",
  "studio.agents.externalDescription":
    "沿用 CLI 自己的认证配置。检测到安装不代表已经登录或拥有可用额度。",
  "studio.agents.antigravityNote":
    "使用 agy 原生会话。无界面运行时需审批的工具会按 CLI 规则拒绝；Studio 暂不能向本轮注入 MCP。",
  "studio.agents.models": "模型设置",
  "studio.agents.configure": "配置",
  "studio.agents.configureTitle": "配置 {name}",
  "studio.agents.configureDescription":
    "保存本机连接和下一轮对话使用的权限、模型。沿用 CLI 自己的认证方式。",
  "studio.agents.path": "可执行文件路径",
  "studio.agents.pathPlaceholder": "例如 C:\\Tools\\Agent\\agent.exe",
  "studio.agents.pathHint":
    "填写 CLI 可执行文件路径；留空会自动查找本机安装。只填路径，不包含命令参数或密钥。",
  "studio.agents.noPath": "尚未设置路径",
  "studio.agents.preference": "权限偏好",
  "studio.agents.preferenceHint":
    "应用于之后启动的任务；内核自身的限制仍然有效，不支持的权限档无法选择。",
  "studio.agents.permission.read-only": "仅查看",
  "studio.agents.permission.ask": "变更前确认",
  "studio.agents.permission.full-access": "完全访问（免逐项确认）",
  "studio.agents.install": "安装",
  "studio.agents.update": "更新 Studio 副本",
  "studio.agents.uninstall": "卸载",
  "studio.agents.managementUnavailable": "安装、更新和卸载将在接入连接管理后开放。",
  "studio.agents.resetConfig": "恢复默认",
  "studio.agents.resetConfigTitle": "重置 {name} 的配置？",
  "studio.agents.resetConfigDescription":
    "恢复自动查找路径、“变更前确认”和 CLI 默认模型。不会卸载 CLI 或删除会话。",
  "studio.agents.save": "保存",
  "studio.agents.cancel": "取消",
  "studio.agents.saved": "配置已保存",
  "studio.agents.saving": "正在保存…",
  "studio.agents.inspect": "检测本机 Agent",
  "studio.agents.checking": "正在检测…",
  "studio.agents.loading": "正在读取连接配置…",
  "studio.agents.runtimeUnavailable": "当前连接尚不支持 Agent 管理。",
  "studio.agents.detected": "已检测到",
  "studio.agents.notInstalled": "未检测到安装",
  "studio.agents.unchecked": "尚未检测",
  "studio.agents.autoPath": "自动查找本机安装",
  "studio.agents.origin.builtin": "应用内置",
  "studio.agents.origin.managed": "Studio 管理",
  "studio.agents.origin.external": "本机已有安装",
  "studio.agents.origin.missing": "尚未找到",
  "studio.agents.capabilities": "Studio 已验证的接入能力",
  "studio.agents.capability.resume": "续聊",
  "studio.agents.capability.approval": "操作确认",
  "studio.agents.capability.questions": "提问",
  "studio.agents.capability.readOnly": "强制只读",
  "studio.agents.capability.fullAccess": "完全访问模式",
  "studio.agents.capabilityScope":
    "这里显示 Studio 已接通的控制能力；没有完全访问模式，不代表 CLI 本身不能在确认后修改文件。",
  "studio.agents.supported": "支持",
  "studio.agents.unsupported": "不支持",
  "studio.agents.externalManagement":
    "当前使用本机已有安装。另装 Studio 管理版本只隔离程序和版本；登录、配置与项目仍可能共用。",
  "studio.agents.connectExisting": "请从官方渠道安装后重新检测；Studio 不接管外部安装。",
  "studio.agents.externalInstalled": "当前使用本机已有安装；更新和卸载由原 CLI 管理。",
  "studio.agents.managementOpen": "安装与维护",
  "studio.agents.managementTitle": "{name} · 安装与维护",
  "studio.agents.managementExisting": "优先使用当前检测到的本机 CLI。",
  "studio.agents.managementSeparateActive": "当前连接使用 Studio 管理版本。",
  "studio.agents.managementMissing": "尚未检测到可用的本机安装。",
  "studio.agents.existingInstallation": "本机已有安装",
  "studio.agents.existingUpdateReady": "Studio 可调用该安装来源的更新程序；更新后会重新检测版本。",
  "studio.agents.existingUpdateUnavailable":
    "无法确认此安装的安全更新方式。请通过原安装渠道更新后重新检测。",
  "studio.agents.updateExisting": "更新本机 CLI",
  "studio.agents.updateExistingTitle": "更新本机的 {name}？",
  "studio.agents.updateExistingDescription":
    "将运行该安装来源的更新程序：{path}。它可能修改 CLI 程序、依赖或自身配置；Studio 不会安装独立副本。请先结束正在使用此 CLI 的任务。",
  "studio.agents.separateInstallation": "高级操作 · Studio 管理版本",
  "studio.agents.separateExplanation":
    "另装一份程序以单独管理版本；登录、配置和项目可能仍与本机 CLI 共用。这不是完整沙箱。",
  "studio.agents.managementClose": "关闭",
  "studio.agents.managementComplete": "操作已完成，正在重新检测本机 CLI。",
  "studio.agents.discardConfigTitle": "放弃尚未保存的配置？",
  "studio.agents.discardConfigDescription":
    "打开安装与维护会关闭当前配置窗口，尚未保存的修改将丢失。",
  "studio.agents.discardConfig": "放弃修改",
  "studio.agents.installManaged": "另装 Studio 管理版本",
  "studio.agents.busy.install": "正在安装…",
  "studio.agents.busy.update": "正在更新…",
  "studio.agents.busy.uninstall": "正在卸载…",
  "studio.agents.uninstallTitle": "卸载 {name} 的 Studio 副本？",
  "studio.agents.uninstallDescription":
    "仅移除 Studio 管理的副本：{path}。已有系统安装、认证配置与对话记录会保留；连接路径恢复自动查找。",
  "studio.agents.managedPathMissing": "副本操作未返回有效路径，请重新检测后再配置。",
  "studio.agents.configAfterManagementFailed": "副本操作已完成，但连接配置未保存：{error}",
  "studio.agents.model": "模型（可选）",
  "studio.agents.modelPlaceholder": "留空沿用 CLI 默认模型",
  "studio.agents.modelHint": "填写内核支持的模型标识；不要填写 API Key。",
  "studio.agents.readOnlyUnsupported": "该内核无法强制只读，因此已禁用“仅查看”。",
  "studio.agents.capabilitiesUnknown": "尚未确认内核能力。检测完成前仅可配置“变更前确认”。",
  "studio.agents.permissionUnsupported": "当前权限档不受此内核支持，请选择可用选项。",
  "studio.agents.manage": "管理 Agent",
  "studio.agents.kernel": "对话内核",
  "studio.agents.switchHint": "切换内核会新建独立会话",
  "studio.agents.chooseKernel": "选择内核",
  "studio.agents.newChat": "新对话",
  "studio.agents.chatTitle": "准备与 {name} 对话",
  "studio.agents.chatDescription": "连接后即可发送消息。现在可以先写下问题，草稿会保存在本机。",
  "studio.agents.chatPlaceholder": "写下要交给 {name} 的任务…",
  "studio.agents.openSettings": "前往 Agent 管理",
  "studio.agents.send": "发送",
  "studio.agents.sendUnavailable": "当前内核尚未连接，草稿不会发送。",
  "studio.agents.draftSaved": "草稿已保存至本机",
  "studio.agents.draftUnsaved": "草稿尚未保存，请勿关闭应用",
  "studio.agents.draftEmpty": "尚无草稿",
  "studio.agents.conversationsEmpty": "暂无对话或草稿",
  "studio.agents.conversationsLoading": "正在读取对话…",
  "studio.agents.conversationFallback": "未命名对话",
  "studio.agents.conversationDelete": "删除对话",
  "studio.agents.conversationDeleteTitle": "删除这段对话？",
  "studio.agents.conversationDeleteDescription":
    "将移除对话入口及本机未发送草稿，无法从列表恢复。执行记录与 CLI 原生会话文件会保留。",
  "studio.agents.draftListEmpty": "写下消息后，草稿会显示在这里",
  "studio.agents.draftFallback": "未命名草稿",
  "studio.agents.draftLabel": "草稿",
  "studio.agents.noProject": "未选择项目",
  "studio.agents.draftDelete": "删除草稿",
  "studio.agents.draftDeleteTitle": "删除这份草稿？",
  "studio.agents.draftDeleteDescription": "草稿只保存在本机，删除后无法恢复。",
  "studio.agents.draftCount": "{count} / 20000",
  "studio.agents.retry": "重试保存",
  "studio.agents.resetStorage": "重置本机 Agent 草稿缓存",
  "studio.agents.resetStorageTitle": "重置本机 Agent 草稿缓存？",
  "studio.agents.resetStorageDescription":
    "将删除本机编辑偏好缓存与尚未发送的外部会话草稿。已保存的连接配置、正式对话、CLI 安装与认证信息不受影响。此操作无法撤销。",
  "studio.agents.storage.corrupt":
    "本机 Agent 草稿数据无法读取。原始数据已保留，新修改暂时只保留在本次打开期间。",
  "studio.agents.storage.unavailable":
    "无法读取本机存储。为保护已有数据，新修改暂时只保留在本次打开期间。",
  "studio.agents.storage.write-failed":
    "无法保存到本机。当前修改只保留在此窗口内存中；关闭应用前请重试保存或复制内容。",
  "studio.agents.storage.too-long":
    "有草稿超过 20000 个字符，本机尚未保存当前改动。完整内容暂存在此窗口内存中，切换页面不会丢失；关闭应用前请缩短草稿或复制保存。",
  "studio.agents.error.invalid-config": "请填写有效的可执行文件路径与权限偏好；路径不能包含换行。",
  "studio.agents.error.invalid-session": "该会话与所选内核不匹配，请新建独立会话。",
  "studio.agents.error.invalid-selection": "模型或思考档位无效，请重新选择。",
  "studio.agents.error.invalid-project": "无法选择项目，请重试或选择有效的本机文件夹。",
  "studio.agents.error.draft-too-long": "草稿最多可保存和发送 20000 个字符，请缩短超限内容后继续。",
  "studio.agents.error.draft-limit": "最多可保存 100 份草稿，请先从会话列表删除不需要的草稿。",
} as const;

export const agentsEnUS: Record<keyof typeof agentsZhCN, string> = {
  "studio.agents.title": "Agent management",
  "studio.agents.description":
    "Discover local CLI agents automatically, or connect a custom ACP adapter.",
  "studio.agents.sharedResources":
    "Studio skills and MCP can be used by connected engines. Plugin skills and MCP can be shared; compatibility depends on the engine. Native plugin commands and hooks are not shared across engines.",
  "studio.agents.builtin": "Built in",
  "studio.agents.pending": "Not connected",
  "studio.agents.notConnected": "Not connected",
  "studio.agents.builtinDescription":
    "Use Knorvia’s native conversations and tools. Manage models and API keys in model settings.",
  "studio.agents.externalDescription":
    "Uses the CLI's own authentication. Detecting an installation does not verify sign-in or available credits.",
  "studio.agents.antigravityNote":
    "Uses native agy sessions. Headless tools that need approval follow CLI deny rules; Studio cannot inject MCP for this turn yet.",
  "studio.agents.models": "Model settings",
  "studio.agents.configure": "Configure",
  "studio.agents.configureTitle": "Configure {name}",
  "studio.agents.configureDescription":
    "Save the local connection, permission and model for future turns. The CLI keeps its own authentication.",
  "studio.agents.path": "Executable path",
  "studio.agents.pathPlaceholder": "For example C:\\Tools\\Agent\\agent.exe",
  "studio.agents.pathHint":
    "Enter the CLI executable path, or leave it empty to detect local installations. Do not include arguments or secrets.",
  "studio.agents.noPath": "No path configured",
  "studio.agents.preference": "Permission preference",
  "studio.agents.preferenceHint":
    "Applies to future tasks. The engine's own restrictions remain in force; unsupported modes cannot be selected.",
  "studio.agents.permission.read-only": "Read only",
  "studio.agents.permission.ask": "Ask before changes",
  "studio.agents.permission.full-access": "Full access (skip per-action approval)",
  "studio.agents.install": "Install",
  "studio.agents.update": "Update Studio copy",
  "studio.agents.uninstall": "Uninstall",
  "studio.agents.managementUnavailable":
    "Install, update and uninstall controls will become available when connection management is added.",
  "studio.agents.resetConfig": "Reset defaults",
  "studio.agents.resetConfigTitle": "Reset {name} settings?",
  "studio.agents.resetConfigDescription":
    "Restore automatic path detection, Ask before changes, and the CLI's default model. Keeps the CLI and conversations.",
  "studio.agents.save": "Save",
  "studio.agents.cancel": "Cancel",
  "studio.agents.saved": "Settings saved",
  "studio.agents.saving": "Saving…",
  "studio.agents.inspect": "Detect local agents",
  "studio.agents.checking": "Detecting…",
  "studio.agents.loading": "Loading connection settings…",
  "studio.agents.runtimeUnavailable": "Agent management is not available on this connection.",
  "studio.agents.detected": "Detected",
  "studio.agents.notInstalled": "Installation not found",
  "studio.agents.unchecked": "Not checked",
  "studio.agents.autoPath": "Automatically detect a local installation",
  "studio.agents.origin.builtin": "Built into the app",
  "studio.agents.origin.managed": "Managed by Studio",
  "studio.agents.origin.external": "Existing local installation",
  "studio.agents.origin.missing": "Not found",
  "studio.agents.capabilities": "Capabilities verified by Studio",
  "studio.agents.capability.resume": "Resume",
  "studio.agents.capability.approval": "Approvals",
  "studio.agents.capability.questions": "Questions",
  "studio.agents.capability.readOnly": "Enforced read-only",
  "studio.agents.capability.fullAccess": "Full-access mode",
  "studio.agents.capabilityScope":
    "These are controls connected to Studio. No full-access mode does not mean the CLI cannot edit files after approval.",
  "studio.agents.supported": "Supported",
  "studio.agents.unsupported": "Unsupported",
  "studio.agents.externalManagement":
    "Using your existing installation. A Studio-managed version isolates only the program and version; sign-in, settings and projects may still be shared.",
  "studio.agents.connectExisting":
    "Install this CLI from its official source, then detect it again. Studio does not take over external installations.",
  "studio.agents.externalInstalled":
    "Using your existing installation; update and uninstall are managed by the original CLI.",
  "studio.agents.managementOpen": "Installation and maintenance",
  "studio.agents.managementTitle": "{name} · Installation and maintenance",
  "studio.agents.managementExisting": "Prefer the detected local CLI installation.",
  "studio.agents.managementSeparateActive": "The current connection uses a Studio-managed version.",
  "studio.agents.managementMissing": "No usable local installation was detected.",
  "studio.agents.existingInstallation": "Existing local installation",
  "studio.agents.existingUpdateReady":
    "Studio can run this installation's updater and will detect its version again afterward.",
  "studio.agents.existingUpdateUnavailable":
    "Studio cannot verify a safe updater for this installation. Update it through its original installer, then detect again.",
  "studio.agents.updateExisting": "Update local CLI",
  "studio.agents.updateExistingTitle": "Update the local {name} installation?",
  "studio.agents.updateExistingDescription":
    "Runs this installation's updater: {path}. It may change the CLI, its dependencies or its own settings. Studio will not install a separate copy. Finish tasks using this CLI first.",
  "studio.agents.separateInstallation": "Advanced · Studio-managed version",
  "studio.agents.separateExplanation":
    "Installs another program copy with a separately managed version. Sign-in, settings and projects may still be shared with the local CLI; this is not a full sandbox.",
  "studio.agents.managementClose": "Close",
  "studio.agents.managementComplete": "The operation finished. Detecting the local CLI again.",
  "studio.agents.discardConfigTitle": "Discard unsaved settings?",
  "studio.agents.discardConfigDescription":
    "Opening installation and maintenance closes this settings window and discards unsaved changes.",
  "studio.agents.discardConfig": "Discard changes",
  "studio.agents.installManaged": "Install a separate Studio-managed version",
  "studio.agents.busy.install": "Installing…",
  "studio.agents.busy.update": "Updating…",
  "studio.agents.busy.uninstall": "Uninstalling…",
  "studio.agents.uninstallTitle": "Uninstall the Studio copy of {name}?",
  "studio.agents.uninstallDescription":
    "Removes only the Studio-managed copy: {path}. Keeps system installations, authentication and conversations; the connection returns to automatic detection.",
  "studio.agents.managedPathMissing":
    "The operation did not return a valid managed path. Detect the installation again before configuring it.",
  "studio.agents.configAfterManagementFailed":
    "The copy was managed successfully, but its connection settings were not saved: {error}",
  "studio.agents.model": "Model (optional)",
  "studio.agents.modelPlaceholder": "Use the CLI's default model",
  "studio.agents.modelHint": "Enter a model identifier supported by the engine, not an API key.",
  "studio.agents.readOnlyUnsupported":
    "This engine cannot enforce read-only access, so Read only is disabled.",
  "studio.agents.capabilitiesUnknown":
    "Engine capabilities have not been checked. Only Ask before changes is available until detection finishes.",
  "studio.agents.permissionUnsupported":
    "This permission mode is not supported by the engine. Select an available option.",
  "studio.agents.manage": "Manage agents",
  "studio.agents.kernel": "Conversation engine",
  "studio.agents.switchHint": "Changing engines starts an independent conversation",
  "studio.agents.chooseKernel": "Choose an engine",
  "studio.agents.newChat": "New conversation",
  "studio.agents.chatTitle": "Prepare a conversation with {name}",
  "studio.agents.chatDescription":
    "Messages can be sent once connected. Write your task now and keep a draft on this device.",
  "studio.agents.chatPlaceholder": "Write a task for {name}…",
  "studio.agents.openSettings": "Open agent management",
  "studio.agents.send": "Send",
  "studio.agents.sendUnavailable": "This engine is not connected. Your draft will not be sent.",
  "studio.agents.draftSaved": "Draft saved on this device",
  "studio.agents.draftUnsaved": "Draft not saved; keep the app open",
  "studio.agents.draftEmpty": "No drafts yet",
  "studio.agents.conversationsEmpty": "No conversations or drafts yet",
  "studio.agents.conversationsLoading": "Loading conversations…",
  "studio.agents.conversationFallback": "Untitled conversation",
  "studio.agents.conversationDelete": "Delete conversation",
  "studio.agents.conversationDeleteTitle": "Delete this conversation?",
  "studio.agents.conversationDeleteDescription":
    "Removes this conversation from the list and deletes its unsent local draft. This cannot be restored from the list. Execution records and native CLI session files are retained.",
  "studio.agents.draftListEmpty": "Your message drafts will appear here",
  "studio.agents.draftFallback": "Untitled draft",
  "studio.agents.draftLabel": "Draft",
  "studio.agents.noProject": "No project selected",
  "studio.agents.draftDelete": "Delete draft",
  "studio.agents.draftDeleteTitle": "Delete this draft?",
  "studio.agents.draftDeleteDescription":
    "This draft is stored only on this device. Deletion cannot be undone.",
  "studio.agents.draftCount": "{count} / 20000",
  "studio.agents.retry": "Retry saving",
  "studio.agents.resetStorage": "Reset local agent draft cache",
  "studio.agents.resetStorageTitle": "Reset local agent draft cache?",
  "studio.agents.resetStorageDescription":
    "Deletes the local editing cache and unsent external conversation drafts. Keeps saved connection settings, accepted conversations, CLI installations and authentication. This cannot be undone.",
  "studio.agents.storage.corrupt":
    "Local agent draft data could not be read. The original data is preserved; new edits are kept only while this app remains open.",
  "studio.agents.storage.unavailable":
    "Local storage could not be read. To protect existing data, new edits are kept only while this app remains open.",
  "studio.agents.storage.write-failed":
    "Changes are only in this window's memory. Retry saving or copy your text before closing the app.",
  "studio.agents.storage.too-long":
    "A draft exceeds 20000 characters. Current changes have not been saved on this device. Full text stays in this window's memory across pages; shorten or copy it before closing the app.",
  "studio.agents.error.invalid-config":
    "Enter a valid executable path and permission preference. Paths cannot contain line breaks.",
  "studio.agents.error.invalid-session":
    "This conversation belongs to another engine. Start a new independent conversation.",
  "studio.agents.error.invalid-selection":
    "Invalid model or reasoning level. Select an available option.",
  "studio.agents.error.invalid-project":
    "Could not select a project. Try again or choose a valid local folder.",
  "studio.agents.error.draft-too-long":
    "Drafts can save and send up to 20000 characters. Shorten oversized text to continue.",
  "studio.agents.error.draft-limit":
    "Up to 100 drafts can be saved. Delete unneeded drafts from the conversation list first.",
};
