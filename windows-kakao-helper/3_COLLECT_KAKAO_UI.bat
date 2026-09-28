@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0COLLECT_KAKAO_UI.ps1"
if errorlevel 1 pause
