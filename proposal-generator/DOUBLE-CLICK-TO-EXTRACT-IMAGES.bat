@echo off
title Aurevya - Extract Proposal Images
color 0E

cd /d "%~dp0"
echo.
echo   ================================================================
echo    AUREVYA WEALTH - Extracting brand images from sample proposals
echo   ================================================================
echo.
echo   Working folder: %CD%
echo.

REM ---- locate a Python interpreter -------------------------------------
set PY=
where python >nul 2>&1 && set PY=python
if "%PY%"=="" (where py >nul 2>&1 && set PY=py)

if "%PY%"=="" (
  echo   [X] Python was not found on this computer.
  echo.
  echo       Install it from https://www.python.org/downloads/
  echo       IMPORTANT: tick "Add Python to PATH" during setup.
  echo.
  pause
  exit /b 1
)

echo   [1/3] Python found: %PY%

REM ---- ensure PyMuPDF is available -------------------------------------
%PY% -c "import fitz" >nul 2>&1
if errorlevel 1 (
  echo   [2/3] Installing PyMuPDF ^(one-time, ~30 seconds^)...
  %PY% -m pip install --quiet --disable-pip-version-check pymupdf
  if errorlevel 1 (
    echo.
    echo   [X] Could not install PyMuPDF.
    echo       Try running this by hand in a terminal:
    echo         %PY% -m pip install pymupdf
    echo.
    pause
    exit /b 1
  )
) else (
  echo   [2/3] PyMuPDF already installed.
)

REM ---- run the extractor ------------------------------------------------
echo   [3/3] Extracting images...
echo.
%PY% extract-assets.py

echo.
echo   ================================================================
echo    Done. Look in the "assets" folder next to this file.
echo    Open  assets\SUGGESTED-MAPPING.md  to see which image
echo    belongs in which slot of the proposal.
echo   ================================================================
echo.
pause
