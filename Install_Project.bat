@echo off
setlocal enabledelayedexpansion
title Air-Gap AI Installer
color 0B

echo ===================================================
echo        AIR-GAP AI : ONE-CLICK INSTALLER
echo ===================================================
echo.
echo This script will install everything needed to run Air-Gap AI on this PC.
echo.

:: 1. Check Python
echo [1/4] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is missing! Attempting to install via winget...
    winget install Python.Python.3.11 --silent
    echo Please restart this installer after Python finishes installing!
    pause
    exit /b
) else (
    echo [OK] Python is installed.
)

:: 2. Check Ollama
echo.
echo [2/4] Checking Ollama Engine...
ollama --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Ollama is missing! Installing via winget...
    winget install Ollama.Ollama --silent
    echo Please ensure Ollama is running in your taskbar!
) else (
    echo [OK] Ollama is installed.
)

:: 3. Download AI Models
echo.
echo [3/4] Downloading required AI Models to your machine (this may take a while)...
echo Pulling Llama 3.2 (Brain)...
ollama pull llama3.2
echo Pulling Llava (Vision)...
ollama pull llava
echo [OK] AI Models downloaded successfully.

:: 4. Build Environment & Desktop Shortcut
echo.
echo [4/4] Building Virtual Environment and Desktop Shortcut...
if not exist ".venv\Scripts\activate.bat" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r backend\requirements.txt

:: Create Desktop Shortcut using PowerShell
set SCRIPT="%TEMP%\CreateShortcut.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = "%USERPROFILE%\Desktop\Air-Gap AI.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "%~dp0Start_Project.bat" >> %SCRIPT%
echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
echo oLink.Description = "Launch Air-Gap AI" >> %SCRIPT%
echo oLink.IconLocation = "%~dp0frontend\favicon.ico" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%
cscript /nologo %SCRIPT%
del %SCRIPT%

echo.
echo ===================================================
echo   INSTALLATION COMPLETE!
echo ===================================================
echo You can now double-click the "Air-Gap AI" icon on your Desktop to start the app.
echo.
pause
