; The detached terminal Provider runs from a renamed image under LOCALAPPDATA so
; an application update cannot kill it by install path or CleanCode.exe image
; name. electron-builder also invokes the old uninstaller while updating, so the
; isUpdated guard is required: only a real uninstall owns Provider termination
; and runtime-image removal.
;
; Runtime images live in a per-user LOCALAPPDATA tree. Keep fresh installs and
; existing per-user updates in current-user mode, while preserving the mode of
; a legacy machine-wide install. If both modes exist, electron-builder keeps
; the mode page so the user can choose which installation to update.
!ifndef BUILD_UNINSTALLER
!macro customInstallMode
  ${If} $hasPerMachineInstallation == "1"
  ${AndIf} $hasPerUserInstallation == "0"
    StrCpy $isForceMachineInstall "1"
  ${ElseIf} $hasPerMachineInstallation == "0"
    StrCpy $isForceCurrentInstall "1"
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec 'taskkill /T /F /IM cleancode-terminal-provider.exe'
    Sleep 500
    ; An elevated legacy all-users uninstaller switches shell variables to the
    ; all-users context. Temporarily restore the invoking user's LOCALAPPDATA;
    ; new installs are per-user, and no environment-derived delete root is used.
    SetShellVarContext current
    RMDir /r "$LOCALAPPDATA\CleanCode\terminal-provider-host"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
  ${endIf}
!macroend
