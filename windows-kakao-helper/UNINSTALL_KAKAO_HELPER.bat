@echo off
chcp 65001 >nul
reg delete "HKCU\Software\Classes\designsocks-kakao" /f >nul 2>&1
if exist "%LOCALAPPDATA%\DesignSocksKakao\DESIGN_SOCKS_KAKAO_SEARCH.ps1" del /Q "%LOCALAPPDATA%\DesignSocksKakao\DESIGN_SOCKS_KAKAO_SEARCH.ps1"
if exist "%LOCALAPPDATA%\DesignSocksKakao" rmdir "%LOCALAPPDATA%\DesignSocksKakao" 2>nul
echo DESIGN SOCKS 카톡 찾기가 제거되었습니다.
pause
