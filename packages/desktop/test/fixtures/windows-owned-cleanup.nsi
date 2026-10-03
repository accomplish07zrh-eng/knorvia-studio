Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Knorvia owned cleanup fixture"
OutFile "${KNORVIA_FIXTURE_OUTPUT}"

!include LogicLib.nsh
!define BUILD_UNINSTALLER
; 只隔离这三个外层边界；清理循环、路径保护、Delete/RMDir 与日志调用都来自生产宏。
!define isUpdated `${KNORVIA_FIXTURE_UPDATED} == 1`
!define KNORVIA_UNINSTALLER_FUNCTION_PREFIX ""
!define KNORVIA_INSTALLER_IS_ELEVATED_INNER `0 == 1`
!define KNORVIA_UNINSTALLER_LOG_PATH "$EXEDIR\cleanup.log"
!define UNINSTALL_FILENAME "Uninstall Knorvia Studio.exe"
!define BUILD_RESOURCES_DIR "${KNORVIA_FIXTURE_RESOURCES}"
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
LangString KnorviaUninstallOwnershipMissing 1033 "Ownership manifest is missing; reinstall before uninstalling."

Section "actual production cleanup"
  StrCpy $INSTDIR "${KNORVIA_FIXTURE_TARGET}"
  !insertmacro customRemoveFiles
SectionEnd

Function .onInstFailed
  SetErrorLevel 2
FunctionEnd

Function .onInstSuccess
  SetErrorLevel 0
FunctionEnd
