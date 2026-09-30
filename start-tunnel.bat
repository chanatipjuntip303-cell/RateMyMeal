@echo off
title Rate My Meal - Expo Dev Server (Tunnel Mode)
echo ========================================================
echo  Starting Rate My Meal with Expo Tunnel Mode
echo  This allows connecting from any phone using Expo Go
echo ========================================================
cd /d "%~dp0"
call npx.cmd expo start --tunnel
pause
