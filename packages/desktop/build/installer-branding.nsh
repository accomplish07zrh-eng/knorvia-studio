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
  LangString KnorviaWelcomeTitle 2052 "Knorvia Studio"
  LangString KnorviaWelcomeTitle 1033 "Knorvia Studio"
  ; 安装范围页在目录页之前，不能把“下一步”说成直接选择位置；采用 UI PR28 简洁文案并对齐真实页序。
  LangString KnorviaWelcomeText 2052 "欢迎安装 Knorvia Studio。$\r$\n$\r$\n接下来按向导确认安装范围、安装位置和快捷方式，再开始安装。$\r$\n$\r$\n点击“下一步”继续。"
  LangString KnorviaWelcomeText 1033 "Welcome to Knorvia Studio.$\r$\n$\r$\nFollow the wizard to confirm who can use this app, its installation folder and shortcuts.$\r$\n$\r$\nClick Next to continue."
  LangString KnorviaFinishTitle 2052 "Knorvia Studio"
  LangString KnorviaFinishTitle 1033 "Knorvia Studio"
  LangString KnorviaFinishText 2052 "安装完成。$\r$\n$\r$\n点击“完成”关闭安装向导。$\r$\n$\r$\n首次使用时，可在模型设置中配置模型服务。"
  LangString KnorviaFinishText 1033 "Installation complete.$\r$\n$\r$\nClick Finish to close the installer.$\r$\n$\r$\nOn first launch, you can configure a model service in Model settings."
  LangString KnorviaRunText 2052 "打开 Knorvia Studio"
  LangString KnorviaRunText 1033 "Open Knorvia Studio"
  LangString KnorviaUninstallText 2052 "Knorvia Studio 已卸载。$\r$\n$\r$\n保存在用户目录的个人设置与会话不会随程序删除。"
  LangString KnorviaUninstallText 1033 "Knorvia Studio has been removed.$\r$\n$\r$\nYour personal settings and conversations in the user profile are preserved."
  !ifndef BUILD_UNINSTALLER
  LangString KnorviaInstallingSubtitle 2052 "正在安装，请稍候。"
  LangString KnorviaInstallingSubtitle 1033 "Installing. Please wait."
  LangString KnorviaShortcutTitle 2052 "选择快捷方式"
  LangString KnorviaShortcutTitle 1033 "Choose your shortcuts"
  LangString KnorviaShortcutSubtitle 2052 "按你的习惯打开工作台"
  LangString KnorviaShortcutSubtitle 1033 "Open your workspace your way"
  LangString KnorviaShortcutDescription 2052 "选择要创建的快捷方式。$\r$\n不创建快捷方式也能从安装目录打开 Knorvia Studio。"
  LangString KnorviaShortcutDescription 1033 "Choose which shortcuts to create.$\r$\nYou can also open Knorvia Studio from its installation folder."
  LangString KnorviaDesktopShortcutText 2052 "在桌面创建快捷方式"
  LangString KnorviaDesktopShortcutText 1033 "Create a desktop shortcut"
  LangString KnorviaStartMenuShortcutText 2052 "在开始菜单创建快捷方式"
  LangString KnorviaStartMenuShortcutText 1033 "Create a Start menu shortcut"
  LangString KnorviaShortcutPageFailed 2052 "无法显示快捷方式选项，安装已停止。请重新运行安装器。"
  LangString KnorviaShortcutPageFailed 1033 "Unable to show shortcut options. Setup has stopped. Please run the installer again."
  !endif
!macroend
