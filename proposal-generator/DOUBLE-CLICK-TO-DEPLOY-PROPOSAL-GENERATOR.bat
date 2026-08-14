@echo off
title Aurevya - Wire Proposal Generator into Portal
color 0E

cd /d "%~dp0"
echo.
echo   ================================================================
echo    AUREVYA WEALTH - Linking the new Proposal Generator into
echo    the Staff Portal's "AI Tools" menu
echo   ================================================================
echo.

set PY=
where python >nul 2>&1 && set PY=python
if "%PY%"=="" (where py >nul 2>&1 && set PY=py)

if "%PY%"=="" (
  echo   [X] Python was not found on this computer.
  echo       Install it from https://www.python.org/downloads/
  echo       IMPORTANT: tick "Add Python to PATH" during setup.
  echo.
  pause
  exit /b 1
)

echo   Using: %PY%
echo.
%PY% deploy-to-portal.py

echo.
echo   ================================================================
echo    If you see "Done:" above, drag the new zip file it named
echo    onto your Netlify site to deploy the change.
echo   ================================================================
echo.
pause
