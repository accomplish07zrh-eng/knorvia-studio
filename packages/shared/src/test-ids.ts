/* eslint-disable max-lines -- data-testid 单一来源集中维护，拆分会让 E2E 断言面散落。 */
// 统一管理所有 data-testid，UI 组件和 E2E 测试共用此单一来源。 新增 testid 时请在此文件添加，不要在组件中硬编码字符串。 并且每个都需要中文注释

// Login entry
export const TID_LOGIN_TRIGGER = /* 右上角登录触发按钮 */ "login-trigger";
export const TID_LOGIN_MENU_ITEM = /* 用户菜单中的登录操作 */ "login-menu-item";
export const TID_LOGIN_USE_API_KEY_BUTTON =
  /* 登录页切换到 API Key 登录方式按钮 */ "login-use-api-key-button";
export const TID_LOGIN_API_KEY_PROVIDER_TRIGGER =
  /* API Key 登录 provider 选择触发器 */ "login-api-key-provider-trigger";
export const TID_LOGIN_API_KEY_PROVIDER_ITEM =
  /* API Key 登录 provider 选择项（动态后缀为 provider choice） */ "login-api-key-provider-item";
export const TID_LOGIN_API_KEY_INPUT = /* API Key 登录密钥输入框 */ "login-api-key-input";
export const TID_LOGIN_API_KEY_CONTINUE_BUTTON =
  /* API Key 登录继续按钮 */ "login-api-key-continue-button";
export const TID_LOGIN_API_KEY_CANCEL_BUTTON =
  /* API Key 登录取消按钮 */ "login-api-key-cancel-button";
export const TID_LOGIN_API_KEY_SKIP_BUTTON =
  /* API Key 登录暂时跳过按钮 */ "login-api-key-skip-button";
export const TID_LOGIN_API_KEY_ERROR = /* API Key 登录错误提示 */ "login-api-key-error";
export const TID_OAUTH_LOGIN_BUTTON = /* OAuth 弹窗内的登录按钮 */ "oauth-login-button";
export const TID_OAUTH_CANCEL = /* OAuth 弹窗取消按钮 */ "oauth-cancel";
export const TID_OAUTH_ERROR = /* OAuth 错误提示文本 */ "oauth-error";

// App
export const TID_APP_HEADER = /* 顶部导航栏 */ "app-header";
export const TID_LOCALE_TOGGLE = /* 语言切换按钮 */ "locale-toggle";
export const TID_THEME_TOGGLE = /* 主题切换按钮 */ "theme-toggle";
export const TID_LOGOUT_BUTTON = /* 退出登录按钮 */ "logout-button";
export const TID_TERMINAL_TOGGLE = /* 终端显隐切换按钮 */ "terminal-toggle";
export const TID_SIDE_PANE_TOGGLE = /* testid 逐字冻结 */ "side-pane-toggle";
export const TID_TERMINAL_CLOSE_BUTTON = /* 终端面板关闭按钮 */ "terminal-close-button";
export const TID_BROWSER_TOGGLE = /* 浏览器显隐切换按钮 */ "browser-toggle";
export const TID_GIT_TOGGLE = /* Git 显隐切换按钮 */ "git-toggle";
export const TID_BROWSER_PANE = /* 浏览器面板容器 */ "browser-pane";
export const TID_BROWSER_CLOSE_BUTTON = /* 浏览器面板关闭按钮 */ "browser-close-button";
export const TID_GIT_PANE = /* Git 面板容器 */ "git-pane";
export const TID_GIT_CLOSE_BUTTON = /* Git 面板关闭按钮 */ "git-close-button";
export const TID_GIT_ACTION_TRIGGER = /* 顶部 Git 提交或推送主入口 */ "git-action-trigger";
export const TID_GIT_COMMIT_DIALOG = /* Git 提交弹窗 */ "git-commit-dialog";
export const TID_GIT_COMMIT_MESSAGE_INPUT = /* Git 提交信息输入框 */ "git-commit-message-input";
export const TID_GIT_COMMIT_GENERATE_BUTTON =
  /* Git 提交信息生成按钮 */ "git-commit-generate-button";
export const TID_GIT_COMMIT_INCLUDE_UNSTAGED =
  /* Git 提交弹窗包含未暂存更改开关 */ "git-commit-include-unstaged";
export const TID_GIT_COMMIT_ACTION_COMMAND =
  /* Git 提交弹窗底部 Command 动作列表 */ "git-commit-action-command";
export const TID_GIT_COMMIT_ACTION_ITEM =
  /* Git 提交弹窗底部动作项（动态后缀为动作 id） */ "git-commit-action-item";
export const TID_BROWSER_ADDRESS_INPUT = /* 浏览器地址栏输入框 */ "browser-address-input";
export const TID_BROWSER_BACK_BUTTON = /* 浏览器后退按钮 */ "browser-back-button";
export const TID_BROWSER_FORWARD_BUTTON = /* 浏览器前进按钮 */ "browser-forward-button";
export const TID_BROWSER_REFRESH_BUTTON = /* 浏览器刷新按钮 */ "browser-refresh-button";
export const TID_BROWSER_RESPONSIVE_BUTTON =
  /* 浏览器自由尺寸模式按钮 */ "browser-responsive-button";
export const TID_BROWSER_RESPONSIVE_VIEWPORT =
  /* 浏览器自由尺寸视口 */ "browser-responsive-viewport";
export const TID_BROWSER_RESPONSIVE_TOOLBAR =
  /* 浏览器自由尺寸顶部控制条 */ "browser-responsive-toolbar";
export const TID_BROWSER_RESPONSIVE_WIDTH_INPUT =
  /* 浏览器自由尺寸宽度输入框 */ "browser-responsive-width-input";
export const TID_BROWSER_RESPONSIVE_HEIGHT_INPUT =
  /* 浏览器自由尺寸高度输入框 */ "browser-responsive-height-input";
export const TID_BROWSER_RESPONSIVE_ZOOM_SELECT =
  /* 浏览器自由尺寸缩放选择器 */ "browser-responsive-zoom-select";
export const TID_BROWSER_RESPONSIVE_ZOOM_OPTION =
  /* 浏览器自由尺寸缩放选项（动态后缀为 zoom 值） */ "browser-responsive-zoom-option";
export const TID_BROWSER_RESPONSIVE_SCALED_FRAME =
  /* 浏览器自由尺寸缩放后的画布占位 */ "browser-responsive-scaled-frame";
export const TID_BROWSER_RESPONSIVE_RESIZE_LEFT =
  /* 浏览器自由尺寸左边拖拽条 */ "browser-responsive-resize-left";
export const TID_BROWSER_RESPONSIVE_RESIZE_WIDTH =
  /* 浏览器自由尺寸右边拖拽条 */ "browser-responsive-resize-width";
export const TID_BROWSER_RESPONSIVE_RESIZE_TOP =
  /* 浏览器自由尺寸上边拖拽条 */ "browser-responsive-resize-top";
