@echo off
title Rate My Meal - Expo Dev Server (LAN Mode)
echo ========================================================
echo  Starting Rate My Meal with Expo (LAN Mode)
echo  Make sure your phone and PC are on the same Wi-Fi
echo ========================================================
cd /d "%~dp0"
call npx.cmd expo start
pause
