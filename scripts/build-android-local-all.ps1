# بناء APK محلي للمنسق والسائق مع زيادة رقم الإصدار تلقائياً
$ErrorActionPreference = "Stop"
$buildScript = Join-Path $PSScriptRoot "build-android-local.ps1"

Write-Host "==> Building coordinator..." -ForegroundColor Cyan
& $buildScript -App coordinator
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "==> Building driver..." -ForegroundColor Cyan
& $buildScript -App driver
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "ALL BUILDS OK — see dist\android\" -ForegroundColor Green