export const TID_BROWSER_RESPONSIVE_RESIZE_HEIGHT =
  /* 浏览器自由尺寸下边拖拽条 */ "browser-responsive-resize-height";
export const TID_BROWSER_RESPONSIVE_RESIZE_CORNER_TOP_LEFT =
  /* 浏览器自由尺寸左上角拖拽区 */ "browser-responsive-resize-corner-top-left";
export const TID_BROWSER_RESPONSIVE_RESIZE_CORNER_TOP_RIGHT =
  /* 浏览器自由尺寸右上角拖拽区 */ "browser-responsive-resize-corner-top-right";
export const TID_BROWSER_RESPONSIVE_RESIZE_CORNER_BOTTOM_LEFT =
  /* 浏览器自由尺寸左下角拖拽区 */ "browser-responsive-resize-corner-bottom-left";
export const TID_BROWSER_RESPONSIVE_RESIZE_CORNER =
  /* 浏览器自由尺寸右下角拖拽区 */ "browser-responsive-resize-corner";
export const TID_BROWSER_ELEMENT_PICKER_BUTTON =
  /* 浏览器网页元素选择按钮 */ "browser-element-picker-button";
export const TID_BROWSER_MORE_BUTTON = /* 浏览器地址栏更多操作按钮 */ "browser-more-button";
export const TID_BROWSER_OPEN_EXTERNAL_ITEM =
  /* 浏览器在默认浏览器中打开菜单项 */ "browser-open-external-item";
export const TID_BROWSER_DEVTOOLS_BUTTON = /* 浏览器打开调试工具按钮 */ "browser-devtools-button";
export const TID_BROWSER_WEBVIEW = /* 浏览器网页视图 */ "browser-webview";
export const TID_BROWSER_LOAD_ERROR = /* 浏览器页面加载失败的可读错误态 */ "browser-load-error";
export const TID_BROWSER_LOAD_ERROR_CERT_HINT =
  /* 浏览器加载失败错误态里的证书放行指引 */ "browser-load-error-cert-hint";
export const TID_PREVIEW_PANE = /* 预览面板容器 */ "preview-pane";
export const TID_PREVIEW_CLOSE_BUTTON = /* 预览面板关闭按钮 */ "preview-close-button";
export const TID_PREVIEW_PREV_BUTTON = /* 预览面板上一段按钮 */ "preview-prev-button";
export const TID_PREVIEW_NEXT_BUTTON = /* 预览面板下一段按钮 */ "preview-next-button";
export const TID_TOOL_CODE_VIEWER_BUTTON =
  /* 工具调用里的“查看代码”按钮 */ "tool-code-viewer-button";
export const TID_TOOL_SUMMARY_TRIGGER =
  /* 工具调用摘要行触发按钮（动态后缀为 toolId） */ "tool-summary-trigger";

// Terminal
export const TID_TERMINAL = /* 终端容器 */ "terminal";

// SSHDialog
export const TID_SSH_CONNECT_TRIGGER = /* 打开 SSH 连接弹窗的触发按钮 */ "ssh-connect-trigger";
export const TID_SSH_DIALOG = /* SSH 连接弹窗容器 */ "ssh-dialog";
export const TID_REMOTE_KIND_SSH = /* 远程连接方式切换到 SSH */ "remote-kind-ssh";
export const TID_REMOTE_KIND_WSL = /* 远程连接方式切换到 WSL */ "remote-kind-wsl";
export const TID_REMOTE_KIND_DOCKER = /* 远程连接方式切换到 Docker */ "remote-kind-docker";
export const TID_SSH_HOST_INPUT = /* SSH 主机地址输入框 */ "ssh-host-input";
export const TID_SSH_PORT_INPUT = /* SSH 端口号输入框 */ "ssh-port-input";
export const TID_SSH_USERNAME_INPUT = /* SSH 用户名输入框 */ "ssh-username-input";
export const TID_SSH_CONFIG_ALIAS_SELECT = /* SSH config alias 选择框 */ "ssh-config-alias-select";
export const TID_SSH_PASSWORD_INPUT = /* SSH 密码输入框 */ "ssh-password-input";
export const TID_SSH_PRIVATE_KEY_INPUT = /* SSH 私钥路径输入框 */ "ssh-private-key-input";
export const TID_SSH_AUTH_PASSWORD = /* SSH 认证方式：密码 */ "ssh-auth-password";
export const TID_SSH_AUTH_PRIVATE_KEY = /* SSH 认证方式：私钥 */ "ssh-auth-private-key";
export const TID_WSL_DISTRO_SELECT = /* WSL 发行版选择框 */ "wsl-distro-select";
export const TID_WSL_USER_INPUT = /* WSL Linux 用户输入框 */ "wsl-user-input";
export const TID_DOCKER_CONTAINER_SELECT = /* Docker 容器选择框 */ "docker-container-select";
export const TID_DOCKER_CONTAINER_INPUT = /* Docker 容器名称/ID 输入框 */ "docker-container-input";
export const TID_SSH_CONNECT_BUTTON = /* SSH 连接确认按钮 */ "ssh-connect-button";
export const TID_SSH_CANCEL_BUTTON = /* SSH 弹窗取消按钮 */ "ssh-cancel-button";

// Sidebar
export const TID_SIDEBAR = /* 侧边栏容器 */ "sidebar";
export const TID_WORKSPACE_OPEN_BUTTON = /* 侧边栏打开工作区按钮 */ "workspace-open-button";
export const TID_WORKSPACE_LIST = /* 侧边栏工作区列表 */ "workspace-list";
export const TID_WORKSPACE_ITEM =
  /* 侧边栏工作区条目（动态后缀为 workspacePath） */ "workspace-item";
export const TID_WORKSPACE_CLOSE =
  /* 侧边栏关闭工作区按钮（动态后缀为 workspacePath） */ "workspace-close";
export const TID_CONVERSATION_SECTION = /* 项目视图里的对话二级分区 */ "conversation-section";
export const TID_PROJECT_SECTION = /* 项目视图里的项目二级分区 */ "project-section";
export const TID_CONVERSATION_NEW_TASK = /* 对话分区新建任务按钮 */ "conversation-new-task";
export const TID_PROJECT_ADD = /* 项目分区添加菜单按钮 */ "project-add";
export const TID_COMPOSER_WORKSPACE_TRIGGER =
  /* Composer workspace 选择触发器 */ "composer-workspace-trigger";
export const TID_COMPOSER_REMOTE_CONNECTION =
  /* Composer workspace 菜单的远程连接入口 */ "composer-remote-connection";
export const TID_COMPOSER_PROJECT_DETACH =
  /* Composer 当前项目解绑按钮 */ "composer-project-detach";
export const TID_COMPOSER_WORK_OUTSIDE_PROJECT =
  /* Composer workspace 菜单的非项目工作入口 */ "composer-work-outside-project";
