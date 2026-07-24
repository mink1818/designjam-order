@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo DESIGN SOCKS SCANNER - first setup and EXE build
echo ================================================
echo.

set "PYTHON_CMD="
where py >nul 2>nul
if errorlevel 1 goto :no_python_manager

echo Checking Python 3.13...
py -3.13 -c "import sys; print(sys.version_info[:2] == (3, 13))" 2>nul | findstr /x "True" >nul
if errorlevel 1 (
    echo Python 3.13 is required for the scanner builder.
    echo Installing Python 3.13...
    py install 3.13
    if errorlevel 1 goto :python_install_failed
)

py -3.13 -c "import sys; print(sys.version_info[:2] == (3, 13))" 2>nul | findstr /x "True" >nul
if errorlevel 1 goto :python_install_failed
set "PYTHON_CMD=py -3.13"

echo [1/3] Installing required packages...
%PYTHON_CMD% -m pip install --upgrade pip
if errorlevel 1 goto :failed

%PYTHON_CMD% -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo [2/3] Building DESIGN_SOCKS_SCANNER.exe...
%PYTHON_CMD% -m PyInstaller --noconfirm --clean --onefile --windowed --name "DESIGN_SOCKS_SCANNER" design_socks_scanner.py
if errorlevel 1 goto :failed

if not exist "dist\DESIGN_SOCKS_SCANNER.exe" goto :failed

echo.
echo [3/3] Copying EXE to this folder...
copy /Y "dist\DESIGN_SOCKS_SCANNER.exe" "DESIGN_SOCKS_SCANNER.exe" >nul
if errorlevel 1 goto :failed

echo.
echo ================================================
echo COMPLETE
echo Run DESIGN_SOCKS_SCANNER.exe in this folder.
echo ================================================
pause
exit /b 0

:no_python_manager
echo.
echo [ERROR] Python Install Manager was not found.
echo Install Python from https://www.python.org/downloads/windows/
echo and run this file again.
pause
exit /b 1

:python_install_failed
echo.
echo [ERROR] Python 3.13 installation failed.
echo Open Command Prompt and run: py install 3.13
echo Then run this file again.
pause
exit /b 1

:failed
echo.
echo ================================================
echo [ERROR] EXE build failed.
echo Please take a screenshot of this window.
echo ================================================
pause
exit /b 1
