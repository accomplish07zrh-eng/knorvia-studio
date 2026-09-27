; 仅负责安装器的品牌呈现，安装目录保护、更新清理和快捷方式仍由原流程拥有。
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "151515"
!define MUI_INSTFILESPAGE_COLORS "151515 FFFFFF"
!define MUI_FINISHPAGE_TITLE "$(KnorviaFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(KnorviaFinishText)"
!define MUI_FINISHPAGE_RUN_TEXT "$(KnorviaRunText)"
!define MUI_UNFINISHPAGE_TEXT "$(KnorviaUninstallText)"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(KnorviaWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(KnorviaWelcomeText)"
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro KnorviaBrandLanguageStrings
  LangString KnorviaWelcomeTitle 2052 "欢迎来到 Knorvia Studio"
  LangString KnorviaWelcomeTitle 1033 "Welcome to Knorvia Studio"
  LangString KnorviaWelcomeText 2052 "一张安静的工作台。$\r$\n$\r$\n把多个 Agent 内核、对话与创作，放在同一处。$\r$\n$\r$\n接下来选择安装位置。安装完成后，你可以从桌面或开始菜单打开 Knorvia Studio。$\r$\n$\r$\n无需注册 Knorvia 账号。你的设置与会话保存在本机用户目录。"
  LangString KnorviaWelcomeText 1033 "A quiet place to work.$\r$\n$\r$\nBring your agents, conversations and creative work together.$\r$\n$\r$\nChoose an installation folder, then open Knorvia Studio from your desktop or Start menu.$\r$\n$\r$\nNo Knorvia account required. Settings and conversations stay in your local user profile."
  LangString KnorviaFinishTitle 2052 "工作台已就绪"
  LangString KnorviaFinishTitle 1033 "Your workspace is ready"
  LangString KnorviaFinishText 2052 "Knorvia Studio 已安装完成。$\r$\n$\r$\n桌面与开始菜单的快捷方式，随时带你回到工作台。$\r$\n$\r$\n首次使用时，请在模型设置中配置你自己的模型服务。"
  LangString KnorviaFinishText 1033 "Knorvia Studio is installed.$\r$\n$\r$\nReturn to your workspace from the desktop or Start menu.$\r$\n$\r$\nOn first launch, configure your own model service in Model settings."
  LangString KnorviaRunText 2052 "打开 Knorvia Studio"
  LangString KnorviaRunText 1033 "Open Knorvia Studio"
  LangString KnorviaUninstallText 2052 "Knorvia Studio 已卸载。$\r$\n$\r$\n保存在用户目录的个人设置与会话不会随程序删除。"
  LangString KnorviaUninstallText 1033 "Knorvia Studio has been removed.$\r$\n$\r$\nYour personal settings and conversations in the user profile are preserved."
!macroend