// ChatView
export const TID_CHAT_VIEW = /* 聊天视图容器 */ "chat-view";
export const TID_CHAT_MESSAGES = /* 聊天消息列表 */ "chat-messages";
export const TID_CHAT_ERROR_BANNER = /* 聊天输入区上方的错误横幅 */ "chat-error-banner";
export const TID_CHAT_ERROR_DETAILS_BUTTON =
  /* Hook 阻断错误的详情按钮 */ "chat-error-details-button";
export const TID_CHAT_ERROR_HOOK_ICON = /* Hook 阻断错误横幅左侧图标 */ "chat-error-hook-icon";
export const TID_CHAT_EMPTY = /* 聊天空状态容器 */ "chat-empty";
export const TID_CHAT_INPUT = /* 聊天输入框 */ "chat-input";
export const TID_CHAT_ATTACHMENT_BUTTON = /* 聊天附件按钮 */ "chat-attachment-button";
export const TID_CHAT_ATTACHMENT_MENU_ITEM = /* 聊天附件菜单项 */ "chat-attachment-menu-item";
export const TID_CHAT_SEND_BUTTON = /* 聊天发送按钮 */ "chat-send-button";
export const TID_CHAT_STOP_BUTTON = /* 聊天停止按钮 */ "chat-stop-button";
export const TID_CHAT_LOADING = /* 聊天加载指示器 */ "chat-loading";
export const TID_CHAT_SUMMARY_PANEL = /* 聊天右上角状态摘要面板 */ "chat-summary-panel";
export const TID_CHAT_COMPACT_MARKER =
  /* 聊天上下文压缩 timeline 横条（动态后缀为 inputId 或 operationId） */ "chat-compact-marker";
export const TID_CHAT_COMPACT_RETRY_BUTTON =
  /* 聊天上下文压缩失败/中断后的重试按钮（动态后缀为 inputId 或 operationId） */ "chat-compact-retry-button";
export const TID_CHAT_GOAL_VERIFICATION_MARKER =
  /* 聊天 goal verification timeline 横条（动态后缀为 targetId:goalIteration 或 verificationId） */ "chat-goal-verification-marker";
export const TID_CHAT_QUEUE_PANEL = /* 聊天队列面板 */ "chat-queue-panel";
export const TID_CHAT_QUEUE_ITEM = /* 聊天队列项（动态后缀为 queueItemId） */ "chat-queue-item";
export const TID_CHAT_QUEUE_ITEM_CONTENT =
  /* 聊天队列项内容（动态后缀为 queueItemId） */ "chat-queue-item-content";
export const TID_CHAT_QUEUE_SEND_NOW_BUTTON =
  /* 聊天队列项立即发送按钮（动态后缀为 queueItemId） */ "chat-queue-send-now-button";
export const TID_CHAT_QUEUE_EDIT_BUTTON =
  /* 聊天队列项编辑按钮（动态后缀为 queueItemId） */ "chat-queue-edit-button";
export const TID_CHAT_QUEUE_EDIT_INPUT =
  /* 聊天队列项编辑输入框（动态后缀为 queueItemId） */ "chat-queue-edit-input";
export const TID_CHAT_QUEUE_EDIT_SAVE_BUTTON =
  /* 聊天队列项编辑保存按钮（动态后缀为 queueItemId） */ "chat-queue-edit-save-button";
export const TID_CHAT_QUEUE_EDIT_CANCEL_BUTTON =
  /* 聊天队列项编辑取消按钮（动态后缀为 queueItemId） */ "chat-queue-edit-cancel-button";
export const TID_CHAT_QUEUE_REMOVE_BUTTON =
  /* 聊天队列项删除按钮（动态后缀为 queueItemId） */ "chat-queue-remove-button";
export const TID_CHAT_QUEUE_DRAG_HANDLE =
  /* 聊天队列项拖拽手柄（动态后缀为 queueItemId） */ "chat-queue-drag-handle";
export const TID_CHAT_USER_MESSAGE =
  /* 聊天用户消息容器（动态后缀为 messageId） */ "chat-user-message";
export const TID_CHAT_ASSISTANT_MESSAGE =
  /* 聊天助手消息容器（动态后缀为 messageId） */ "chat-assistant-message";
export const TID_CHAT_ASSISTANT_HISTORY_TRIGGER =
  /* 聊天助手消息历史折叠触发器（动态后缀为 historyStateKey） */ "chat-assistant-history-trigger";
export const TID_CHAT_ASSISTANT_HISTORY_CONTENT =
  /* 聊天助手消息历史折叠内容（动态后缀为 historyStateKey） */ "chat-assistant-history-content";
export const TID_CHAT_BACKGROUND_RESULT_TITLE =
  /* 独立后台结果轮的任务标题（动态后缀为 turn key） */ "chat-background-result-title";
export const TID_CHAT_TOOL_CALL_BLOCK =
  /* 聊天工具调用块容器（动态后缀为 toolCallId） */ "chat-tool-call-block";
export const TID_CHAT_MESSAGE_EDIT_BUTTON =
  /* 聊天用户消息编辑按钮（动态后缀为 messageId） */ "chat-message-edit-button";
export const TID_CHAT_MESSAGE_EDIT_INPUT =
  /* 聊天用户消息编辑输入框（动态后缀为 messageId） */ "chat-message-edit-input";
export const TID_CHAT_MESSAGE_EDIT_SUBMIT =
  /* 聊天用户消息编辑提交按钮（动态后缀为 messageId） */ "chat-message-edit-submit";
export const TID_CHAT_MESSAGE_EDIT_CANCEL =
  /* 聊天用户消息编辑取消按钮（动态后缀为 messageId） */ "chat-message-edit-cancel";
export const TID_CHAT_MESSAGE_FORK_BUTTON =
  /* 聊天助手消息 fork 按钮（动态后缀为 messageId） */ "chat-message-fork-button";
export const TID_CHAT_CHANGE_SUMMARY_TOGGLE_FILES_BUTTON =
  /* 聊天变更摘要撤销/重新应用按钮（动态后缀为 messageId） */ "chat-change-summary-toggle-files-button";
export const TID_PROMPT_SUGGESTION_PANEL = /* 聊天输入框前缀提示面板 */ "prompt-suggestion-panel";
export const TID_PROMPT_SUGGESTION_SECTION =
  /* 聊天输入框前缀提示分组（动态后缀为分组 id） */ "prompt-suggestion-section";
export const TID_PROMPT_SUGGESTION_OPTION =
  /* 聊天输入框前缀提示选项（动态后缀为选项 id） */ "prompt-suggestion-option";
export const TID_PROMPT_SUGGESTION_STATUS =
  /* 聊天输入框前缀提示状态行（动态后缀为分组 id） */ "prompt-suggestion-status";

// TaskList
export const TID_TASK_LIST = /* 任务列表容器 */ "task-list";
export const TID_TASK_NEW_BUTTON = /* 新建任务按钮 */ "task-new-button";
export const TID_TASK_ITEM = /* 任务列表条目（动态后缀为 taskId） */ "task-item";
export const TID_TASK_EMPTY = /* 任务列表空状态 */ "task-empty";
export const TID_TASK_ARCHIVE = /* 任务归档按钮（动态后缀为 taskId） */ "task-archive";
export const TID_TASK_SETTINGS_BUTTON = /* 任务列表下方设置入口按钮 */ "task-settings-button";

