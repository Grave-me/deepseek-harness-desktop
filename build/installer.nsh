!include "WordFunc.nsh"
!insertmacro VersionCompare

!macro customInit
  ReadRegStr $R0 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 != ""
    ${VersionCompare} "$R0" "${VERSION}" $R1
    ${If} $R1 == "1"
      IfSilent +2
      MessageBox MB_ICONSTOP|MB_OK "A newer version ($R0) is already installed. Uninstall it before installing ${VERSION}."
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend
