@echo off
chcp 65101 > nul
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
pause