// Settings
export const TID_SETTINGS_PAGE = /* 设置页容器 */ "settings-page";
export const TID_SETTINGS_BACK_BUTTON = /* 设置页返回工作区按钮 */ "settings-back-button";
export const TID_SETTINGS_SECTION_NAV =
  /* 设置页左侧分区入口（动态后缀为 section id） */ "settings-section-nav";
export const TID_SETTINGS_NATIVE_SEARCH_SWITCH =
  /* 常规设置中的增强 Find/Grep 开关 */ "settings-native-search-switch";
export const TID_SETTINGS_DATA_BASE_DIR_INPUT =
  /* 常规设置中的数据存储路径只读输入框 */ "settings-data-base-dir-input";
export const TID_SETTINGS_DATA_BASE_DIR_BROWSE =
  /* 常规设置中的数据存储路径目录选择按钮 */ "settings-data-base-dir-browse";
export const TID_SETTINGS_DATA_BASE_DIR_SAVE =
  /* 常规设置中的数据存储路径保存按钮 */ "settings-data-base-dir-save";
export const TID_SETTINGS_DATA_BASE_DIR_STATUS =
  /* 常规设置中的数据存储路径复制/待重启/失败状态 */ "settings-data-base-dir-status";
export const TID_RESOURCE_MANAGER_TAB =
  /* 资源管理器顶部 tab（suffix=cpu|memory|storage） */ "resource-manager-tab";
export const TID_RESOURCE_MANAGER_STORAGE_SECTION =
  /* 资源管理器「存储」tab：分区容器 */ "resource-manager-storage-section";
export const TID_RESOURCE_MANAGER_STORAGE_TOTAL =
  /* 资源管理器「存储」tab：总占用数字 */ "resource-manager-storage-total";
export const TID_RESOURCE_MANAGER_STORAGE_STATUS =
  /* 资源管理器「存储」tab：扫描状态（data-state=scanning|complete|cancelled|failed|idle） */ "resource-manager-storage-status";
export const TID_RESOURCE_MANAGER_STORAGE_RESCAN =
  /* 资源管理器「存储」tab：重新计算按钮 */ "resource-manager-storage-rescan";
export const TID_RESOURCE_MANAGER_STORAGE_DISK_CARD =
  /* 资源管理器「存储」tab：磁盘卡片（suffix=卷 key 序号） */ "resource-manager-storage-disk-card";
export const TID_RESOURCE_MANAGER_STORAGE_ROOT =
  /* 资源管理器「存储」tab：磁盘卡片里的根目录行（suffix=rootId） */ "resource-manager-storage-root";
export const TID_RESOURCE_MANAGER_STORAGE_CATEGORY_ROW =
  /* 资源管理器「存储」tab：类别行（suffix=categoryId） */ "resource-manager-storage-category-row";
export const TID_RESOURCE_MANAGER_STORAGE_CATEGORY_SIZE =
  /* 资源管理器「存储」tab：类别行大小（suffix=categoryId） */ "resource-manager-storage-category-size";
export const TID_RESOURCE_MANAGER_STORAGE_CATEGORY_CLEAN =
  /* 资源管理器「存储」tab：类别清理按钮（suffix=categoryId） */ "resource-manager-storage-category-clean";
export const TID_RESOURCE_MANAGER_STORAGE_DETAIL =
  /* 资源管理器「存储」tab：类别明细视图 */ "resource-manager-storage-detail";
export const TID_RESOURCE_MANAGER_STORAGE_DETAIL_BACK =
  /* 资源管理器「存储」tab：明细返回按钮 */ "resource-manager-storage-detail-back";
export const TID_RESOURCE_MANAGER_STORAGE_DETAIL_ENTRY =
  /* 资源管理器「存储」tab：明细条目行 */ "resource-manager-storage-detail-entry";
export const TID_RESOURCE_MANAGER_STORAGE_CONFIRM_DIALOG =
  /* 资源管理器「存储」tab：清理确认框 */ "resource-manager-storage-confirm-dialog";
export const TID_RESOURCE_MANAGER_STORAGE_CONFIRM_ACCEPT =
  /* 资源管理器「存储」tab：清理确认框确认按钮 */ "resource-manager-storage-confirm-accept";
export const TID_RESOURCE_MANAGER_STORAGE_CONFIRM_CANCEL =
  /* 资源管理器「存储」tab：清理确认框取消按钮 */ "resource-manager-storage-confirm-cancel";
export const TID_SETTINGS_MEMORY_SWITCH = /* Memory 设置模块中的总开关 */ "settings-memory-switch";
export const TID_SETTINGS_MEMORY_REFRESH = /* Memory 设置模块刷新按钮 */ "settings-memory-refresh";
export const TID_SETTINGS_MEMORY_SCOPE_TRIGGER =
  /* Memory Workspace Scope 菜单触发器 */ "settings-memory-scope-trigger";
export const TID_SETTINGS_MEMORY_SCOPE_ICON =
  /* Memory Workspace Scope 图标 */ "settings-memory-scope-icon";
export const TID_SETTINGS_MEMORY_COUNT =
  /* Memory 当前 Workspace 文件数量 */ "settings-memory-count";
export const TID_SETTINGS_MEMORY_SEARCH_INPUT =
  /* Memory 文件名搜索输入框 */ "settings-memory-search-input";
export const TID_SETTINGS_MEMORY_SEARCH_CLEAR =
  /* Memory 文件名搜索清空按钮 */ "settings-memory-search-clear";
export const TID_SETTINGS_MEMORY_BACK_PROJECTS =
  /* Memory 项目文件列表返回项目列表按钮 */ "settings-memory-back-projects";
export const TID_SETTINGS_MEMORY_BACK_MEMORIES =
  /* Memory 文件正文返回项目文件列表按钮 */ "settings-memory-back-memories";
export const TID_SETTINGS_MEMORY_WORKSPACE =
  /* Memory workspace 行（动态后缀为 workspace id） */ "settings-memory-workspace";

export const TID_SETTINGS_MEMORY_FILE =
  /* Memory 文件行（动态后缀为文件名） */ "settings-memory-file";
export const TID_SETTINGS_MEMORY_FILE_ICON =
  /* Memory 文件类型图标（动态后缀为文件名） */ "settings-memory-file-icon";
export const TID_SETTINGS_MEMORY_FILE_NAME =
  /* Memory 文件名称（动态后缀为文件名） */ "settings-memory-file-name";
export const TID_SETTINGS_MEMORY_FILE_UPDATED_AT =
  /* Memory 文件更新时间（动态后缀为文件名） */ "settings-memory-file-updated-at";
export const TID_SETTINGS_MEMORY_FILE_EDITOR_ACTIONS =
  /* Memory 文件编辑器按钮组（动态后缀为文件名） */ "settings-memory-file-editor-actions";
