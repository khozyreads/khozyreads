@echo off
REM ============================================================
REM KhozyReads — Start Local Server (Node.js based)
REM ============================================================

cd /d "%~dp0"
title KhozyReads Local Server

echo.
echo ===========================================
echo   KhozyReads Local Server
echo ===========================================
echo.
echo   Buyer:  http://localhost:5500/index.html
echo   Admin:  http://localhost:5500/admin.html
echo.
echo   Tutup server: close window ini (klik X)
echo ===========================================
echo.
echo Starting server...
echo (kalau pertama kali jalanin, npx akan download ^~5MB, sabar 10-30 detik)
echo.

start "" "http://localhost:5500/admin.html"
call npx --yes serve -p 5500 --no-port-switching

echo.
echo Server berhenti.
pause
