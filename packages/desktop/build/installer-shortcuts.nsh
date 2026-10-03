; 只拥有首次安装的快捷方式选项；更新/同目录覆盖继续走原 KeepShortcuts 流程。
!ifndef BUILD_UNINSTALLER
  Var KnorviaDesktopShortcutChoice
  Var KnorviaStartMenuShortcutChoice
  Var KnorviaShortcutOptionsAccepted
  Var KnorviaDesktopShortcutControl
  Var KnorviaStartMenuShortcutControl

  !macro KnorviaInitializeShortcutOptions
    StrCpy $KnorviaDesktopShortcutChoice ${BST_CHECKED}
    StrCpy $KnorviaStartMenuShortcutChoice ${BST_CHECKED}
    StrCpy $KnorviaShortcutOptionsAccepted "0"
  !macroend

  !macro KnorviaShortcutOptionsPage
    Function KnorviaShowShortcutOptions
      ; 返回目录页后改选已有安装，不能沿用前一次新目录的 checkbox 状态来干预旧链接。
      StrCpy $KnorviaShortcutOptionsAccepted "0"
      IfSilent knorviaShortcutOptionsSkip
      ${if} ${isUpdated}
        Goto knorviaShortcutOptionsSkip
      ${endif}
      StrCpy $R0 "$INSTDIR"
      ${StrContains} $R1 "${APP_FILENAME}" "$R0"
      StrCmp $R1 "" 0 knorviaShortcutOptionsDirectoryReady
        StrCpy $R0 "$R0\${APP_FILENAME}"
      knorviaShortcutOptionsDirectoryReady:
      ${if} ${FileExists} "$R0\${APP_EXECUTABLE_FILENAME}"
        Goto knorviaShortcutOptionsSkip
      ${endif}

      !insertmacro MUI_HEADER_TEXT "$(KnorviaShortcutTitle)" "$(KnorviaShortcutSubtitle)"
      nsDialogs::Create 1018
      Pop $0
      StrCmp $0 error knorviaShortcutOptionsFailed
      ${NSD_CreateLabel} 0u 0u 300u 40u "$(KnorviaShortcutDescription)"
      Pop $0
      ${NSD_CreateCheckbox} 0u 54u 300u 16u "$(KnorviaDesktopShortcutText)"
      Pop $KnorviaDesktopShortcutControl
      ${NSD_SetState} $KnorviaDesktopShortcutControl $KnorviaDesktopShortcutChoice
      ${if} ${isNoDesktopShortcut}
        ${NSD_SetState} $KnorviaDesktopShortcutControl ${BST_UNCHECKED}
        EnableWindow $KnorviaDesktopShortcutControl 0
      ${endif}
      !ifdef DO_NOT_CREATE_DESKTOP_SHORTCUT
        ${NSD_SetState} $KnorviaDesktopShortcutControl ${BST_UNCHECKED}
        EnableWindow $KnorviaDesktopShortcutControl 0
      !endif
      ${NSD_CreateCheckbox} 0u 80u 300u 16u "$(KnorviaStartMenuShortcutText)"
      Pop $KnorviaStartMenuShortcutControl
      ${NSD_SetState} $KnorviaStartMenuShortcutControl $KnorviaStartMenuShortcutChoice
      !ifdef DO_NOT_CREATE_START_MENU_SHORTCUT
        ${NSD_SetState} $KnorviaStartMenuShortcutControl ${BST_UNCHECKED}
        EnableWindow $KnorviaStartMenuShortcutControl 0
      !endif
      nsDialogs::Show
      Return

      knorviaShortcutOptionsFailed:
        MessageBox MB_OK|MB_ICONSTOP "$(KnorviaShortcutPageFailed)"
        SetErrorLevel 1
        Quit
      knorviaShortcutOptionsSkip:
        Abort
    FunctionEnd

    Function KnorviaAcceptShortcutOptions
      ${NSD_GetState} $KnorviaDesktopShortcutControl $KnorviaDesktopShortcutChoice
      ${NSD_GetState} $KnorviaStartMenuShortcutControl $KnorviaStartMenuShortcutChoice
      StrCpy $KnorviaShortcutOptionsAccepted "1"
    FunctionEnd

    Page custom KnorviaShowShortcutOptions KnorviaAcceptShortcutOptions
  !macroend

  !macro customInstallShortcuts
    ${if} $KnorviaShortcutOptionsAccepted == "1"
      ${if} $KnorviaStartMenuShortcutChoice == ${BST_CHECKED}
        !insertmacro addStartMenuLink $keepShortcuts
      ${endif}
      ${if} $KnorviaDesktopShortcutChoice == ${BST_CHECKED}
        !insertmacro addDesktopLink $keepShortcuts
      ${endif}
    ${else}
      ; 静默安装、自动更新及已有目录覆盖不新增选择，保留默认 flag 和固定项行为。
      !insertmacro addStartMenuLink $keepShortcuts
      !insertmacro addDesktopLink $keepShortcuts
    ${endif}
  !macroend
!endif
