@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo DESIGN SOCKS Scanner setup and EXE build
call 1_INSTALL.bat
if errorlevel 1 pause & exit /b 1
call 3_BUILD_EXE.bat
if errorlevel 1 pause & exit /b 1
if exist dist\DESIGN_SOCKS_SCANNER.exe copy /Y dist\DESIGN_SOCKS_SCANNER.exe DESIGN_SOCKS_SCANNER.exe > nul
if exist dist\design_socks_scanner.exe copy /Y dist\design_socks_scanner.exe DESIGN_SOCKS_SCANNER.exe > nul
echo.
echo Complete. Run DESIGN_SOCKS_SCANNER.exe from this folder.
pause
