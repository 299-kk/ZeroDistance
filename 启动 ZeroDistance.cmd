@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "native-launcher\out\ZeroDistance.exe" (
  echo 请先在项目目录运行 npm run build:native
  pause
  exit /b 1
)
start "" "%~dp0native-launcher\out\ZeroDistance.exe"
