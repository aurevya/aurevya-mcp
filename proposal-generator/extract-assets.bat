@echo off
REM Aurevya Proposal Generator - brand asset extractor
REM Double-click this file to pull the photography out of the sample PDFs.

cd /d "%~dp0"
echo.
echo  Aurevya Wealth - extracting brand assets from sample proposals
echo  ==============================================================
echo.

python -c "import fitz" 2>nul
if errorlevel 1 (
  echo  Installing PyMuPDF...
  python -m pip install --quiet pymupdf
  if errorlevel 1 (
    echo.
    echo  Could not install PyMuPDF. Is Python on your PATH?
    echo  Try:  py -m pip install pymupdf
    echo.
    pause
    exit /b 1
  )
)

python extract-assets.py

echo.
pause
