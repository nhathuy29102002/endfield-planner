@echo off
rem Build ban ung dung may tinh (Tauri) tren Windows: EndfieldAICPlanner.exe + bo cai NSIS.
rem Nap moi truong cua Visual Studio Build Tools 2022 truoc (may co them ban VS Community thieu thu vien C++,
rem Rust se chon nham ban do va bao "cannot open file msvcrt.lib").
rem Khong dung khoi "if (...)" quanh %VCVARS%: dau ")" trong "Program Files (x86)" se dong khoi lenh som.
setlocal
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if exist "%VCVARS%" goto found
echo Khong tim thay Visual Studio Build Tools 2022: "%VCVARS%"
exit /b 1
:found
call "%VCVARS%" >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "%~dp0.."
if not exist node_modules call npm install
call npx tauri build
if errorlevel 1 exit /b 1
echo.
echo Xong:
echo   src-tauri\target\release\EndfieldAICPlanner.exe
echo   src-tauri\target\release\bundle\nsis\