export const TID_SETTINGS_MEMORY_PREVIEW =
  /* Memory 原始 Markdown 预览 */ "settings-memory-preview";
export const TID_SETTINGS_ASK_USER_QUESTION_AUTO_RESOLUTION_SWITCH =
  /* 常规设置中的 AskUserQuestion 自动继续开关 */ "settings-ask-user-question-auto-resolution-switch";
export const TID_SETTINGS_LOCALE_SELECT_TRIGGER =
  /* 设置页通用分区的界面语言下拉触发器 */ "settings-locale-select-trigger";
export const TID_SETTINGS_LOCALE_SELECT_ITEM =
  /* 设置页通用分区的界面语言下拉项（动态后缀为 locale preference） */ "settings-locale-select-item";
export const TID_MCP_SERVER_ROW =
  /* 用户/工作区 MCP 列表行（动态后缀为 MCP runtime 名称） */ "mcp-server-row";
export const TID_PLUGIN_MCP_SERVER_ROW =
  /* 插件 MCP 列表行（动态后缀为 MCP runtime 名称） */ "plugin-mcp-server-row";
export const TID_MCP_OPEN_AUTHORIZATION_BUTTON =
  /* MCP OAuth 授权按钮（动态后缀为 MCP runtime 名称） */ "mcp-open-authorization-button";
export const TID_SUBAGENT_ROW = /* 子智能体列表行（动态后缀为子智能体名称） */ "subagent-row";
export const TID_SUBAGENT_BUILT_IN_MODEL_TRIGGER =
  /* 内置子智能体模型选择控件（动态后缀为子智能体名称） */ "subagent-built-in-model-trigger";
export const TID_SETTINGS_USAGE_TAB =
  /* 设置页使用统计顶层 tab（动态后缀为 usage tab id） */ "settings-usage-tab";
export const TID_SIDEBAR_USAGE_REMAINING_TRIGGER =
  /* 侧边栏头像菜单剩余额度子菜单入口 */ "sidebar-usage-remaining-trigger";
export const TID_SIDEBAR_CODING_PLAN_USAGE_BUTTON =
  /* 侧边栏头像菜单使用统计入口 */ "sidebar-coding-plan-usage-button";

// Model Provider Settings
export const TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON =
  /* 模型供应商顶部添加按钮 */ "model-provider-add-provider-button";
export const TID_MODEL_PROVIDER_TEMPLATE_PICKER =
  /* 模型供应商 Template 选择页 */ "model-provider-template-picker";
export const TID_MODEL_PROVIDER_TEMPLATE_ITEM =
  /* 模型供应商 Template 选择项（动态后缀为 templateId，custom 表示纯自定义） */ "model-provider-template-item";
export const TID_MODEL_PROVIDER_TEMPLATE_BACK_BUTTON =
  /* 模型供应商 Template 选择页返回当前 Provider 详情的按钮 */ "model-provider-template-back-button";
export const TID_MODEL_PROVIDER_NAV_ITEM =
  /* 模型供应商左侧导航条目（动态后缀为 provider node key） */ "model-provider-nav-item";
export const TID_MODEL_PROVIDER_CONNECTION_MODE_TRIGGER =
  /* 模型供应商连接方式下拉触发器 */ "model-provider-connection-mode-trigger";
export const TID_MODEL_PROVIDER_START_PLAN_COUNT_SHORTCUT =
  /* 设置页已有 Start Plan 的数量快捷入口。 */ "model-provider-start-plan-count-shortcut";
export const TID_MODEL_PROVIDER_START_PLAN_SWITCH_PREFIX =
  "model-provider-start-plan-switch-prefix";
export const TID_MODEL_PROVIDER_CONNECTION_MODE_ITEM =
  /* 模型供应商连接方式下拉项（动态后缀为连接方式 key） */ "model-provider-connection-mode-item";
export const TID_MODEL_PROVIDER_API_KEY_INPUT =
  /* 模型供应商详情 API Key 输入框 */ "model-provider-api-key-input";
export const TID_MODEL_PROVIDER_NAME_EDIT_BUTTON =
  /* 模型供应商名称编辑按钮 */ "model-provider-name-edit-button";
export const TID_MODEL_PROVIDER_NAME_INPUT =
  /* 模型供应商名称编辑输入框 */ "model-provider-name-input";
export const TID_MODEL_PROVIDER_BASE_URL_INPUT =
  /* 模型供应商 Base URL 输入框 */ "model-provider-base-url-input";
export const TID_MODEL_PROVIDER_API_FORMAT_TRIGGER =
  /* 模型供应商 API 格式下拉触发器 */ "model-provider-api-format-trigger";
export const TID_MODEL_PROVIDER_API_FORMAT_ITEM =
  /* 模型供应商 API 格式下拉项（动态后缀为 API 格式） */ "model-provider-api-format-item";
export const TID_MODEL_PROVIDER_MODEL_INPUT =
  /* 模型供应商模型输入框（动态后缀为模型行号） */ "model-provider-model-input";
export const TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON =
  /* 模型供应商模型删除按钮（动态后缀为模型行号） */ "model-provider-model-delete-button";
export const TID_MODEL_PROVIDER_ADD_MODEL_BUTTON =
  /* 模型供应商添加模型按钮 */ "model-provider-add-model-button";

// Chat Toolbar
export const TID_CHAT_MODEL_SELECT_TRIGGER =
  /* 聊天工具栏模型选择按钮 */ "chat-model-select-trigger";
export const TID_CHAT_MODEL_SELECT_GROUP =
  /* 聊天工具栏模型供应商分组（动态后缀为 provider group key） */ "chat-model-select-group";
export const TID_CHAT_MODEL_SELECT_ITEM =
  /* 聊天工具栏模型选择条目（动态后缀为模型 value） */ "chat-model-select-item";
export const TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER =
  /* 聊天工具栏思考深度选择按钮 */ "chat-thought-level-select-trigger";
export const TID_CHAT_THOUGHT_LEVEL_SELECT_ITEM =
  /* 聊天工具栏思考深度选择条目（动态后缀为思考深度 value） */ "chat-thought-level-select-item";
export const TID_CHAT_MODE_SELECT_TRIGGER =
  /* 聊天工具栏模式选择按钮（v4 switchCollaborationMode e2e 锚点） */ "chat-mode-select-trigger";
export const TID_CHAT_MODE_SELECT_ITEM =
  /* 聊天工具栏模式选择条目（动态后缀为 mode value） */ "chat-mode-select-item";
export const TID_CHAT_CONTEXT_USAGE_TRIGGER =
  /* 聊天工具栏 context 消耗按钮 */ "chat-context-usage-trigger";
export const TID_CHAT_REASONING_TRIGGER = /* 思考块折叠触发按钮 */ "chat-reasoning-trigger";
export const TID_CHAT_REASONING_CONTENT = /* 思考块折叠内容容器 */ "chat-reasoning-content";

