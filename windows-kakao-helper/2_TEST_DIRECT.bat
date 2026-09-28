@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\DesignSocksKakao\DESIGN_SOCKS_KAKAO_SEARCH.ps1" "designsocks-kakao://search?name=%EA%B9%80%ED%98%81"
if errorlevel 1 pause
