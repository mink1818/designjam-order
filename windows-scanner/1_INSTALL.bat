@echo off
chcp 65201 > nul
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
pause
