!macro customInit
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
  !insertmacro setInstallModePerUser
  StrCpy $INSTDIR "C:\${APP_FILENAME}"
  !insertmacro GetDParameter $R0
  ${If} $R0 != ""
    StrCpy $INSTDIR $R0
  ${EndIf}
!macroend

!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    Abort
  !endif
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\yayamsg" "" "URL:牙牙消息"
  WriteRegStr SHCTX "Software\Classes\yayamsg" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\yayamsg\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\yayamsg\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro removeYayaProtocol ROOT
  Push $R0
  ReadRegStr $R0 ${ROOT} "Software\Classes\yayamsg\shell\open\command" ""
  ${If} $R0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
    DeleteRegKey ${ROOT} "Software\Classes\yayamsg"
  ${EndIf}
  Pop $R0
!macroend

!macro customUnInstall
  !insertmacro removeYayaProtocol SHCTX
  !insertmacro removeYayaProtocol HKCU
!macroend
