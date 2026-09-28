@echo off
chcp 65001 >nul
set "APPDIR=%LOCALAPPDATA%\DesignSocksKakao"
if not exist "%APPDIR%" mkdir "%APPDIR%"
copy /Y "%~dp0DESIGN_SOCKS_KAKAO_SEARCH.ps1" "%APPDIR%\DESIGN_SOCKS_KAKAO_SEARCH.ps1" >nul

reg add "HKCU\Software\Classes\designsocks-kakao" /ve /d "URL:DESIGN SOCKS Kakao Search" /f >nul
reg add "HKCU\Software\Classes\designsocks-kakao" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\designsocks-kakao\DefaultIcon" /ve /d "%%SystemRoot%%\System32\WindowsPowerShell\v1.0\powershell.exe,0" /f >nul
reg add "HKCU\Software\Classes\designsocks-kakao\shell\open\command" /ve /d "\"%%SystemRoot%%\System32\WindowsPowerShell\v1.0\powershell.exe\" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%APPDIR%\DESIGN_SOCKS_KAKAO_SEARCH.ps1\" \"%%1\"" /f >nul

echo.
echo DESIGN SOCKS 카톡 찾기 설치가 완료되었습니다.
echo ERP에서 카톡 찾기 버튼을 누른 뒤 브라우저의 프로그램 열기를 허용하세요.
echo 자동 전송이나 대화방 선택은 하지 않습니다.
echo.
pause
