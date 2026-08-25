@echo off
cd /d %~dp0
start "SKIET parity monitor server" node server.js
timeout /t 1 >nul
start "" http://localhost:8788
