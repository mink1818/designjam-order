Option Explicit
Dim shell, appDir, helper, requestUri, command
Set shell = CreateObject("WScript.Shell")
appDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DesignSocksKakao"
helper = appDir & "\DESIGN_SOCKS_KAKAO_SEARCH.ps1"
If WScript.Arguments.Count = 0 Then WScript.Quit 1
requestUri = Replace(WScript.Arguments(0), """", "")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & helper & """ """ & requestUri & """"
shell.Run command, 0, False
