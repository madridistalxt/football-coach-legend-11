@echo off
chcp 65001 >nul
title 足球教练-传奇11人
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js 18 或更高版本。
  echo https://nodejs.org/
  pause
  exit /b 1
)
set OPEN_BROWSER=1
node server.mjs
pause
