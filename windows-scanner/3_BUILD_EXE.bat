@echo off
chcp 65001 > nul
python -m PyInstaller --noconfirm --onefile --windowed --name "DESIGN_SOCKS_SCANNER" design_socks_scanner.py
if exist dist\DESIGN_SOCKS_SCANNER.exe echo EXE 생성완료: dist\DESIGN_SOCKS_SCANNER.exe
pause
