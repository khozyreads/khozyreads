@echo off
REM ============================================================
REM KhozyReads Cleanup — Double-click file ini untuk hapus
REM file legacy dari versi Apps Script lama.
REM ============================================================

cd /d "%~dp0"

echo.
echo === KhozyReads Cleanup ===
echo.
echo Akan hapus file legacy. Tekan Ctrl+C kalau mau cancel.
echo.
pause

PowerShell.exe -ExecutionPolicy Bypass -File "%~dp0cleanup.ps1"

echo.
echo Selesai. Tekan ENTER untuk close.
pause >nul