// Workspace
export const TID_WORKSPACE_HEADER = /* 主内容区 header */ "workspace-header";
export const TID_WORKSPACE_TITLE = /* 工作区标题 */ "workspace-title";
export const TID_WORKSPACE_PATH = /* 工作区路径 */ "workspace-path";
export const TID_WORKSPACE_MORE_BUTTON = /* 工作区 Header 更多菜单按钮 */ "workspace-more-button";
export const TID_WORKSPACE_HELP_MENU_TRIGGER =
  /* 右上角问号帮助菜单触发按钮 */ "workspace-help-menu-trigger";
export const TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER =
  /* 问号帮助菜单里的「资源管理器」项（仅桌面端） */ "workspace-help-menu-resource-manager";
export const TID_WORKSPACE_FILE_TREE_BUTTON =
  /* 侧边栏打开工作区文件树按钮（动态后缀为 workspacePath） */ "workspace-file-tree-button";
export const TID_WORKSPACE_FILE_TREE_PANEL = /* 工作区文件树面板 */ "workspace-file-tree-panel";
export const TID_WORKSPACE_FILE_TREE_REFRESH_BUTTON =
  /* 工作区文件树刷新按钮 */ "workspace-file-tree-refresh-button";
export const TID_WORKSPACE_FILE_TREE_ROW =
  /* 工作区文件树条目（动态后缀为文件绝对路径） */ "workspace-file-tree-row";
// SSH 错误提示
export const TID_SSH_ERROR = /* SSH 连接错误信息 */ "ssh-error";
export const TID_SSH_SUCCESS = /* SSH 连接成功提示 */ "ssh-success";

// V4 会话 pane（protocol-v4 竖切；定位协议带 paneId 维度：同 session 双 pane 时靠 paneId 后缀区分）
export const TID_V4_SESSION_PANE = /* v4 会话 pane 容器（动态后缀为 paneId） */ "v4-session-pane";
export const TID_V4_TIMELINE = /* v4 消息时间线容器 */ "v4-timeline";
export const TID_V4_TIMELINE_EMPTY = /* v4 时间线空态占位 */ "v4-timeline-empty";
export const TID_V4_ROW = /* v4 投影行（动态后缀为 rowId） */ "v4-row";
export const TID_V4_WORKSPACE_HOOK_PENDING_BANNER =
  /* v4 工作区 Hook 待审核提示条容器 */ "v4-workspace-hook-pending-banner";
export const TID_V4_WORKSPACE_HOOK_PENDING_REVIEW =
  /* v4 工作区 Hook 待审核提示条「去审核」按钮 */ "v4-workspace-hook-pending-review";
export const TID_V4_WORKSPACE_HOOK_PENDING_DISMISS =
  /* v4 工作区 Hook 待审核提示条「忽略」按钮 */ "v4-workspace-hook-pending-dismiss";
export const TID_V4_COMPOSER = /* v4 composer 容器 */ "v4-composer";
export const TID_V4_COMPOSER_INPUT = /* v4 composer 文本输入 */ "v4-composer-input";
export const TID_V4_COMPOSER_BACKGROUND_WORK_TRIGGER =
  /* v4 composer 当前会话后台任务入口 */ "v4-composer-background-work-trigger";
export const TID_V4_COMPOSER_CUA_ENTRY =
  /* v4 composer 电脑操作（CUA）常驻入口按钮 */ "v4-composer-cua-entry";
export const TID_V4_COMPOSER_SEND = /* v4 composer 发送按钮 */ "v4-composer-send";
export const TID_V4_COMPOSER_CLEAR_QUEUE_SEND =
  /* v4 暂停队列发送确认：清空队列并发送 */ "v4-composer-clear-queue-send";
export const TID_V4_COMPOSER_KEEP_QUEUE_SEND =
  /* v4 暂停队列发送确认：保留队列并发送 */ "v4-composer-keep-queue-send";
export const TID_V4_PAUSED_QUEUE_SEND_DIALOG =
  /* v4 暂停队列发送确认弹窗 */ "v4-paused-queue-send-dialog";
export const TID_V4_ATTACHMENT = /* V4 composer 附件 chip（动态后缀为附件 id） */ "v4-attachment";
export const TID_V4_ATTACHMENT_UPLOAD_PROGRESS =
  /* V4 composer 附件上传进度（动态后缀为附件 id） */ "v4-attachment-upload-progress";
export const TID_V4_ATTACHMENT_UPLOAD_RETRY =
  /* V4 composer 附件上传重试（动态后缀为附件 id） */ "v4-attachment-upload-retry";
export const TID_V4_STOP = /* v4 stop 按钮 */ "v4-stop";
export const TID_V4_FORK = /* v4 assistant 行 fork 按钮（动态后缀为 rowId） */ "v4-fork";
export const TID_V4_RETRY = /* v4 assistant 行 retry 按钮（动态后缀为 rowId） */ "v4-retry";
export const TID_V4_FEEDBACK_LIKE =
  /* v4 assistant 行点赞按钮（动态后缀为 rowId） */ "v4-feedback-like";
export const TID_V4_FEEDBACK_DISLIKE =
  /* v4 assistant 行点踩按钮（动态后缀为 rowId） */ "v4-feedback-dislike";
export const TID_V4_HOOK_DETAILS_TRIGGER =
  /* v4 turn Hook 详情按钮（动态后缀为 product turnId） */ "v4-hook-details-trigger";
export const TID_V4_HOOK_DETAILS_CONTENT =
  /* v4 turn Hook 详情 Popover（动态后缀为 product turnId） */ "v4-hook-details-content";
export const TID_V4_EDIT = /* v4 user 行 edit 按钮（动态后缀为 rowId） */ "v4-edit";
export const TID_V4_EDIT_INPUT = /* v4 user query 编辑输入框（动态后缀为 rowId） */ "v4-edit-input";
export const TID_V4_EDIT_SUBMIT =
  /* v4 user query 编辑提交按钮（动态后缀为 rowId） */ "v4-edit-submit";
export const TID_V4_EDIT_CANCEL =
  /* v4 user query 编辑取消按钮（动态后缀为 rowId） */ "v4-edit-cancel";
export const TID_V4_EDIT_ATTACHMENT_REMOVE =
  /* v4 user query 编辑附件删除按钮（动态后缀为 rowId-index） */ "v4-edit-attachment-remove";
export const TID_V4_EDIT_REWIND_WORKSPACE = /* testid 逐字冻结 */ "v4-edit-rewind-workspace";
export const TID_V4_EDIT_WORKSPACE_CONFLICT_DIALOG =
  /* v4 edit 文件冲突弹窗 */ "v4-edit-workspace-conflict-dialog";
export const TID_V4_EDIT_WORKSPACE_CONFLICT_CONVERSATION_ONLY =
  /* v4 edit 文件冲突后降级为仅裁剪对话 */ "v4-edit-workspace-conflict-conversation-only";
