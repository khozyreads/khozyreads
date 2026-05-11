# ============================================================
# KhozyReads — Cleanup Script
# ============================================================
# Hapus semua file legacy dari versi Apps Script.
# Yang dipertahankan cuma file untuk Supabase + Vercel setup.
#
# Cara pakai:
#   1. Buka PowerShell
#   2. cd "C:\Users\USER\Documents\KhozyReads Website"
#   3. Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   4. .\cleanup.ps1
#
# Script ini akan tanya konfirmasi sebelum hapus.
# ============================================================

$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "=== KhozyReads Cleanup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Akan menghapus file legacy berikut:" -ForegroundColor Yellow
Write-Host ""

# Files to delete (root level)
$rootFiles = @(
    'Code.gs',
    'README.md',
    'admin-books.html',
    'admin-orders.html',
    'admin-settings.html',
    'admin.js',
    'api-client.js',
    'app.js',
    'auth.js',
    'book.html',
    'content-protection.js',
    'fallback-auth.js',
    'i18n.js',
    'library.html',
    'login.html',
    'nav-state.js',
    'payment.html',
    'placeholder-cover.svg',
    'reader.html',
    'register.html',
    'seller-dashboard.html',
    'seller-login.html',
    'server.err.log',
    'server.out.log',
    'style.css'
)

# Folders to delete
$folders = @(
    'apps-script',
    'assets',
    'google-apps-script',
    '.npm-cache',
    'supabase\.temp',
    'supabase\functions\approve-order',
    'supabase\functions\reject-order',
    'supabase\functions\telegram-webhook'
)

# Old docs
$oldDocs = @(
    'docs\deployment.md',
    'docs\storage.md',
    'docs\testing-checklist.md'
)

# Show summary
Write-Host "Files (root):" -ForegroundColor White
foreach ($f in $rootFiles) { if (Test-Path $f) { Write-Host "  - $f" -ForegroundColor Gray } }

Write-Host ""
Write-Host "Folders:" -ForegroundColor White
foreach ($f in $folders) { if (Test-Path $f) { Write-Host "  - $f\" -ForegroundColor Gray } }

Write-Host ""
Write-Host "Old docs:" -ForegroundColor White
foreach ($f in $oldDocs) { if (Test-Path $f) { Write-Host "  - $f" -ForegroundColor Gray } }

Write-Host ""
Write-Host "Yang DIPERTAHANKAN:" -ForegroundColor Green
Write-Host "  - index.html"
Write-Host "  - admin.html"
Write-Host "  - config.js (akan diupdate)"
Write-Host "  - config.example.js"
Write-Host "  - .gitignore"
Write-Host "  - INSTALL.md"
Write-Host "  - cleanup.ps1 (script ini)"
Write-Host "  - docs\MIGRATION_PLAN.md"
Write-Host "  - docs\SETUP_SUPABASE.md"
Write-Host "  - supabase\migrations\*.sql"
Write-Host "  - supabase\functions\get-pdf-url\"
Write-Host "  - supabase\functions\notify-telegram\"
Write-Host ""

$confirm = Read-Host "Lanjutkan hapus? (y/n)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Dibatalkan." -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Menghapus..." -ForegroundColor Cyan

$deleted = 0
$failed = 0

# Delete root files
foreach ($f in $rootFiles) {
    if (Test-Path $f) {
        try {
            Remove-Item -Path $f -Force -ErrorAction Stop
            Write-Host "  [DEL] $f" -ForegroundColor Gray
            $deleted++
        } catch {
            Write-Host "  [FAIL] $f - $_" -ForegroundColor Red
            $failed++
        }
    }
}

# Delete folders (recursive)
foreach ($f in $folders) {
    if (Test-Path $f) {
        try {
            Remove-Item -Path $f -Recurse -Force -ErrorAction Stop
            Write-Host "  [DEL] $f\" -ForegroundColor Gray
            $deleted++
        } catch {
            Write-Host "  [FAIL] $f\ - $_" -ForegroundColor Red
            $failed++
        }
    }
}

# Delete old docs
foreach ($f in $oldDocs) {
    if (Test-Path $f) {
        try {
            Remove-Item -Path $f -Force -ErrorAction Stop
            Write-Host "  [DEL] $f" -ForegroundColor Gray
            $deleted++
        } catch {
            Write-Host "  [FAIL] $f - $_" -ForegroundColor Red
            $failed++
        }
    }
}

Write-Host ""
Write-Host "=== Selesai ===" -ForegroundColor Green
Write-Host "Dihapus: $deleted item" -ForegroundColor Green
if ($failed -gt 0) { Write-Host "Gagal: $failed item" -ForegroundColor Red }
Write-Host ""
Write-Host "LANGKAH BERIKUTNYA:" -ForegroundColor Yellow
Write-Host "1. Edit config.js — ganti dengan Supabase URL + anon key"
Write-Host "   (lihat config.example.js untuk contoh)"
Write-Host "2. Refresh browser di admin.html"
Write-Host ""
