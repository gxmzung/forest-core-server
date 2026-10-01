@echo off
setlocal
cd /d %~dp0

if "%FIELDLINK_HOST%"=="" set "FIELDLINK_HOST=0.0.0.0"
if "%FIELDLINK_PORT%"=="" set "FIELDLINK_PORT=18080"
if "%FIELDLINK_DATA_FILE%"=="" set "FIELDLINK_DATA_FILE=.\data\fieldlink-state.json"

echo ========================================
echo FieldLink LAN Messenger
echo ========================================
echo HOST=%FIELDLINK_HOST%
echo PORT=%FIELDLINK_PORT%
echo DATA=%FIELDLINK_DATA_FILE%

call npm run fieldlink