export const TID_V4_QUEUE = /* v4 queue 面板容器 */ "v4-queue";
export const TID_V4_QUEUE_PAUSED_BANNER = /* v4 暂停队列原因/恢复提示条 */ "v4-queue-paused-banner";
export const TID_V4_QUEUE_RESUME = /* v4 暂停队列继续自动消费按钮 */ "v4-queue-resume";
// v4 queue 项行内编辑输入框（动态后缀为 queueItemId）
export const TID_V4_QUEUE_ITEM = /* v4 queue 项（动态后缀为 queueItemId） */ "v4-queue-item";
export const TID_V4_QUEUE_ITEM_DELETE =
  /* v4 queue 项删除按钮（动态后缀为 queueItemId） */ "v4-queue-item-delete";
export const TID_V4_QUEUE_ITEM_EDIT =
  /* v4 queue 项编辑按钮（动态后缀为 queueItemId） */ "v4-queue-item-edit";
export const TID_V4_QUEUE_ITEM_SEND_NOW =
  /* v4 queue 项立即发送按钮（动态后缀为 queueItemId） */ "v4-queue-item-send-now";
export const TID_V4_QUEUE_ITEM_UP =
  /* v4 queue 项上移按钮（动态后缀为 queueItemId） */ "v4-queue-item-up";
export const TID_V4_AUTODRAIN_TOGGLE =
  /* v4 输入控制：queue autoDrain 开关按钮（setAutoDrain 命令） */ "v4-autodrain-toggle";
export const TID_V4_FOLLOWUP_TOGGLE =
  /* v4 输入控制：followup 路由模式开关按钮（setFollowupMode 命令） */ "v4-followup-toggle";
export const TID_V4_SESSION_TITLE =
  /* v4 会话标题显示（meta.title，空则显示占位） */ "v4-session-title";
export const TID_V4_RENAME_INPUT =
  /* v4 会话重命名输入框（renameSession 命令） */ "v4-rename-input";
export const TID_V4_RENAME_SUBMIT =
  /* v4 会话重命名提交按钮（renameSession 命令） */ "v4-rename-submit";
export const TID_V4_GOAL_BANNER =
  /* v4 goal 状态横幅（objective + status，sendGoalCommand/resumeGoal 效果投影） */ "v4-goal-banner";
export const TID_V4_DELETE_SESSION =
  /* v4 会话删除按钮（deleteSession 命令；删除后回 draft） */ "v4-delete-session";
export const TID_V4_BACKGROUND_WORKS =
  /* v4 后台工作面板（backgroundWorks 投影） */ "v4-background-works";
export const TID_V4_BACKGROUND_WORK_ITEM =
  /* v4 后台工作项（动态后缀为 workId） */ "v4-background-work-item";
export const TID_V4_BACKGROUND_WORK_CANCEL =
  /* v4 后台工作取消按钮（cancelBackgroundWork 命令；动态后缀为 workId） */ "v4-background-work-cancel";
export const TID_V4_MODEL_CONFIG =
  /* v4 模型配置显示（data-provider/data-model/data-thought，switchModelConfig 效果投影） */ "v4-model-config";
// v4-model-provider-input / v4-model-model-input / v4-model-thought-input /
// v4-model-apply（调试表单）已退役——模型切换由 composer 工具条的
// TID_CHAT_MODEL_SELECT_* / TID_CHAT_THOUGHT_LEVEL_SELECT_* 承载。
export const TID_V4_RETRY_SUBSCRIBE = /* v4 订阅失败重连按钮 */ "v4-retry-subscribe";
export const TID_V4_USER_INPUT_DIALOG = /* v4 userInput 交互弹窗容器 */ "v4-user-input-dialog";
export const TID_V4_USER_INPUT_OPTION =
  /* v4 userInput 选项按钮（动态后缀为 optionId） */ "v4-user-input-option";
export const TID_V4_USER_INPUT_TEXT = /* v4 userInput 自由文本输入 */ "v4-user-input-text";
export const TID_V4_TIMELINE_BOTTOM =
  /* v4 时间线「回到底部」按钮（解除底部跟随后出现，虚拟滚动锚定） */ "v4-timeline-bottom";
export const TID_V4_PANE_SHELL =
  /* v4 pane 外壳（Layout/Focus 层包装，动态后缀为 paneId；data-focused 标记焦点 pane，分屏） */ "v4-pane-shell";
export const TID_V4_SPLIT_OPEN =
  /* v4 向右拆分窗格按钮（pane header；一期为「打开分屏」，二期语义泛化为拆分） */ "v4-split-open";
export const TID_V4_SPLIT_DOWN = /* v4 向下拆分窗格按钮（pane header，网格布局） */ "v4-split-down";
export const TID_V4_SPLIT_CLOSE =
  /* v4 关闭窗格按钮（非 primary pane header；一期为「关闭分屏」） */ "v4-split-close";
export const TID_V4_SPLIT_DIVIDER =
  /* v4 分屏拖拽分隔条（pointer 拖动调宽；data-split-id 标记分割节点） */ "v4-split-divider";
export const TID_V4_PANE_WORKSPACE_BADGE =
  /* v4 pane header 的 workspace 徽标（跨 workspace pane 显示归属） */ "v4-pane-workspace-badge";
export const TID_V4_TASK_OPEN_IN_SPLIT =
  /* 侧栏会话项上下文菜单「在分屏打开」（仅桌面 shell，收尾） */ "v4-task-open-in-split";
export const TID_V4_TIMELINE_LOAD_OLDER =
  /* v4 时间线「加载更早」按钮（游标分页；窗口首行未到全序首行时出现） */ "v4-timeline-load-older";
export const TID_V4_TURN_NAVIGATOR =
  /* v4 对话轮次全局导航 rail（宽屏 2+ 可导航 turn 时出现） */ "v4-turn-navigator";
export const TID_V4_TURN_NAVIGATOR_ITEM =
  /* v4 对话轮次导航项（动态后缀为 render unit key） */ "v4-turn-navigator-item";
export const TID_V4_TURN_NAVIGATOR_TOOLTIP =
  /* v4 对话轮次导航 HoverCard 预览（动态后缀为 render unit key） */ "v4-turn-navigator-tooltip";
export const TID_V4_SUBAGENT_TOGGLE =
  /* v4 subagent 行下钻开关（动态后缀为 rowId；有 childSessionId 才可点） */ "v4-subagent-toggle";
export const TID_V4_SUBAGENT_DRILLDOWN =
  /* v4 subagent 下钻迷你时间线容器（动态后缀为 childSessionId） */ "v4-subagent-drilldown";
// v4 subagent 下钻「在分屏打开」入口（动态后缀为 childSessionId）
export const TID_V4_SUBAGENT_OPEN_SPLIT =
  /* @deprecated subagent 详情已迁移到右侧 tabs；保留常量避免外部旧测试编译失败。 */ "v4-subagent-open-split";
export const TID_V4_SUBAGENT_OPEN_SIDE_PANE = /* testid 逐字冻结 */ "v4-subagent-open-side-pane";
export const TID_V4_ROW_ATTACHMENTS =
  /* v4 userInput 行附件列表（动态后缀为 rowId） */ "v4-row-attachments";

