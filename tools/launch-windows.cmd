@echo off
rem Mo Endfield AIC Planner tren trinh duyet bang mot cu bam (Windows).
rem Tao shortcut cua file nay ra Desktop (chuot phai > Send to > Desktop).
rem Luon dung CUNG cong 4178: du lieu luu trong trinh duyet theo dia chi.
cd /d "%~dp0.."
curl -s -o nul --max-time 1 http://localhost:4178/ && goto open
if not exist node_modules call npm install
if not exist dist\index.html call npm run build
start "Endfield AIC Planner - server" /min cmd /c "npx vite preview --port 4178 --strictPort"
set /a n=0
:wait
timeout /t 1 >nul
curl -s -o nul --max-time 1 http://localhost:4178/ && goto open
set /a n+=1
if %n% lss 20 goto wait
:open
start "" http://localhost:4178/
