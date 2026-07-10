@echo off
setlocal

set "SRC=%~dp0"
set "DST=C:\Users\leoat\Documents\GitHub\khu-weaver-v3"

echo.
echo KHU-Weaver v3 sync
echo Source: "%SRC%"
echo Target: "%DST%"
echo.

if not exist "%DST%\" (
  echo Target folder does not exist.
  echo "%DST%"
  pause
  exit /b 1
)

robocopy "%SRC%" "%DST%" /E ^
  /XD ".git" ".agents" ".codex" "node_modules" ^
  /XF ".env" "server.err.log" "server.out.log" "sync-to-github.bat"

set "RC=%ERRORLEVEL%"
echo.

if %RC% GEQ 8 (
  echo Sync failed. Robocopy exit code: %RC%
  pause
  exit /b %RC%
)

echo Sync complete. You can now commit and push from:
echo "%DST%"
pause
exit /b 0