// Plugin 商店
export const TID_PLUGIN_STORE_BROWSE =
  /* Plugin 设置页里进入插件商店的入口按钮（商店是 WorkspaceShell 主视图，不是设置页分区） */ "plugin-store-browse";

// Automations / 定时任务
export const TID_AUTOMATIONS_OPEN = /* testid 逐字冻结 */ "automations-open";
export const TID_AUTOMATIONS_LIST = /* testid 逐字冻结 */ "automations-list";
export const TID_AUTOMATIONS_STATUS_FILTER =
  /* 定时 / 闲时列表共用的状态筛选胶囊行（全部 / 进行中 / 已完成 / 失败） */ "automations-status-filter";
export const TID_AUTOMATION_CREATE_MENU = /* testid 逐字冻结 */ "automation-create-menu";
export const TID_AUTOMATION_CREATE_MANUALLY = /* testid 逐字冻结 */ "automation-create-manually";
export const TID_AUTOMATION_CARD = /* testid 逐字冻结 */ "automation-card";
// 闲时任务（off-peak，独立面）
export const TID_OFFPEAK_CREATE_BUTTON = /* testid 逐字冻结 */ "offpeak-create-button";
export const TID_OFFPEAK_CARD = /* testid 逐字冻结 */ "offpeak-card";
export const TID_OFFPEAK_CARD_SESSION =
  /* 闲时卡片脚注：绑定会话标题（会话内创建）。 */ "offpeak-card-session";
export const TID_OFFPEAK_CARD_MENU = /* testid 逐字冻结 */ "offpeak-card-menu";
export const TID_OFFPEAK_EDIT_VIEW = /* testid 逐字冻结 */ "offpeak-edit-view";
export const TID_OFFPEAK_EDIT_SUBMIT = /* testid 逐字冻结 */ "offpeak-edit-submit";
export const TID_OFFPEAK_FORM_TITLE = /* testid 逐字冻结 */ "offpeak-form-title";
export const TID_OFFPEAK_FORM_INSTRUCTIONS = /* testid 逐字冻结 */ "offpeak-form-instructions";
export const TID_OFFPEAK_ACTION_PAUSE = /* testid 逐字冻结 */ "offpeak-action-pause";
export const TID_OFFPEAK_ACTION_CONTINUE = /* testid 逐字冻结 */ "offpeak-action-continue";
export const TID_OFFPEAK_ACTION_DELETE = /* testid 逐字冻结 */ "offpeak-action-delete";
export const TID_OFFPEAK_TAB = /* testid 逐字冻结 */ "offpeak-tab";
export const TID_AUTOMATION_CARD_MENU = /* testid 逐字冻结 */ "automation-card-menu";
export const TID_AUTOMATION_ACTION_TOGGLE = /* testid 逐字冻结 */ "automation-action-toggle";
export const TID_AUTOMATION_ACTION_DELETE = /* testid 逐字冻结 */ "automation-action-delete";
export const TID_AUTOMATION_FORM_TITLE = /* testid 逐字冻结 */ "automation-form-title";
export const TID_AUTOMATION_FORM_PROMPT = /* testid 逐字冻结 */ "automation-form-prompt";
export const TID_AUTOMATION_FORM_SUBMIT = /* testid 逐字冻结 */ "automation-form-submit";
export const TID_AUTOMATION_RUN_NOW = /* testid 逐字冻结 */ "automation-run-now";
export const TID_AUTOMATION_EDIT_BACK = /* testid 逐字冻结 */ "automation-edit-back";
// 调度 builder / 自定义重复 / 年度月日选择器（e2e 稳定锚点）
export const TID_AUTOMATION_FREQUENCY_SELECT = /* testid 逐字冻结 */ "automation-frequency-select";
export const TID_AUTOMATION_FREQUENCY_OPTION = /* testid 逐字冻结 */ "automation-frequency-option";
export const TID_AUTOMATION_CUSTOM_UNIT_SELECT =
  /* testid 逐字冻结 */ "automation-custom-unit-select";
export const TID_AUTOMATION_CUSTOM_UNIT_OPTION =
  /* testid 逐字冻结 */ "automation-custom-unit-option";
export const TID_AUTOMATION_CUSTOM_INTERVAL_SELECT =
  /* testid 逐字冻结 */ "automation-custom-interval-select";
export const TID_AUTOMATION_CUSTOM_INTERVAL_INCREMENT =
  /* testid 逐字冻结 */ "automation-custom-interval-increment";
export const TID_AUTOMATION_CUSTOM_INTERVAL_DECREMENT =
  /* testid 逐字冻结 */ "automation-custom-interval-decrement";
export const TID_AUTOMATION_CUSTOM_INTERVAL_OPTION =
  /* testid 逐字冻结 */ "automation-custom-interval-option";
export const TID_AUTOMATION_CUSTOM_REPEAT_EDIT =
  /* testid 逐字冻结 */ "automation-custom-repeat-edit";
export const TID_AUTOMATION_CUSTOM_CONFIRM = /* testid 逐字冻结 */ "automation-custom-confirm";
export const TID_AUTOMATION_YEAR_MONTHDAY = /* testid 逐字冻结 */ "automation-year-monthday";
export const TID_AUTOMATION_YEAR_MONTH_OPTION =
  /* testid 逐字冻结 */ "automation-year-month-option";
export const TID_AUTOMATION_YEAR_DAY_OPTION = /* testid 逐字冻结 */ "automation-year-day-option";
export const TID_AUTOMATION_SCHEDULE_PREVIEW = /* testid 逐字冻结 */ "automation-schedule-preview";
export const TID_AUTOMATION_SCHEDULE_ADD = /* testid 逐字冻结 */ "automation-schedule-add";
export const TID_AUTOMATION_SCHEDULE_DELETE = /* testid 逐字冻结 */ "automation-schedule-delete";
export const TID_CRON_CREATE_CARD = /* testid 逐字冻结 */ "cron-create-card";
export const TID_CRON_CREATE_OPEN = /* testid 逐字冻结 */ "cron-create-open";
export const TID_OFFPEAK_CREATE_CARD = /* testid 逐字冻结 */ "offpeak-create-card";
export const TID_OFFPEAK_CREATE_OPEN = /* testid 逐字冻结 */ "offpeak-create-open";
export const TID_CONFIRM_DIALOG_CONFIRM = /* testid 逐字冻结 */ "confirm-dialog-confirm";

// 为动态元素生成带后缀的 testid，如 file-tree-item-/home/user
export function testId(base: string, suffix: string): string {
  return `${base}-${suffix}`;
}

export const TID_START_PLAN_RECOMMENDATION_DIALOG =
  /* testid 逐字冻结 */ "start-plan-recommendation-dialog";

export const TID_FEEDBACK_LOGS_OPT_IN = /* 用户反馈的诊断日志授权开关 */ "feedback-logs-opt-in";
