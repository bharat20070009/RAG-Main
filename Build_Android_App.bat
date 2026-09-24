@echo off
setlocal enabledelayedexpansion
title Air-Gap AI : Android Builder
color 0A

echo ===================================================
echo     AIR-GAP AI : ANDROID PLAY STORE BUILDER
echo ===================================================
echo.

set NODE="C:\Program Files\nodejs\node.exe"
set NPM="C:\Program Files\nodejs\npm.cmd"
set NPX="C:\Program Files\nodejs\npx.cmd"

:: 1. Check for Node.js
echo [1/4] Checking for Node.js (Required for Mobile Build)...
%NODE% -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is missing! Installing via winget...
    winget install OpenJS.NodeJS --silent
    echo.
    echo IMPORTANT: Node.js was just installed. You must close this window and double-click this script again to continue!
    pause
    exit /b
) else (
    echo [OK] Node.js is installed.
)

:: 2. Setup Mobile Directory
echo.
echo [2/4] Setting up Android Project structure...
if not exist "mobile_app" mkdir mobile_app
if not exist "mobile_app\www" mkdir mobile_app\www

:: Copy UI assets to the mobile web folder
copy index.html mobile_app\www\index.html >nul
copy locallens_logo.jpg mobile_app\www\locallens_logo.jpg >nul
copy favicon.ico mobile_app\www\favicon.ico >nul

cd mobile_app

:: 3. Initialize Mobile Project
echo.
echo [3/4] Initializing Capacitor framework...
if not exist "package.json" (
    call %NPM% init -y >nul
    call %NPM% install @capacitor/core @capacitor/cli @capacitor/android >nul
    call %NPX% cap init "Air Gap AI" "com.airgap.ai" --web-dir "www" >nul
)

:: 4. Add Android Platform
echo.
echo [4/4] Generating Android Studio Project...
if not exist "android" (
    call %NPX% cap add android >nul
)
call %NPX% cap sync >nul

echo.
echo ===================================================
echo   ANDROID PROJECT GENERATED SUCCESSFULLY!
echo ===================================================
echo.
echo Your mobile app code is now ready inside the "mobile_app/android" folder!
echo To open and compile it into an .apk file, you will need to download Android Studio.
echo.
pause
