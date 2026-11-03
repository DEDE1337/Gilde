@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ModCheck online
node scripts/online.mjs
pause
